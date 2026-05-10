import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api, type Standing } from '../api';
import { PlayerAvatar } from './PlayerAvatar';

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
    <div className="space-y-6">
      {showNav && (
        <div className="flex items-center gap-2 flex-wrap">
          {finishedRounds.map((r) => (
            <button
              key={r}
              onClick={() => setSelectedRound(r)}
              className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                selectedRound === r
                  ? 'bg-slate-950 text-white shadow-[0_14px_28px_rgba(15,23,42,0.16)]'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              After R{r}
            </button>
          ))}
          <button
            onClick={() => setSelectedRound(null)}
            className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition ${
              selectedRound === null
                ? 'bg-slate-950 text-white shadow-[0_14px_28px_rgba(15,23,42,0.16)]'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
            }`}
          >
            Current
          </button>
        </div>
      )}

      {displayedStandings.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-8">No standings yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-[1.3rem] border border-stone-200 bg-white">
          {loading && <p className="text-xs text-slate-400 px-5 pt-3">Loading…</p>}
          <table className="min-w-full table-fixed text-sm">
            <thead className="border-b border-stone-200 bg-stone-50/80">
              <tr className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <th className="w-16 pl-6 pr-3 py-3 text-left">Rank</th>
                <th className="w-10 px-3 py-3 text-center">±</th>
                <th className="w-48 px-5 py-3 text-left">Player</th>
                <th className="w-16 px-4 py-3 text-center">PTS</th>
                <th className="w-24 px-4 py-3 text-center">W-L-D</th>
                <th className="w-20 px-4 py-3 text-center">OMW%</th>
                <th className="w-20 px-4 py-3 text-center">GW%</th>
                <th className="w-20 px-4 pr-6 py-3 text-center">OGW%</th>
              </tr>
            </thead>
            <tbody>
              {displayedStandings.map((standing) => (
                <tr
                  key={standing.id}
                  className={`border-b border-stone-100 text-sm transition hover:bg-stone-50/55 ${
                    finished && selectedRound === null && standing.rank <= 3 ? 'bg-amber-50' : ''
                  }`}
                >
                  <td className="pl-6 pr-3 py-4 whitespace-nowrap">
                    <span className="font-mono text-slate-600">{standing.rank}</span>
                    {medal(standing.rank) && <span className="ml-1">{medal(standing.rank)}</span>}
                  </td>
                  <td className="px-3 py-4 text-center">
                    {prevStandings ? (
                      rankDiff(standing)
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 font-medium text-slate-800">
                    {standing.player.playerId ? (
                      <Link
                        to={`/players/${standing.player.playerId}`}
                        className="flex items-center gap-3 hover:underline"
                      >
                        <PlayerAvatar
                          name={standing.player.name}
                          avatarUrl={standing.player.avatarUrl}
                          size="sm"
                        />
                        {standing.player.name}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3">
                        <PlayerAvatar
                          name={standing.player.name}
                          avatarUrl={standing.player.avatarUrl}
                          size="sm"
                        />
                        {standing.player.name}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center font-bold text-slate-800">
                    {standing.matchPoints}
                  </td>
                  <td className="px-4 py-4 text-center text-slate-600">
                    {standing.matchWins}-{standing.matchLosses}-{standing.matchDraws}
                  </td>
                  <td className="px-4 py-4 text-center text-slate-500">
                    {(standing.omwPercent * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-4 text-center text-slate-500">
                    {(standing.gwPercent * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 pr-6 py-4 text-center text-slate-500">
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
