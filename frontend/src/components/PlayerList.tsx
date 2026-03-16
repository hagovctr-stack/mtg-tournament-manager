import { useState } from "react";
import { api, type Player } from "../api";

interface PlayerListProps {
  tournamentId: string;
  players: Player[];
  canEdit: boolean;
  onUpdate: () => void;
}

export function PlayerList({ tournamentId, players, canEdit, onUpdate }: PlayerListProps) {
  const [name, setName] = useState("");
  const [dci, setDci] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
        <h2 className="text-lg font-semibold text-gray-800">Players ({players.length})</h2>
      </div>

      {canEdit && (
        <form onSubmit={handleAdd} className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Player name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 min-w-[160px] border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="DCI # (optional)"
            value={dci}
            onChange={(e) => setDci(e.target.value)}
            className="w-36 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
          >
            {loading ? "Adding..." : "Add Player"}
          </button>
        </form>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-100 text-gray-600 uppercase text-xs">
              <th className="px-4 py-2 text-left">#</th>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">DCI</th>
              <th className="px-4 py-2 text-left">ELO</th>
              {canEdit && <th className="px-4 py-2 text-left">Action</th>}
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                <td className="px-4 py-2 font-medium text-gray-800">{p.name}</td>
                <td className="px-4 py-2 text-gray-500">{p.dciNumber ?? "—"}</td>
                <td className="px-4 py-2 text-gray-500">{p.elo}</td>
                {canEdit && (
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleDrop(p.id, p.name)}
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
