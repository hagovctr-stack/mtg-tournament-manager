import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type Standing, type TournamentDetail } from '../api';
import { PageHeader } from '../components/PageHeader';
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
    socket.on('tournament_updated', refresh);
    return () => {
      socket.off('standings_updated', refresh);
      socket.off('tournament_updated', refresh);
    };
  }, [id, refresh]);

  const finishedRounds = tournament
    ? tournament.rounds
        .filter((r) => r.status === 'FINISHED')
        .map((r) => r.number)
        .sort((a, b) => a - b)
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Standings"
        title={tournament?.name ?? 'Tournament standings'}
        backTo={`/tournament/${id}`}
        backLabel="Tournament"
        meta={
          tournament ? (
            <>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                {tournament.status}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                Round {tournament.currentRound}/{tournament.totalRounds || '?'}
              </span>
            </>
          ) : null
        }
        actions={
          <Link
            to={`/tournament/${id}/pairings`}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
          >
            View Pairings
          </Link>
        }
      />

      <section className="rounded-[1.75rem] border border-white/80 bg-white/88 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
        {tournament?.teamMode === 'TEAM_DRAFT_3V3' && tournament.teamStandings.length > 0 && (
          <div className="mb-8 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-left text-xs uppercase text-slate-500">
                  <th className="px-3 py-2">Rank</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">MP</th>
                  <th className="px-3 py-2">Rounds</th>
                  <th className="px-3 py-2">Boards</th>
                </tr>
              </thead>
              <tbody>
                {tournament.teamStandings.map((standing) => (
                  <tr key={standing.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold text-slate-900">{standing.rank}</td>
                    <td className="px-3 py-2 text-slate-800">{standing.team.name}</td>
                    <td className="px-3 py-2 text-slate-800">{standing.matchPoints}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {standing.roundWins}-{standing.roundLosses}-{standing.roundDraws}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {standing.boardWins}-{standing.boardLosses}-{standing.boardDraws}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {id && (
          <StandingsTable
            tournamentId={id}
            standings={standings}
            finishedRounds={finishedRounds}
            finished={tournament?.status === 'FINISHED'}
            isTeamDraft={tournament?.teamMode === 'TEAM_DRAFT_3V3'}
          />
        )}
      </section>
    </div>
  );
}
