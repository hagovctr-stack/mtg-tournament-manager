import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Player, type PlayerListItem } from '../api';
import { PlayerAvatar } from './PlayerAvatar';

interface PlayerListProps {
  tournamentId: string;
  players: Player[];
  canEdit: boolean;
  onUpdate: () => void;
}

function formatSuggestion(candidate: PlayerListItem) {
  return `${candidate.name}${candidate.dciNumber ? ` · ${candidate.dciNumber}` : ''} · ELO ${candidate.rating}`;
}

export function PlayerList({ tournamentId, players, canEdit, onUpdate }: PlayerListProps) {
  const [name, setName] = useState('');
  const [dci, setDci] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState<PlayerListItem[]>([]);

  useEffect(() => {
    if (!canEdit) return;
    api
      .listPlayers()
      .then(setCandidates)
      .catch(() => undefined);
  }, [canEdit]);

  const hasSeatAssignments = players.some((player) => player.seatNumber != null);
  const visiblePlayers = hasSeatAssignments
    ? [...players].sort((left, right) => {
        const leftSeat = left.seatNumber ?? Number.MAX_SAFE_INTEGER;
        const rightSeat = right.seatNumber ?? Number.MAX_SAFE_INTEGER;
        if (leftSeat !== rightSeat) return leftSeat - rightSeat;
        return left.name.localeCompare(right.name);
      })
    : players;

  const matchingCandidates = candidates
    .filter((candidate) => {
      const nameQuery = name.trim().toLowerCase();
      const dciQuery = dci.trim().toLowerCase();
      if (!nameQuery && !dciQuery) return false;

      const matchesName = nameQuery
        ? candidate.name.toLowerCase().includes(nameQuery) ||
          candidate.normalizedName.includes(nameQuery) ||
          (candidate.dciNumber ?? '').toLowerCase().includes(nameQuery)
        : false;
      const matchesDci = dciQuery
        ? (candidate.dciNumber ?? '').toLowerCase().includes(dciQuery)
        : false;

      return matchesName || matchesDci;
    })
    .slice(0, 5);

  const applyCandidate = (candidate: PlayerListItem) => {
    setName(candidate.name);
    setDci(candidate.dciNumber ?? '');
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      await api.addPlayer(tournamentId, { name: name.trim(), dciNumber: dci.trim() || undefined });
      setName('');
      setDci('');
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error adding player');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = async (playerId: string, playerName: string) => {
    if (!confirm(`Drop ${playerName} from the tournament?`)) return;
    try {
      await api.dropPlayer(playerId);
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error dropping player');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {players.length} {players.length === 1 ? 'Player' : 'Players'}
        </span>

        {canEdit && (
          <form onSubmit={handleAdd} className="flex gap-2 flex-wrap items-center">
            <input
              type="text"
              placeholder="Player name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-w-[160px] rounded-2xl border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? 'Adding…' : 'Add'}
            </button>
          </form>
        )}
      </div>

      {canEdit && matchingCandidates.length > 0 && (
        <div className="rounded-[1.3rem] border border-stone-200 bg-stone-50 px-4 py-3">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Existing player suggestions
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {matchingCandidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => applyCandidate(candidate)}
                className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                title={formatSuggestion(candidate)}
              >
                {candidate.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-[1.3rem] border border-stone-200 bg-white">
        <table className="min-w-full table-fixed text-sm">
          <thead className="border-b border-stone-200 bg-stone-50/80">
            <tr className="text-left text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <th className="w-20 px-6 py-3">{hasSeatAssignments ? 'Seat' : '#'}</th>
              <th className="w-48 px-5 py-3">Name</th>
              <th className="w-28 pl-5 pr-6 py-3 text-right">ELO</th>
              {canEdit && <th className="w-24 pl-5 pr-6 py-3 text-right">Action</th>}
            </tr>
          </thead>
          <tbody>
            {visiblePlayers.map((player, index) => (
              <tr
                key={player.id}
                className="border-b border-stone-100 text-sm transition hover:bg-stone-50/55"
              >
                <td className="px-6 py-4 font-mono text-sm text-slate-400">
                  {hasSeatAssignments ? (player.seatNumber ?? '—') : index + 1}
                </td>
                <td className="px-5 py-4 font-medium text-slate-800">
                  {player.playerId ? (
                    <Link
                      to={`/players/${player.playerId}`}
                      className="flex items-center gap-3 hover:underline"
                    >
                      <PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} size="sm" />
                      {player.name}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3">
                      <PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} size="sm" />
                      {player.name}
                    </div>
                  )}
                </td>
                <td className="pl-5 pr-6 py-4 text-right text-slate-500">{player.elo}</td>
                {canEdit && (
                  <td className="pl-5 pr-6 py-4 text-right">
                    <button
                      onClick={() => handleDrop(player.id, player.name)}
                      className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:border-red-200 hover:bg-red-50"
                    >
                      Drop
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
