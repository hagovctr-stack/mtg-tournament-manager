import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, type TournamentDetail, type RoundDetail } from '../api';
import { PlayerList } from '../components/PlayerList';
import { PairingsTable } from '../components/PairingsTable';
import { StandingsTable } from '../components/StandingsTable';
import { Timer } from '../components/Timer';
import { DraftPod } from '../components/DraftPod';
import { joinTournament, getSocket } from '../socket';

type Tab = 'players' | 'pairings' | 'standings';

export function Tournament() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [tab, setTab] = useState<Tab>('players');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [isRandomizingSeats, setIsRandomizingSeats] = useState(false);

  // Edit tournament state
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editFormat, setEditFormat] = useState('');
  const [editSubtitle, setEditSubtitle] = useState('');
  const [editCubeCobraUrl, setEditCubeCobraUrl] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const t = await api.getTournament(id);
      setTournament(t);
    } catch {
      setError('Failed to load tournament');
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    document.title = tournament
      ? `${tournament.name} | MTG Tournament Manager`
      : 'Tournament | MTG Tournament Manager';
  }, [tournament]);

  useEffect(() => {
    if (!id) return;
    joinTournament(id);
    const socket = getSocket();
    const onUpdate = () => refresh();
    socket.on('pairings_updated', onUpdate);
    socket.on('standings_updated', onUpdate);
    socket.on('result_reported', onUpdate);
    socket.on('round_started', onUpdate);
    return () => {
      socket.off('pairings_updated', onUpdate);
      socket.off('standings_updated', onUpdate);
      socket.off('result_reported', onUpdate);
      socket.off('round_started', onUpdate);
    };
  }, [id, refresh]);

  const handleStart = async () => {
    if (!id || !confirm('Start the tournament?')) return;
    setLoading(true);
    try {
      await api.startTournament(id);
      await refresh();
      setTab(
        tournament?.format === 'Cube' || tournament?.format === 'Draft' ? 'players' : 'pairings',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateRound = async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      await api.generateRound(id);
      await refresh();
      setTab('pairings');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generating round');
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = async () => {
    if (!id || !confirm('End the tournament and finalize standings?')) return;
    try {
      await api.finishTournament(id);
      await refresh();
      setTab('standings');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  const handleDeleteTournament = async () => {
    if (!id || !tournament) return;
    if (deleteConfirmation !== tournament.name) return;

    setDeleteLoading(true);
    setError('');
    try {
      await api.deleteTournament(id);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deleting tournament');
      setDeleteLoading(false);
    }
  };

  const handleRandomizeSeats = async () => {
    if (!id) return;
    setIsRandomizingSeats(true);
    setError('');
    try {
      await api.randomizeSeats(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error randomizing seats');
    } finally {
      setIsRandomizingSeats(false);
    }
  };

  const openEdit = () => {
    if (!tournament) return;
    setEditName(tournament.name);
    setEditFormat(tournament.format);
    setEditSubtitle(tournament.subtitle);
    setEditCubeCobraUrl(tournament.cubeCobraUrl ?? '');
    setShowEdit(true);
  };

  const handleUpdateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setEditSubmitting(true);
    setError('');
    try {
      await api.updateTournament(id, {
        name: editName.trim() || undefined,
        format: editFormat || undefined,
        subtitle: editSubtitle.trim(),
        cubeCobraUrl: editCubeCobraUrl.trim() || null,
      });
      await refresh();
      setShowEdit(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error updating tournament');
    } finally {
      setEditSubmitting(false);
    }
  };

  if (!tournament) {
    return <div className="text-center py-16 text-gray-400">Loading...</div>;
  }

  const currentRound = tournament.rounds.find((r) => r.number === tournament.currentRound) as
    | RoundDetail
    | undefined;

  const isSeatBasedTournament = tournament.format === 'Cube' || tournament.format === 'Draft';
  const activePlayers = tournament.players.filter((player) => player.active);
  const allActivePlayersSeated =
    activePlayers.length > 0 && activePlayers.every((player) => player.seatNumber != null);
  const hasSeatAssignments = activePlayers.some((player) => player.seatNumber != null);
  const canRandomizeSeats =
    isSeatBasedTournament &&
    tournament.status === 'ACTIVE' &&
    tournament.currentRound === 0 &&
    tournament.rounds.length === 0;
  const showDraftPod =
    isSeatBasedTournament &&
    (tournament.status === 'REGISTRATION' || canRandomizeSeats || hasSeatAssignments);

  const allResultsIn = currentRound?.matches.every((m) => m.result !== 'PENDING') ?? false;

  const canGenerateRound =
    tournament.status === 'ACTIVE' &&
    (tournament.currentRound === 0 || allResultsIn) &&
    tournament.currentRound < tournament.totalRounds &&
    (!isSeatBasedTournament || tournament.currentRound > 0 || allActivePlayersSeated);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'players', label: 'Players' },
    { key: 'pairings', label: 'Pairings' },
    { key: 'standings', label: 'Standings' },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <Link to="/" className="text-blue-500 text-sm hover:underline">
            ← Back
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{tournament.name}</h1>
          <p className="text-sm text-gray-500">
            {tournament.format}
            {tournament.subtitle ? ` · ${tournament.subtitle}` : ''} · {tournament.players.length}{' '}
            players · Round {tournament.currentRound}/{tournament.totalRounds || '?'}
          </p>
          {tournament.cubeCobraUrl && (
            <a
              href={tournament.cubeCobraUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:underline"
            >
              🧊 View cube list
            </a>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          {tournament.status === 'REGISTRATION' && (
            <button
              onClick={handleStart}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-semibold text-sm disabled:opacity-50"
            >
              Start Tournament
            </button>
          )}
          {canGenerateRound && (
            <button
              onClick={handleGenerateRound}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-semibold text-sm disabled:opacity-50"
            >
              {loading
                ? 'Generating...'
                : isSeatBasedTournament && tournament.currentRound === 0
                  ? 'Pair Round 1'
                  : `Pair Round ${tournament.currentRound + 1}`}
            </button>
          )}
          {tournament.status === 'ACTIVE' &&
            tournament.currentRound >= tournament.totalRounds &&
            allResultsIn && (
              <button
                onClick={handleFinish}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded font-semibold text-sm"
              >
                Finalize Tournament
              </button>
            )}
          <button
            onClick={() => api.exportCSV(tournament.id)}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded font-semibold text-sm"
          >
            Export CSV
          </button>
          <button
            onClick={openEdit}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded font-semibold text-sm"
          >
            Edit
          </button>
          <button
            onClick={() => {
              setShowDeleteConfirm((current) => !current);
              setDeleteConfirmation('');
            }}
            className="bg-red-50 hover:bg-red-100 text-red-700 px-4 py-2 rounded font-semibold text-sm"
          >
            Delete Tournament
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
          {error}
        </div>
      )}

      {showEdit && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-semibold text-blue-800 mb-3">Edit Tournament</p>
          <form onSubmit={handleUpdateTournament} className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Game Format</label>
                <select
                  value={editFormat}
                  onChange={(e) => setEditFormat(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Draft">Draft</option>
                  <option value="Sealed">Sealed</option>
                  <option value="Cube">Cube</option>
                  <option value="Standard">Standard</option>
                  <option value="Pioneer">Pioneer</option>
                  <option value="Modern">Modern</option>
                  <option value="Legacy">Legacy</option>
                  <option value="Vintage">Vintage</option>
                  <option value="Pauper">Pauper</option>
                  <option value="Commander">Commander</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Subtitle (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. OTJ, Premodern…"
                  value={editSubtitle}
                  onChange={(e) => setEditSubtitle(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {editFormat === 'Cube' && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  Cube Cobra URL (optional)
                </label>
                <input
                  type="url"
                  placeholder="https://cubecobra.com/cube/list/…"
                  value={editCubeCobraUrl}
                  onChange={(e) => setEditCubeCobraUrl(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={editSubmitting}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
              >
                {editSubmitting ? 'Saving…' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={() => setShowEdit(false)}
                className="px-4 py-2 rounded text-sm text-gray-600 hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-800">Delete tournament</p>
          <p className="mt-1 text-sm text-red-700">
            This will permanently remove <span className="font-semibold">{tournament.name}</span>{' '}
            and all of its players, rounds, matches, and standings.
          </p>
          <p className="mt-3 text-sm text-red-700">
            Type <span className="font-mono font-semibold">{tournament.name}</span> to confirm.
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="text"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder="Tournament name"
              className="w-full max-w-md rounded border border-red-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <div className="flex gap-2">
              <button
                onClick={handleDeleteTournament}
                disabled={deleteLoading || deleteConfirmation !== tournament.name}
                className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteLoading ? 'Deleting...' : 'Permanently Delete'}
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmation('');
                }}
                className="rounded bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Round timer */}
      {tournament.status === 'ACTIVE' && currentRound?.status === 'ACTIVE' && (
        <div className="mb-6 p-4 bg-white border border-gray-200 rounded-lg text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
            Round {currentRound.number} Timer
          </p>
          <Timer durationMinutes={50} storageKey={`round-timer-${currentRound.id}`} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        {tab === 'players' && (
          <>
            {showDraftPod && (
              <DraftPod
                players={tournament.players}
                status={tournament.status}
                canRandomize={canRandomizeSeats}
                isRandomizing={isRandomizingSeats}
                onRandomize={handleRandomizeSeats}
              />
            )}
            <PlayerList
              tournamentId={tournament.id}
              players={tournament.players}
              canEdit={tournament.status === 'REGISTRATION'}
              onUpdate={refresh}
            />
          </>
        )}

        {tab === 'pairings' && (
          <div className="space-y-6">
            {tournament.rounds.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-8">No rounds generated yet.</p>
            )}
            {[...tournament.rounds]
              .sort((a, b) => b.number - a.number)
              .map((round) => (
                <div key={round.id}>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Round {round.number}{' '}
                    <span
                      className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                        round.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {round.status}
                    </span>
                  </h3>
                  <PairingsTable
                    matches={(round as RoundDetail).matches}
                    canReport={
                      tournament.status === 'ACTIVE' &&
                      (round.status === 'ACTIVE' || round.status === 'FINISHED')
                    }
                    bestOfFormat={tournament.bestOfFormat}
                    onUpdate={refresh}
                  />
                </div>
              ))}
          </div>
        )}

        {tab === 'standings' && (
          <StandingsTable
            tournamentId={tournament.id}
            standings={tournament.standings}
            finishedRounds={tournament.rounds
              .filter((r) => r.status === 'FINISHED')
              .map((r) => r.number)
              .sort((a, b) => a - b)}
            finished={tournament.status === 'FINISHED'}
          />
        )}
      </div>
    </div>
  );
}
