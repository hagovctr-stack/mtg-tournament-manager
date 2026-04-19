import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type Standing, type TournamentDetail } from '../api';
import { StandingsTable } from '../components/StandingsTable';
import { joinTournament, getSocket } from '../socket';

export function Standings() {
  const { id } = useParams<{ id: string }>();
  const [standings, setStandings] = useState<Standing[]>([]);
  const [tournament, setTournament] = useState<TournamentDetail | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    const t = await api.getTournament(id);
    setTournament(t);
    setStandings(t.standings);
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    document.title = tournament
      ? `Standings | ${tournament.name} | MTG Tournament Manager`
      : 'Standings | MTG Tournament Manager';
  }, [tournament]);

  useEffect(() => {
    if (!id) return;
    joinTournament(id);
    const socket = getSocket();
    socket.on('standings_updated', refresh);
    return () => {
      socket.off('standings_updated', refresh);
    };
  }, [id, refresh]);

  const finishedRounds = tournament
    ? tournament.rounds
        .filter((r) => r.status === 'FINISHED')
        .map((r) => r.number)
        .sort((a, b) => a - b)
    : [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{tournament?.name ?? ''}</h1>
        <p className="text-sm text-gray-500">Live Standings</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        {id && (
          <StandingsTable
            tournamentId={id}
            standings={standings}
            finishedRounds={finishedRounds}
            finished={tournament?.status === 'FINISHED'}
          />
        )}
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
