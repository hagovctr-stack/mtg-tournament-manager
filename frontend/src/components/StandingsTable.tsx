import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api, type Standing } from '../api';

interface StandingsTableProps {
  tournamentId: string;
  standings: Standing[]; // current (latest) standings
  finishedRounds: number[]; // sorted list of round numbers that are FINISHED
  finished?: boolean;
}

export function StandingsTable({
  tournamentId,
  standings,
  finishedRounds,
  finished = false,
}: StandingsTableProps) {
  // null = "current" (latest), number = specific round
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [historicalStandings, setHistoricalStandings] = useState<Standing[] | null>(null);
  const [loading, setLoading] = useState(false);
  const prevRoundRef = useRef<number | null>(null);
  const [prevStandings, setPrevStandings] = useState<Standing[] | null>(null);

  useEffect(() => {
    // Reset to current when new data arrives (e.g. after a new round)
    setSelectedRound(null);
    setHistoricalStandings(null);
    setPrevStandings(null);
  }, [finishedRounds.length]);

  useEffect(() => {
    if (selectedRound === null) {
      setHistoricalStandings(null);
      // prev = standings at round before the latest finished round
      const prevRound =
        finishedRounds.length >= 2 ? finishedRounds[finishedRounds.length - 2] : null;
      if (prevRound !== null && prevRound !== prevRoundRef.current) {
        prevRoundRef.current = prevRound;
        api
          .getStandings(tournamentId, prevRound)
          .then(setPrevStandings)
          .catch(() => setPrevStandings(null));
      } else if (prevRound === null) {
        setPrevStandings(null);
      }
      return;
    }

    setLoading(true);
    const roundIdx = finishedRounds.indexOf(selectedRound);
    const prevRound = roundIdx > 0 ? finishedRounds[roundIdx - 1] : null;

    const fetchCurrent = api.getStandings(tournamentId, selectedRound);
    const fetchPrev =
      prevRound !== null ? api.getStandings(tournamentId, prevRound) : Promise.resolve(null);

    Promise.all([fetchCurrent, fetchPrev])
      .then(([curr, prev]) => {
        setHistoricalStandings(curr);
        setPrevStandings(prev);
      })
      .catch(() => {
        setHistoricalStandings(null);
        setPrevStandings(null);
      })
      .finally(() => setLoading(false));
  }, [selectedRound, tournamentId, finishedRounds]);

  const displayedStandings =
    selectedRound === null ? standings : (historicalStandings ?? standings);

  const rankMap = new Map<string, number>();
  if (prevStandings) {
    for (const s of prevStandings) rankMap.set(s.tournamentPlayerId, s.rank);
  }

  const medal = (rank: number) => {
    if (!finished || selectedRound !== null) return null;
    if (rank === 1) return '🏆';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return null;
  };

  const rankDiff = (standing: Standing) => {
    if (!prevStandings) return null;
    const prev = rankMap.get(standing.tournamentPlayerId);
    if (prev === undefined) return null;
    const diff = prev - standing.rank; // positive = moved up
    if (diff > 0) return <span className="text-xs font-semibold text-emerald-600">▲{diff}</span>;
    if (diff < 0)
      return <span className="text-xs font-semibold text-red-500">▼{Math.abs(diff)}</span>;
    return <span className="text-xs text-gray-400">—</span>;
  };

  const showNav = finishedRounds.length > 0;

  return (
    <div>
      {showNav && (
        <div className="flex items-center gap-1 mb-4 flex-wrap">
          {finishedRounds.map((r) => (
            <button
              key={r}
              onClick={() => setSelectedRound(r)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                selectedRound === r
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              After R{r}
            </button>
          ))}
          <button
            onClick={() => setSelectedRound(null)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              selectedRound === null
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Current
          </button>
        </div>
      )}

      {displayedStandings.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-8">No standings yet.</p>
      ) : (
        <div className="overflow-x-auto">
          {loading && <p className="text-xs text-gray-400 mb-2">Loading…</p>}
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-100 text-gray-600 uppercase text-xs">
                <th className="px-4 py-2 text-left">Rank</th>
                {prevStandings && <th className="px-3 py-2 text-center">±</th>}
                <th className="px-4 py-2 text-left">Player</th>
                <th className="px-4 py-2 text-center">Pts</th>
                <th className="px-4 py-2 text-center">W-L-D</th>
                <th className="px-4 py-2 text-center">OMW%</th>
                <th className="px-4 py-2 text-center">GW%</th>
                <th className="px-4 py-2 text-center">OGW%</th>
              </tr>
            </thead>
            <tbody>
              {displayedStandings.map((standing) => (
                <tr
                  key={standing.id}
                  className={`border-t border-gray-100 hover:bg-gray-50 ${
                    finished && selectedRound === null && standing.rank <= 3 ? 'bg-amber-50' : ''
                  }`}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-mono text-gray-600">{standing.rank}</span>
                    {medal(standing.rank) && <span className="ml-1">{medal(standing.rank)}</span>}
                  </td>
                  {prevStandings && <td className="px-3 py-3 text-center">{rankDiff(standing)}</td>}
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {standing.player.playerId ? (
                      <Link
                        to={`/players/${standing.player.playerId}`}
                        className="hover:text-blue-600 hover:underline"
                      >
                        {standing.player.name}
                      </Link>
                    ) : (
                      standing.player.name
                    )}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-gray-800">
                    {standing.matchPoints}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">
                    {standing.matchWins}-{standing.matchLosses}-{standing.matchDraws}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500">
                    {(standing.omwPercent * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500">
                    {(standing.gwPercent * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500">
                    {(standing.ogwPercent * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
