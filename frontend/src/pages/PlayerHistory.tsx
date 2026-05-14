import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type League, type PlayerSummary, type PlayerTournamentHistoryEntry } from '../api';
import { useAuth } from '../auth';
import { PageHeader } from '../components/PageHeader';

const HISTORY_BATCH_SIZE = 3;

function formatDate(value: string | null) {
  if (!value) return 'Never';
  const localDate = new Date(value.slice(0, 10).replace(/-/g, '/'));
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(localDate);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function statusBadge(status: PlayerTournamentHistoryEntry['status']) {
  const map = {
    REGISTRATION: 'bg-blue-100 text-blue-700',
    ACTIVE: 'bg-green-100 text-green-700',
    FINISHED: 'bg-gray-100 text-gray-600',
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[status]}`}>
      {status}
    </span>
  );
}

function trophyMarker(entry: PlayerTournamentHistoryEntry) {
  if (entry.earnedTrophy) return '🏆';
  if (entry.earnedTeamDraftTrophy) return '🥇';
  return null;
}

export function PlayerHistory() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canManage } = useAuth();
  const [summary, setSummary] = useState<PlayerSummary | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(HISTORY_BATCH_SIZE);
  const [leagueFilter, setLeagueFilter] = useState('');

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDci, setEditDci] = useState('');
  const [editElo, setEditElo] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setVisibleHistoryCount(HISTORY_BATCH_SIZE);

    Promise.all([api.getPlayerSummary(id, leagueFilter || undefined), api.listLeagues()])
      .then(([player, nextLeagues]) => {
        if (!cancelled) {
          setSummary(player);
          setLeagues(nextLeagues);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load player history');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, leagueFilter]);

  useEffect(() => {
    document.title = summary
      ? `${summary.name} | MTG Tournament Manager`
      : 'Player History | MTG Tournament Manager';
  }, [summary]);

  const startEdit = () => {
    if (!summary) return;
    setEditName(summary.name);
    setEditDci(summary.dciNumber ?? '');
    setEditElo(String(summary.rating));
    setIsEditing(true);
    setError('');
  };

  const cancelEdit = () => setIsEditing(false);

  const saveEdit = async () => {
    if (!id || !summary) return;
    setSaving(true);
    setError('');
    try {
      const updated = await api.updatePlayer(id, {
        name: editName.trim(),
        dciNumber: editDci.trim() || null,
        rating: Number(editElo),
      });
      setSummary((prev) => (prev ? { ...prev, ...updated } : prev));
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await api.deletePlayer(id);
      navigate('/players');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="px-4 py-16 text-center text-slate-400">Loading player history...</div>;
  }

  if (!summary) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Player"
          title="Player not found"
          backTo="/players"
          backLabel="Players"
        />
        <div className="rounded-[1.5rem] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error || 'Player not found'}
        </div>
      </div>
    );
  }

  const visibleHistory = summary.tournaments.slice(0, visibleHistoryCount);

  // Most played format
  const formatCounts = summary.tournaments.reduce<Record<string, number>>((acc, e) => {
    if (e.format) acc[e.format] = (acc[e.format] ?? 0) + 1;
    return acc;
  }, {});
  const mostPlayedFormat =
    Object.keys(formatCounts).length > 0
      ? Object.entries(formatCounts).sort((a, b) => b[1] - a[1])[0][0]
      : null;

  return (
    <div className="space-y-6">
      <div className="relative">
        <PageHeader
          eyebrow="Player"
          title={summary.name}
          description={`ELO ${summary.rating}${summary.dciNumber ? ` · ${summary.dciNumber}` : ''}`}
          compact
          meta={
            <>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                {summary.stats.tournamentsPlayed}{' '}
                {summary.stats.tournamentsPlayed === 1 ? 'tournament' : 'tournaments'}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                {summary.stats.trophies} {summary.stats.trophies === 1 ? 'trophy' : 'trophies'}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                {summary.stats.teamDraftTrophies} team draft{' '}
                {summary.stats.teamDraftTrophies === 1 ? 'trophy' : 'trophies'}
              </span>
            </>
          }
        />
        <div className="absolute top-5 right-5 sm:top-6 sm:right-7 flex flex-col items-center gap-3">
          <label className="relative group cursor-pointer shrink-0" title="Upload photo">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !id) return;
                try {
                  const updated = await api.uploadPlayerAvatar(id, file);
                  setSummary((prev) => (prev ? { ...prev, ...updated } : prev));
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Upload failed');
                } finally {
                  e.target.value = '';
                }
              }}
            />
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-slate-200 bg-slate-100 transition-colors group-hover:border-rose-300">
              {summary.avatarUrl ? (
                <img
                  src={summary.avatarUrl}
                  alt={summary.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="select-none text-2xl font-bold text-slate-400">
                  {summary.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-6 h-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
          </label>
          {canManage && !isEditing && (
            <div className="flex items-center gap-2">
              <button
                onClick={startEdit}
                title="Edit player"
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                title="Delete player"
                className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-red-500 transition hover:border-red-300 hover:bg-red-100"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {error}
        </div>
      )}

      {/* Edit form */}
      {isEditing && (
        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
          <h2 className="font-serif text-xl font-semibold text-slate-950 mb-5">Edit Player</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-1.5">
                Name
              </label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-xl border border-stone-200 bg-white/92 px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
                placeholder="Player name"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-1.5">
                DCI Number
              </label>
              <input
                value={editDci}
                onChange={(e) => setEditDci(e.target.value)}
                className="w-full rounded-xl border border-stone-200 bg-white/92 px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-1.5">
                ELO Rating
              </label>
              <input
                type="number"
                min={0}
                value={editElo}
                onChange={(e) => setEditElo(e.target.value)}
                className="w-full rounded-xl border border-stone-200 bg-white/92 px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
                placeholder="1500"
              />
            </div>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={() => void saveEdit()}
              disabled={saving || !editName.trim()}
              className="rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button
              onClick={cancelEdit}
              disabled={saving}
              className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-[1.75rem] border border-red-200 bg-white p-7 shadow-[0_32px_80px_rgba(15,23,42,0.22)]">
              <h2 className="font-serif text-xl font-semibold text-slate-950">Delete player?</h2>
              <p className="mt-2 text-sm text-slate-600">
                This will permanently delete <strong>{summary.name}</strong> and cannot be undone.
                Players with tournament history cannot be deleted.
              </p>
              <div className="mt-6 flex items-center gap-3">
                <button
                  onClick={() => void confirmDelete()}
                  disabled={deleting}
                  className="rounded-2xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {/* Row 1 */}
        <div className="flex flex-col items-center rounded-[1.6rem] border border-white/80 bg-white/88 p-5 text-center shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Current ELO</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">{summary.rating}</p>
        </div>
        <div className="flex flex-col items-center rounded-[1.6rem] border border-amber-100 bg-white/88 p-5 text-center shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Trophies</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">🏆 {summary.stats.trophies}</p>
          <p className="mt-1 text-sm text-slate-500">First place</p>
        </div>
        <div className="flex flex-col items-center rounded-[1.6rem] border border-yellow-100 bg-white/88 p-5 text-center shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Team Draft Trophies</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">
            🥇 {summary.stats.teamDraftTrophies}
          </p>
          <p className="mt-1 text-sm text-slate-500">Team wins</p>
        </div>
        <div className="flex flex-col items-center rounded-[1.6rem] border border-white/80 bg-white/88 p-5 text-center shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Tournaments</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">
            {summary.stats.tournamentsPlayed}
          </p>
          {summary.stats.activeRegistrations > 0 && (
            <p className="mt-1 text-sm text-slate-500">
              Active: {summary.stats.activeRegistrations}
            </p>
          )}
        </div>
        <div className="flex flex-col items-center rounded-[1.6rem] border border-white/80 bg-white/88 p-5 text-center shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Last Active</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">
            {formatDate(summary.stats.lastTournamentAt)}
          </p>
        </div>
        {/* Row 2 */}
        <div className="flex flex-col items-center rounded-[1.6rem] border border-white/80 bg-white/88 p-5 text-center shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Match Record</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">
            {summary.stats.matchWins}-{summary.stats.matchLosses}-{summary.stats.matchDraws}
          </p>
        </div>
        <div className="flex flex-col items-center rounded-[1.6rem] border border-white/80 bg-white/88 p-5 text-center shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Match Win Rate</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">
            {formatPercent(summary.stats.matchWinRate)}
          </p>
        </div>
        <div className="flex flex-col items-center rounded-[1.6rem] border border-white/80 bg-white/88 p-5 text-center shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Game Record</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">
            {summary.stats.gameWins}-{summary.stats.gameLosses}-{summary.stats.gameDraws}
          </p>
        </div>
        <div className="flex flex-col items-center rounded-[1.6rem] border border-white/80 bg-white/88 p-5 text-center shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Game Win Rate</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">
            {formatPercent(summary.stats.gameWinRate)}
          </p>
        </div>
        <div className="flex flex-col items-center rounded-[1.6rem] border border-white/80 bg-white/88 p-5 text-center shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Most Played Format</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">{mostPlayedFormat ?? '—'}</p>
          <p className="mt-1 text-sm text-slate-500">
            {mostPlayedFormat
              ? `${formatCounts[mostPlayedFormat]} ${formatCounts[mostPlayedFormat] === 1 ? 'event' : 'events'}`
              : 'No format data yet'}
          </p>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/80 bg-white/88 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-serif text-2xl font-semibold tracking-tight text-slate-950">
              Tournament history
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs text-slate-400">
              Showing {Math.min(visibleHistory.length, summary.tournaments.length)} of{' '}
              {summary.tournaments.length}
            </p>
            <select
              value={leagueFilter}
              onChange={(e) => setLeagueFilter(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
            >
              <option value="">All-time</option>
              {leagues.map((league) => (
                <option key={league.id} value={league.id}>
                  {league.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {summary.tournaments.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No tournament history yet.</div>
        ) : (
          <div className="mt-5 space-y-4">
            {visibleHistory.map((entry) => {
              const endingElo = entry.endingElo ?? entry.currentElo;
              const delta = endingElo - entry.startingElo;
              const deltaClass =
                delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-500';
              const marker = trophyMarker(entry);

              return (
                <article
                  key={entry.tournamentPlayerId}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <Link
                        to={`/tournament/${entry.tournamentId}`}
                        className="text-lg font-semibold text-gray-900 hover:text-blue-600"
                      >
                        {marker && <span className="mr-1">{marker}</span>}
                        {entry.name}
                      </Link>
                      <p className="mt-1 text-sm text-gray-500">
                        {formatDate(entry.playedAt)} · Registered as {entry.displayName}
                        {entry.leagueName ? ` · ${entry.leagueName}` : ''}
                      </p>
                    </div>
                    {statusBadge(entry.status)}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <div className="rounded-lg bg-white px-3 py-3">
                      <p className="text-xs uppercase tracking-wide text-gray-400">ELO Start</p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">
                        {entry.startingElo}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white px-3 py-3">
                      <p className="text-xs uppercase tracking-wide text-gray-400">
                        {entry.endingElo === null ? 'Live ELO' : 'ELO End'}
                      </p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">{endingElo}</p>
                    </div>
                    <div className="rounded-lg bg-white px-3 py-3">
                      <p className="text-xs uppercase tracking-wide text-gray-400">ELO Delta</p>
                      <p className={`mt-1 text-lg font-semibold ${deltaClass}`}>
                        {delta > 0 ? `+${delta}` : delta}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white px-3 py-3">
                      <p className="text-xs uppercase tracking-wide text-gray-400">Record</p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">
                        {entry.matchWins}-{entry.matchLosses}-{entry.matchDraws}
                      </p>
                      <p className="text-xs text-gray-500">
                        {entry.rank ? `Rank #${entry.rank}` : 'Rank pending'} · {entry.matchPoints}{' '}
                        pts
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {summary.tournaments.length > HISTORY_BATCH_SIZE && (
          <div className="mt-5 flex items-center gap-3">
            {visibleHistoryCount < summary.tournaments.length && (
              <button
                onClick={() => setVisibleHistoryCount((current) => current + HISTORY_BATCH_SIZE)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Show more
              </button>
            )}
            {visibleHistoryCount > HISTORY_BATCH_SIZE && (
              <button
                onClick={() => setVisibleHistoryCount(HISTORY_BATCH_SIZE)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100"
              >
                Show less
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
