import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type TournamentDetail } from '../api';
import { PairingsTable } from '../components/PairingsTable';
import { Timer } from '../components/Timer';
import { joinTournament, getSocket } from '../socket';

export function Pairings() {
  const { id } = useParams<{ id: string }>();
  const [tournament, setTournament] = useState<TournamentDetail | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    const t = await api.getTournament(id);
    setTournament(t);
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    document.title = tournament
      ? `Pairings | ${tournament.name} | MTG Tournament Manager`
      : 'Pairings | MTG Tournament Manager';
  }, [tournament]);

  useEffect(() => {
    if (!id) return;
    joinTournament(id);
    const socket = getSocket();
    socket.on('pairings_updated', refresh);
    socket.on('result_reported', refresh);
    return () => {
      socket.off('pairings_updated', refresh);
      socket.off('result_reported', refresh);
    };
  }, [id, refresh]);

  if (!tournament) {
    return <div className="text-center py-16 text-gray-400">Loading...</div>;
  }

  const currentRound = tournament.rounds.find((r) => r.number === tournament.currentRound);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{tournament.name}</h1>
        <p className="text-sm text-gray-500">Round {tournament.currentRound} — Public Pairings</p>
      </div>

      {currentRound?.status === 'ACTIVE' && (
        <div className="mb-6 p-4 bg-white border border-gray-200 rounded-lg text-center">
          <Timer durationMinutes={50} storageKey={`round-timer-${currentRound.id}`} />
        </div>
      )}

      {currentRound ? (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <PairingsTable
            matches={currentRound.matches as TournamentDetail['rounds'][0]['matches']}
            canReport={false}
            onUpdate={refresh}
          />
        </div>
      ) : (
        <p className="text-gray-400 text-center py-8">No active round.</p>
      )}

      <div className="mt-4 text-center">
        <Link to={`/tournament/${id}/standings`} className="text-blue-500 text-sm hover:underline">
          View standings →
        </Link>
      </div>
    </div>
  );
}
