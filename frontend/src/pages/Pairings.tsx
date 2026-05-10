import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type TournamentDetail } from '../api';
import { PairingsTable } from '../components/PairingsTable';
import { PageHeader } from '../components/PageHeader';
import { RoundSelector } from '../components/RoundSelector';
import { Timer } from '../components/Timer';
import { joinTournament, getSocket } from '../socket';

export function Pairings() {
  const { id } = useParams<{ id: string }>();
  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [selectedRoundNumber, setSelectedRoundNumber] = useState<number | null>(null);

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
    socket.on('tournament_updated', refresh);
    return () => {
      socket.off('pairings_updated', refresh);
      socket.off('result_reported', refresh);
      socket.off('tournament_updated', refresh);
    };
  }, [id, refresh]);

  useEffect(() => {
    if (!tournament) return;
    if (tournament.rounds.length === 0) {
      setSelectedRoundNumber(null);
      return;
    }

    const hasSelectedRound = tournament.rounds.some(
      (round) => round.number === selectedRoundNumber,
    );
    if (hasSelectedRound) return;

    const activeRound = tournament.rounds.find((round) => round.number === tournament.currentRound);
    setSelectedRoundNumber(
      activeRound?.number ?? tournament.rounds[tournament.rounds.length - 1]?.number ?? null,
    );
  }, [selectedRoundNumber, tournament]);

  if (!tournament) {
    return <div className="py-16 text-center text-slate-400">Loading pairings…</div>;
  }

  const currentRound = tournament.rounds.find((r) => r.number === tournament.currentRound);
  const selectedRound =
    tournament.rounds.find((round) => round.number === selectedRoundNumber) ??
    currentRound ??
    tournament.rounds[tournament.rounds.length - 1];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Public Pairings"
        title={tournament.name}
        backTo={`/tournament/${id}`}
        backLabel="Tournament"
        meta={
          <>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              {tournament.status}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              {tournament.format}
            </span>
          </>
        }
        actions={
          <Link
            to={`/tournament/${id}/standings`}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
          >
            View Standings
          </Link>
        }
      />

      {selectedRound && (
        <section className="rounded-[1.75rem] border border-white/80 bg-white/88 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-rose-700">
                Pairings
              </span>
              <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Round {selectedRound.number}
              </span>
            </div>
            <RoundSelector
              rounds={tournament.rounds.map((round) => ({
                number: round.number,
                status: round.status,
              }))}
              selectedRound={selectedRound.number}
              onSelect={setSelectedRoundNumber}
            />
          </div>
        </section>
      )}

      {selectedRound?.status === 'ACTIVE' && (
        <div className="rounded-[1.75rem] border border-white/80 bg-white/88 p-5 text-center shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
          <Timer durationMinutes={50} storageKey={`round-timer-${selectedRound.id}`} />
        </div>
      )}

      {tournament.teamMode === 'TEAM_DRAFT_3V3' && tournament.teams.length > 0 && (
        <section className="rounded-[1.75rem] border border-white/80 bg-white/88 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
          <p className="font-serif text-2xl font-semibold tracking-tight text-slate-950">
            Team Pairings
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {tournament.teams.map((team) => (
              <div
                key={team.id}
                className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4"
              >
                <p className="text-sm font-semibold text-slate-900">{team.name}</p>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  {team.members.map((member) => (
                    <p key={member.id}>
                      Board {member.seatOrder} · {member.player.name}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {selectedRound ? (
        <section className="rounded-[1.75rem] border border-white/80 bg-white/88 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
          <PairingsTable
            matches={selectedRound.matches as TournamentDetail['rounds'][0]['matches']}
            canReport={false}
            onUpdate={refresh}
          />
        </section>
      ) : (
        <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center text-sm text-slate-500">
          No pairings available yet.
        </div>
      )}
    </div>
  );
}
