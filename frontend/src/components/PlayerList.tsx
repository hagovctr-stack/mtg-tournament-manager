import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Player, type PlayerListItem } from "../api";

interface PlayerListProps {
  tournamentId: string;
  players: Player[];
  canEdit: boolean;
  onUpdate: () => void;
}

function formatSuggestion(candidate: PlayerListItem) {
  return `${candidate.name}${candidate.dciNumber ? ` · ${candidate.dciNumber}` : ""} · ELO ${candidate.rating}`;
}

export function PlayerList({ tournamentId, players, canEdit, onUpdate }: PlayerListProps) {
  const [name, setName] = useState("");
  const [dci, setDci] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState<PlayerListItem[]>([]);

  useEffect(() => {
    if (!canEdit) return;
    api.listPlayers().then(setCandidates).catch(() => undefined);
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

  const matchingCandidates = candidates.filter((candidate) => {
    const nameQuery = name.trim().toLowerCase();
    const dciQuery = dci.trim().toLowerCase();
    if (!nameQuery && !dciQuery) return false;

    const matchesName = nameQuery
      ? candidate.name.toLowerCase().includes(nameQuery) ||
        candidate.normalizedName.includes(nameQuery) ||
        (candidate.dciNumber ?? "").toLowerCase().includes(nameQuery)
      : false;
    const matchesDci = dciQuery
      ? (candidate.dciNumber ?? "").toLowerCase().includes(dciQuery)
      : false;

    return matchesName || matchesDci;
  }).slice(0, 5);

  const applyCandidate = (candidate: PlayerListItem) => {
    setName(candidate.name);
    setDci(candidate.dciNumber ?? "");
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    try {
      await api.addPlayer(tournamentId, { name: name.trim(), dciNumber: dci.trim() || undefined });
      setName("");
      setDci("");
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error adding player");
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
      alert(err instanceof Error ? err.message : "Error dropping player");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Players ({players.length})</h2>
          <p className="text-sm text-gray-500">Linked player names open lifetime history and ELO evolution.</p>
        </div>
      </div>

      {canEdit && (
        <div className="space-y-3">
          <form onSubmit={handleAdd} className="flex gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Player name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 min-w-[180px] border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="DCI # (optional)"
              value={dci}
              onChange={(e) => setDci(e.target.value)}
              className="w-40 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
            >
              {loading ? "Adding..." : "Add Player"}
            </button>
          </form>

          {matchingCandidates.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Existing player suggestions</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {matchingCandidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => applyCandidate(candidate)}
                    className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:border-blue-400 hover:text-blue-700"
                    title={formatSuggestion(candidate)}
                  >
                    {candidate.name}
                    {candidate.dciNumber ? ` · ${candidate.dciNumber}` : ""}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-100 text-gray-600 uppercase text-xs">
              <th className="px-4 py-2 text-left">{hasSeatAssignments ? "Seat" : "#"}</th>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">DCI</th>
              <th className="px-4 py-2 text-left">ELO</th>
              {canEdit && <th className="px-4 py-2 text-left">Action</th>}
            </tr>
          </thead>
          <tbody>
            {visiblePlayers.map((player, index) => (
              <tr key={player.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-400">{hasSeatAssignments ? (player.seatNumber ?? "—") : index + 1}</td>
                <td className="px-4 py-2 font-medium text-gray-800">
                  {player.playerId ? (
                    <Link to={`/players/${player.playerId}`} className="hover:text-blue-600 hover:underline">
                      {player.name}
                    </Link>
                  ) : (
                    player.name
                  )}
                </td>
                <td className="px-4 py-2 text-gray-500">{player.dciNumber ?? "—"}</td>
                <td className="px-4 py-2 text-gray-500">{player.elo}</td>
                {canEdit && (
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleDrop(player.id, player.name)}
                      className="text-red-500 hover:text-red-700 text-xs font-semibold"
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
