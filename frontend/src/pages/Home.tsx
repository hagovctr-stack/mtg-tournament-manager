import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, type Tournament } from "../api";

export function Home() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [rounds, setRounds] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    api.listTournaments().then(setTournaments).catch(console.error);
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError("");
    try {
      const t = await api.createTournament({
        name: name.trim(),
        totalRounds: rounds > 0 ? rounds : undefined,
      });
      setTournaments((prev) => [t, ...prev]);
      setName("");
      setRounds(0);
      setCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creating tournament");
    }
  };

  const statusBadge = (status: Tournament["status"]) => {
    const map = {
      REGISTRATION: "bg-blue-100 text-blue-700",
      ACTIVE: "bg-green-100 text-green-700",
      FINISHED: "bg-gray-100 text-gray-600",
    };
    return (
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[status]}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🃏 MTG Tournament Manager</h1>
          <p className="text-gray-500 text-sm mt-1">Professional Swiss pairing system</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-semibold text-sm"
        >
          + New Tournament
        </button>
      </div>

      {creating && (
        <div className="mb-6 p-5 border border-blue-200 rounded-lg bg-blue-50">
          <h2 className="font-semibold text-gray-800 mb-3">Create Tournament</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <input
              autoFocus
              type="text"
              placeholder="Tournament name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-600">Rounds (0 = auto):</label>
              <input
                type="number"
                min={0}
                max={15}
                value={rounds}
                onChange={(e) => setRounds(Number(e.target.value))}
                className="w-20 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-semibold"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="px-4 py-2 rounded text-sm text-gray-600 hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {tournaments.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">🃏</p>
            <p>No tournaments yet. Create one to get started.</p>
          </div>
        )}
        {tournaments.map((t) => (
          <Link
            key={t.id}
            to={`/tournament/${t.id}`}
            className="block p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all bg-white"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-800">{t.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {t._count?.players ?? 0} players · Round {t.currentRound}/{t.totalRounds || "?"}
                </p>
              </div>
              {statusBadge(t.status)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
