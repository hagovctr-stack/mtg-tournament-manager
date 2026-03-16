import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api, type TournamentDetail, type RoundDetail } from "../api";
import { PlayerList } from "../components/PlayerList";
import { PairingsTable } from "../components/PairingsTable";
import { StandingsTable } from "../components/StandingsTable";
import { Timer } from "../components/Timer";
import { joinTournament, getSocket } from "../socket";

type Tab = "players" | "pairings" | "standings" | "top8";

export function Tournament() {
  const { id } = useParams<{ id: string }>();
  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [tab, setTab] = useState<Tab>("players");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const t = await api.getTournament(id);
      setTournament(t);
    } catch {
      setError("Failed to load tournament");
    }
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!id) return;
    joinTournament(id);
    const socket = getSocket();
    const onUpdate = () => refresh();
    socket.on("pairings_updated", onUpdate);
    socket.on("standings_updated", onUpdate);
    socket.on("result_reported", onUpdate);
    socket.on("round_started", onUpdate);
    return () => {
      socket.off("pairings_updated", onUpdate);
      socket.off("standings_updated", onUpdate);
      socket.off("result_reported", onUpdate);
      socket.off("round_started", onUpdate);
    };
  }, [id, refresh]);

  const handleStart = async () => {
    if (!id || !confirm("Start the tournament?")) return;
    setLoading(true);
    try {
      await api.startTournament(id);
      await refresh();
      setTab("pairings");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateRound = async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      await api.generateRound(id);
      await refresh();
      setTab("pairings");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error generating round");
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = async () => {
    if (!id || !confirm("End the tournament and finalize standings?")) return;
    try {
      await api.finishTournament(id);
      await refresh();
      setTab("standings");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    }
  };

  if (!tournament) {
    return <div className="text-center py-16 text-gray-400">Loading...</div>;
  }

  const currentRound = tournament.rounds.find(
    (r) => r.number === tournament.currentRound
  ) as RoundDetail | undefined;

  const allResultsIn =
    currentRound?.matches.every((m) => m.result !== "PENDING") ?? false;

  const canGenerateRound =
    tournament.status === "ACTIVE" &&
    (tournament.currentRound === 0 || allResultsIn) &&
    tournament.currentRound < tournament.totalRounds;

  const tabs: { key: Tab; label: string }[] = [
    { key: "players", label: "Players" },
    { key: "pairings", label: "Pairings" },
    { key: "standings", label: "Standings" },
    { key: "top8", label: "Top 8" },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <Link to="/" className="text-blue-500 text-sm hover:underline">← Back</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{tournament.name}</h1>
          <p className="text-sm text-gray-500">
            {tournament.format} · {tournament.players.length} players ·{" "}
            Round {tournament.currentRound}/{tournament.totalRounds || "?"}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {tournament.status === "REGISTRATION" && (
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
              {loading ? "Generating..." : `Generate Round ${tournament.currentRound + 1}`}
            </button>
          )}
          {tournament.status === "ACTIVE" &&
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
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
          {error}
        </div>
      )}

      {/* Round timer */}
      {tournament.status === "ACTIVE" && currentRound?.status === "ACTIVE" && (
        <div className="mb-6 p-4 bg-white border border-gray-200 rounded-lg text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
            Round {currentRound.number} Timer
          </p>
          <Timer durationMinutes={50} />
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
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        {tab === "players" && (
          <PlayerList
            tournamentId={tournament.id}
            players={tournament.players}
            canEdit={tournament.status === "REGISTRATION"}
            onUpdate={refresh}
          />
        )}

        {tab === "pairings" && (
          <div className="space-y-6">
            {tournament.rounds.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-8">No rounds generated yet.</p>
            )}
            {[...tournament.rounds]
              .sort((a, b) => b.number - a.number)
              .map((round) => (
                <div key={round.id}>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Round {round.number}{" "}
                    <span
                      className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                        round.status === "ACTIVE"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {round.status}
                    </span>
                  </h3>
                  <PairingsTable
                    matches={(round as RoundDetail).matches}
                    canReport={round.status === "ACTIVE"}
                    onUpdate={refresh}
                  />
                </div>
              ))}
          </div>
        )}

        {tab === "standings" && <StandingsTable standings={tournament.standings} />}

        {tab === "top8" && <Top8View tournamentId={tournament.id} />}
      </div>
    </div>
  );
}

// ─── Top 8 ────────────────────────────────────────────────────────────────────

function Top8View({ tournamentId }: { tournamentId: string }) {
  const [bracket, setBracket] = useState<
    { match: number; player1: { player: { name: string }; rank: number }; player2: { player: { name: string }; rank: number } }[]
  >([]);

  useEffect(() => {
    api.getTop8(tournamentId).then((b) => setBracket(b as typeof bracket)).catch(console.error);
  }, [tournamentId]);

  if (bracket.length === 0) {
    return <p className="text-gray-400 text-center py-8">Top 8 not yet determined.</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {bracket.map((m) => (
        <div key={m.match} className="border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-400 uppercase mb-3">Match {m.match}</p>
          <div className="flex justify-between items-center">
            <div>
              <span className="text-xs text-amber-500 font-bold mr-1">#{m.player1.rank}</span>
              <span className="font-medium text-gray-800">{m.player1.player.name}</span>
            </div>
            <span className="text-gray-300 text-sm">vs</span>
            <div className="text-right">
              <span className="font-medium text-gray-800">{m.player2.player.name}</span>
              <span className="text-xs text-amber-500 font-bold ml-1">#{m.player2.rank}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
