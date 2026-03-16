import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api, type Standing } from "../api";
import { StandingsTable } from "../components/StandingsTable";
import { joinTournament, getSocket } from "../socket";

export function Standings() {
  const { id } = useParams<{ id: string }>();
  const [standings, setStandings] = useState<Standing[]>([]);
  const [tournamentName, setTournamentName] = useState("");

  const refresh = useCallback(async () => {
    if (!id) return;
    const [s, t] = await Promise.all([api.getStandings(id), api.getTournament(id)]);
    setStandings(s);
    setTournamentName(t.name);
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!id) return;
    joinTournament(id);
    const socket = getSocket();
    socket.on("standings_updated", refresh);
    return () => { socket.off("standings_updated", refresh); };
  }, [id, refresh]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{tournamentName}</h1>
        <p className="text-sm text-gray-500">Live Standings</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <StandingsTable standings={standings} />
      </div>
      <div className="mt-4 flex gap-4 justify-center">
        <Link to={`/tournament/${id}`} className="text-blue-500 text-sm hover:underline">
          ← Tournament view
        </Link>
        <Link to={`/tournament/${id}/pairings`} className="text-blue-500 text-sm hover:underline">
          View pairings →
        </Link>
      </div>
    </div>
  );
}
