import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type PlayerSummary, type PlayerTournamentHistoryEntry } from "../api";

const HISTORY_BATCH_SIZE = 3;

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function statusBadge(status: PlayerTournamentHistoryEntry["status"]) {
  const map = {
    REGISTRATION: "bg-blue-100 text-blue-700",
    ACTIVE: "bg-green-100 text-green-700",
    FINISHED: "bg-gray-100 text-gray-600",
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[status]}`}>
      {status}
    </span>
  );
}

export function PlayerHistory() {
  const { id } = useParams<{ id: string }>();
  const [summary, setSummary] = useState<PlayerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(HISTORY_BATCH_SIZE);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setVisibleHistoryCount(HISTORY_BATCH_SIZE);

    api.getPlayerSummary(id)
      .then((player) => {
        if (!cancelled) setSummary(player);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load player history");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    document.title = summary
      ? `${summary.name} | MTG Tournament Manager`
      : "Player History | MTG Tournament Manager";
  }, [summary]);

  if (loading) {
    return <div className="px-4 py-16 text-center text-gray-400">Loading player history...</div>;
  }

  if (!summary) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link to="/" className="text-sm text-blue-600 hover:underline">← Back</Link>
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error || "Player not found"}
        </div>
      </div>
    );
  }

  const visibleHistory = summary.tournaments.slice(0, visibleHistoryCount);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link to="/" className="text-sm text-blue-600 hover:underline">← Back</Link>
        <div className="mt-3 flex items-center gap-5">
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
                  setSummary((prev) => prev ? { ...prev, ...updated } : prev);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Upload failed");
                } finally {
                  e.target.value = "";
                }
              }}
            />
            <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-gray-200 bg-gray-100 flex items-center justify-center group-hover:border-blue-400 transition-colors">
              {summary.avatarUrl ? (
                <img src={summary.avatarUrl} alt={summary.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-gray-400 select-none">
                  {summary.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </label>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{summary.name}</h1>
            <p className="mt-1 text-sm text-gray-500">
              Current ELO {summary.rating} · {summary.dciNumber ?? "No DCI registered"}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* Row 1 */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Current ELO</p>
          <p className="mt-3 text-3xl font-bold text-gray-900">{summary.rating}</p>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Trophies</p>
          <p className="mt-3 text-3xl font-bold text-gray-900">🏆 {summary.stats.trophies}</p>
          <p className="mt-1 text-sm text-gray-500">1st place finishes</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Tournaments</p>
          <p className="mt-3 text-3xl font-bold text-gray-900">{summary.stats.tournamentsPlayed}</p>
          <p className="mt-1 text-sm text-gray-500">Active registrations: {summary.stats.activeRegistrations}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Last Active</p>
          <p className="mt-3 text-3xl font-bold text-gray-900">{formatDate(summary.stats.lastTournamentAt)}</p>
        </div>
        {/* Row 2 */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Match Record</p>
          <p className="mt-3 text-3xl font-bold text-gray-900">
            {summary.stats.matchWins}-{summary.stats.matchLosses}-{summary.stats.matchDraws}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Match Win Rate</p>
          <p className="mt-3 text-3xl font-bold text-gray-900">{formatPercent(summary.stats.matchWinRate)}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Game Record</p>
          <p className="mt-3 text-3xl font-bold text-gray-900">
            {summary.stats.gameWins}-{summary.stats.gameLosses}-{summary.stats.gameDraws}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Game Win Rate</p>
          <p className="mt-3 text-3xl font-bold text-gray-900">{formatPercent(summary.stats.gameWinRate)}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Tournament history</h2>
            <p className="mt-1 text-sm text-gray-500">
              Showing {Math.min(visibleHistory.length, summary.tournaments.length)} of {summary.tournaments.length} entries.
            </p>
          </div>
        </div>

        {summary.tournaments.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No tournament history yet.</div>
        ) : (
          <div className="mt-5 space-y-4">
            {visibleHistory.map((entry) => {
              const endingElo = entry.endingElo ?? entry.currentElo;
              const delta = endingElo - entry.startingElo;
              const deltaClass = delta > 0 ? "text-green-600" : delta < 0 ? "text-red-600" : "text-gray-500";

              return (
                <article key={entry.tournamentPlayerId} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <Link to={`/tournament/${entry.tournamentId}`} className="text-lg font-semibold text-gray-900 hover:text-blue-600">
                        {entry.status === "FINISHED" && entry.rank === 1 && <span className="mr-1">🏆</span>}{entry.name}
                      </Link>
                      <p className="mt-1 text-sm text-gray-500">
                        {formatDate(entry.playedAt)} · Registered as {entry.displayName}
                      </p>
                    </div>
                    {statusBadge(entry.status)}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <div className="rounded-lg bg-white px-3 py-3">
                      <p className="text-xs uppercase tracking-wide text-gray-400">ELO Start</p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">{entry.startingElo}</p>
                    </div>
                    <div className="rounded-lg bg-white px-3 py-3">
                      <p className="text-xs uppercase tracking-wide text-gray-400">
                        {entry.endingElo === null ? "Live ELO" : "ELO End"}
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
                        {entry.rank ? `Rank #${entry.rank}` : "Rank pending"} · {entry.matchPoints} pts
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
