import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type LeagueDetail, type LeagueStanding } from '../api';
import { useAuth } from '../auth';
import { PageHeader } from '../components/PageHeader';
import { PlayerAvatar } from '../components/PlayerAvatar';

function formatDate(value: string) {
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

export function LeaguePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canManage } = useAuth();
  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [standings, setStandings] = useState<LeagueStanding[]>([]);
  const [error, setError] = useState('');

  // Edit state
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editStartsAt, setEditStartsAt] = useState('');
  const [editEndsAt, setEditEndsAt] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([api.getLeague(id), api.getLeagueStandings(id)])
      .then(([nextLeague, nextStandings]) => {
        setLeague(nextLeague);
        setStandings(nextStandings);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load league');
      });
  }, [id]);

  useEffect(() => {
    document.title = league ? `${league.name} | MTG Tournament Manager` : 'League';
  }, [league]);

  const openEdit = () => {
    if (!league) return;
    setEditName(league.name);
    // Convert ISO date to YYYY-MM-DD for date input
    setEditStartsAt(league.startsAt.slice(0, 10));
    setEditEndsAt(league.endsAt.slice(0, 10));
    setShowEdit(true);
    setError('');
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !league) return;
    setSaving(true);
    setError('');
    try {
      const updated = await api.updateLeague(id, {
        name: editName.trim(),
        startsAt: editStartsAt,
        endsAt: editEndsAt,
      });
      setLeague((prev) => (prev ? { ...prev, ...updated } : prev));
      setShowEdit(false);
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
      await api.deleteLeague(id);
      navigate('/leagues');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  if (!league) {
    return (
      <div className="px-4 py-16 text-center text-slate-400">{error || 'Loading league...'}</div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="League"
        title={league.name}
        compact
        meta={
          <>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              {formatDate(league.startsAt)} to {formatDate(league.endsAt)}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              {league.tournamentCount} {league.tournamentCount === 1 ? 'tournament' : 'tournaments'}
            </span>
          </>
        }
        actions={
          canManage ? (
            <div className="flex items-center gap-2">
              <button
                onClick={openEdit}
                title="Edit league"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-700 transition hover:border-slate-300"
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
                title="Delete league"
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 transition hover:bg-red-100"
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
          ) : undefined
        }
      />

      {error && (
        <div className="rounded-[1.2rem] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 shadow-sm">
          {error}
        </div>
      )}

      {/* Edit form */}
      {showEdit && canManage && (
        <form
          onSubmit={(e) => void saveEdit(e)}
          className="rounded-[1.75rem] border border-sky-200 bg-sky-50 p-5 space-y-3"
        >
          <p className="text-sm font-semibold text-sky-800">Edit League</p>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="League name"
            className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="date"
              value={editStartsAt}
              onChange={(e) => setEditStartsAt(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
            />
            <input
              type="date"
              value={editEndsAt}
              onChange={(e) => setEditEndsAt(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving || !editName.trim()}
              className="rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={() => setShowEdit(false)}
              disabled={saving}
              className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-[1.75rem] border border-red-200 bg-white p-7 shadow-[0_32px_80px_rgba(15,23,42,0.22)]">
              <h2 className="font-serif text-xl font-semibold text-slate-950">Delete league?</h2>
              <p className="mt-2 text-sm text-slate-600">
                This will permanently delete <strong>{league.name}</strong> and cannot be undone.
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

      <section className="rounded-[1.75rem] border border-white/80 bg-white/88 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
        <h2 className="font-serif text-2xl font-semibold tracking-tight text-slate-950">
          Season standings
        </h2>
        {standings.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No league standings yet.</p>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-[1.3rem] border border-stone-200 bg-white">
            <table className="min-w-[700px] w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[7%]" />
                <col className="w-[28%]" />
                <col className="w-[9%]" />
                <col className="w-[13%]" />
                <col className="w-[11%]" />
                <col className="w-[10%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
              </colgroup>
              <thead className="border-b border-stone-200 bg-stone-50/80">
                <tr className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <th className="pl-6 pr-3 py-3 text-left">Rank</th>
                  <th className="px-4 py-3 text-left">Player</th>
                  <th className="px-3 py-3 text-center">Pts</th>
                  <th className="px-3 py-3 text-center">W-L-D</th>
                  <th className="px-3 py-3 text-center">Win%</th>
                  <th className="px-3 py-3 text-center">Events</th>
                  <th className="px-3 py-3 text-center">🏆</th>
                  <th className="px-3 pr-6 py-3 text-center">🥇</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((entry) => (
                  <tr
                    key={entry.key}
                    className="border-b border-stone-100 text-sm transition hover:bg-stone-50/55"
                  >
                    <td className="pl-6 pr-3 py-4 whitespace-nowrap">
                      <span className="font-mono text-slate-600">{entry.rank}</span>
                    </td>
                    <td className="px-4 py-4 font-medium text-slate-800">
                      {entry.playerId ? (
                        <Link
                          to={`/players/${entry.playerId}`}
                          className="flex min-w-0 items-center gap-3 hover:underline"
                        >
                          <PlayerAvatar name={entry.name} avatarUrl={entry.avatarUrl} size="sm" />
                          <span className="truncate">{entry.name}</span>
                        </Link>
                      ) : (
                        <div className="flex min-w-0 items-center gap-3">
                          <PlayerAvatar name={entry.name} avatarUrl={entry.avatarUrl} size="sm" />
                          <span className="truncate">{entry.name}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-4 text-center font-bold text-slate-800">
                      {entry.matchPoints}
                    </td>
                    <td className="px-3 py-4 text-center text-slate-600">
                      {entry.matchWins}-{entry.matchLosses}-{entry.matchDraws}
                    </td>
                    <td className="px-3 py-4 text-center text-slate-500">
                      {formatPercent(entry.matchWinRate)}
                    </td>
                    <td className="px-3 py-4 text-center text-slate-500">
                      {entry.tournamentsPlayed}
                    </td>
                    <td className="px-3 py-4 text-center text-slate-600">
                      {entry.trophies > 0 ? (
                        <span className="font-semibold text-amber-600">{entry.trophies}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 pr-6 py-4 text-center text-slate-600">
                      {entry.teamDraftTrophies > 0 ? (
                        <span className="font-semibold text-yellow-600">
                          {entry.teamDraftTrophies}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-[1.75rem] border border-white/80 bg-white/88 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
        <h2 className="font-serif text-2xl font-semibold tracking-tight text-slate-950">
          Linked tournaments
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {league.tournaments.map((tournament) => (
            <Link
              key={tournament.id}
              to={`/tournament/${tournament.id}`}
              className="rounded-[1.35rem] border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-rose-200 hover:bg-white"
            >
              <p className="font-semibold text-slate-900">{tournament.name}</p>
              <p className="mt-1 text-sm text-slate-500">
                {tournament.format} · {tournament.playerCount}{' '}
                {tournament.playerCount === 1 ? 'player' : 'players'} · {tournament.status}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
