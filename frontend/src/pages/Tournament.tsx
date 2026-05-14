import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  api,
  TournamentDetail,
  RoundDetail,
  League,
  Player,
  TournamentTeam,
  TeamMode,
  TeamSetupTiming,
} from '../api';
import { useAuth } from '../auth';
import { getSocket, joinTournament } from '../socket';
import { PageHeader } from '../components/PageHeader';
import { DraftPod } from '../components/DraftPod';
import { PlayerList } from '../components/PlayerList';
import { PairingsTable } from '../components/PairingsTable';
import { StandingsTable } from '../components/StandingsTable';
import { RoundSelector } from '../components/RoundSelector';
import { Timer } from '../components/Timer';

type Tab = 'players' | 'pairings' | 'standings';

const TEAM_EDITOR_SEEDS = [1, 2];

function buildInitialTeamSlots(players: Player[], teams: TournamentTeam[]) {
  const assigned = new Map<string, string | null>();

  if (teams.length === 2 && teams.every((team) => team.members.length === 3)) {
    for (const team of teams) {
      for (const member of team.members) {
        assigned.set(`${team.seed}-${member.seatOrder}`, member.tournamentPlayerId);
      }
    }
  } else {
    const orderedPlayers = sortPlayersForTeamEditor(players);
    for (const teamSeed of TEAM_EDITOR_SEEDS) {
      for (let seatOrder = 1; seatOrder <= 3; seatOrder += 1) {
        const player = orderedPlayers[(teamSeed - 1) * 3 + (seatOrder - 1)] ?? null;
        assigned.set(`${teamSeed}-${seatOrder}`, player?.id ?? null);
      }
    }
  }

  return TEAM_EDITOR_SEEDS.flatMap((teamSeed) =>
    [1, 2, 3].map((seatOrder) => ({
      key: `${teamSeed}-${seatOrder}`,
      teamSeed,
      seatOrder,
      tournamentPlayerId: assigned.get(`${teamSeed}-${seatOrder}`) ?? null,
    })),
  );
}

function sortPlayersForTeamEditor(players: Player[]): Player[] {
  return [...players].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
}

interface TeamSlot {
  key: string;
  teamSeed: number;
  seatOrder: number;
  tournamentPlayerId: string | null;
}

function TeamEditor({
  teams,
  players,
  disabled,
  onSave,
}: {
  teams: TournamentTeam[];
  players: Player[];
  disabled: boolean;
  onSave: (
    assignments: Array<{ teamSeed: number; tournamentPlayerId: string; seatOrder: number }>,
  ) => Promise<void>;
}) {
  const playerById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );
  const initialSlots = useMemo(() => buildInitialTeamSlots(players, teams), [players, teams]);
  const [slots, setSlots] = useState<TeamSlot[]>(initialSlots);
  const [draggedSlotKey, setDraggedSlotKey] = useState<string | null>(null);
  const [dragOverSlotKey, setDragOverSlotKey] = useState<string | null>(null);

  useEffect(() => {
    setSlots(initialSlots);
  }, [initialSlots]);

  const swapSlots = (sourceKey: string, targetKey: string) => {
    if (sourceKey === targetKey) return;
    setSlots((current) => {
      const next = current.map((slot) => ({ ...slot }));
      const source = next.find((slot) => slot.key === sourceKey);
      const target = next.find((slot) => slot.key === targetKey);
      if (!source || !target) return current;
      [source.tournamentPlayerId, target.tournamentPlayerId] = [
        target.tournamentPlayerId,
        source.tournamentPlayerId,
      ];
      return next;
    });
  };

  const allSlotsFilled = slots.every((slot) => slot.tournamentPlayerId);

  return (
    <div className="mt-4 rounded-[1.5rem] border border-amber-200 bg-[linear-gradient(180deg,#fff8ea_0%,#ffffff_100%)] p-5 shadow-[0_18px_45px_rgba(120,53,15,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.26em] text-amber-700">
            Manual Team Layout
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Drag player cards between Team A and Team B. Board slots determine the fixed pairing
            lane for the round sheet.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSlots(initialSlots)}
          disabled={disabled}
          className="rounded-2xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-50 disabled:opacity-50"
        >
          Reset Layout
        </button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {TEAM_EDITOR_SEEDS.map((teamSeed) => (
          <div
            key={teamSeed}
            className="rounded-[1.35rem] border border-slate-200 bg-white/90 p-4 shadow-[0_14px_30px_rgba(15,23,42,0.06)]"
          >
            <div className="flex items-center justify-between">
              <p className="font-serif text-xl font-semibold tracking-tight text-slate-950">
                Team {teamSeed === 1 ? 'A' : 'B'}
              </p>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                3 Boards
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {slots
                .filter((slot) => slot.teamSeed === teamSeed)
                .map((slot) => {
                  const player = slot.tournamentPlayerId
                    ? (playerById.get(slot.tournamentPlayerId) ?? null)
                    : null;

                  return (
                    <div
                      key={slot.key}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragOverSlotKey(slot.key);
                      }}
                      onDragLeave={() =>
                        setDragOverSlotKey((current) => (current === slot.key ? null : current))
                      }
                      onDrop={(event) => {
                        event.preventDefault();
                        const sourceKey =
                          draggedSlotKey || event.dataTransfer.getData('text/plain') || null;
                        if (sourceKey) swapSlots(sourceKey, slot.key);
                        setDraggedSlotKey(null);
                        setDragOverSlotKey(null);
                      }}
                      className={`rounded-[1.2rem] border px-4 py-3 transition ${
                        dragOverSlotKey === slot.key
                          ? 'border-amber-400 bg-amber-50 shadow-[0_0_0_3px_rgba(251,191,36,0.18)]'
                          : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-slate-500">
                        <span>Board {slot.seatOrder}</span>
                        <span>{player?.seatNumber ? `Seat ${player.seatNumber}` : 'Unseated'}</span>
                      </div>
                      <div
                        draggable={Boolean(player) && !disabled}
                        onDragStart={(event) => {
                          if (!player) return;
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', slot.key);
                          setDraggedSlotKey(slot.key);
                        }}
                        onDragEnd={() => {
                          setDraggedSlotKey(null);
                          setDragOverSlotKey(null);
                        }}
                        className={`rounded-[1rem] border border-white/80 bg-white px-4 py-3 shadow-sm transition ${
                          disabled
                            ? 'cursor-not-allowed opacity-60'
                            : 'cursor-grab active:cursor-grabbing'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {player?.name ?? 'Empty Slot'}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {player?.seatNumber
                                ? `Draft seat ${player.seatNumber}`
                                : 'Drop a player here'}
                            </p>
                          </div>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Drag
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() =>
          void onSave(
            slots.flatMap((slot) =>
              slot.tournamentPlayerId
                ? [
                    {
                      teamSeed: slot.teamSeed,
                      tournamentPlayerId: slot.tournamentPlayerId,
                      seatOrder: slot.seatOrder,
                    },
                  ]
                : [],
            ),
          )
        }
        disabled={disabled || !allSlotsFilled}
        className="mt-5 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
      >
        Save Team Assignments
      </button>
    </div>
  );
}

export function Tournament() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canManage } = useAuth();
  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [tab, setTab] = useState<Tab>('players');
  const [selectedPairingsRoundNumber, setSelectedPairingsRoundNumber] = useState<number | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editName, setEditName] = useState('');
  const [editFormat, setEditFormat] = useState('');
  const [editSubtitle, setEditSubtitle] = useState('');
  const [editCubeCobraUrl, setEditCubeCobraUrl] = useState('');
  const [editRounds, setEditRounds] = useState('');
  const [editLeagueId, setEditLeagueId] = useState('');
  const [editTeamMode, setEditTeamMode] = useState<TeamMode>('NONE');
  const [editTeamSetupTiming, setEditTeamSetupTiming] = useState<TeamSetupTiming>('BEFORE_DRAFT');
  const [editHeldAt, setEditHeldAt] = useState('');

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const [nextTournament, nextLeagues] = await Promise.all([
        api.getTournament(id),
        api.listLeagues(),
      ]);
      setTournament(nextTournament);
      setLeagues(nextLeagues);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tournament');
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    document.title = tournament
      ? `${tournament.name} | MTG Tournament Manager`
      : 'Tournament | MTG Tournament Manager';
  }, [tournament]);

  useEffect(() => {
    if (!id) return;
    joinTournament(id);
    const socket = getSocket();
    const onUpdate = () => void refresh();
    socket.on('pairings_updated', onUpdate);
    socket.on('standings_updated', onUpdate);
    socket.on('result_reported', onUpdate);
    socket.on('round_started', onUpdate);
    socket.on('tournament_updated', onUpdate);
    return () => {
      socket.off('pairings_updated', onUpdate);
      socket.off('standings_updated', onUpdate);
      socket.off('result_reported', onUpdate);
      socket.off('round_started', onUpdate);
      socket.off('tournament_updated', onUpdate);
    };
  }, [id, refresh]);

  useEffect(() => {
    if (!tournament) return;
    if (tournament.rounds.length === 0) {
      setSelectedPairingsRoundNumber(null);
      return;
    }

    const hasSelectedRound = tournament.rounds.some(
      (round) => round.number === selectedPairingsRoundNumber,
    );
    if (hasSelectedRound) return;

    const activeRound = tournament.rounds.find((round) => round.number === tournament.currentRound);
    setSelectedPairingsRoundNumber(
      activeRound?.number ?? tournament.rounds[tournament.rounds.length - 1]?.number ?? null,
    );
  }, [selectedPairingsRoundNumber, tournament]);

  if (!tournament) {
    return <div className="py-16 text-center text-gray-400">Loading tournament…</div>;
  }

  const currentRound = tournament.rounds.find(
    (round) => round.number === tournament.currentRound,
  ) as RoundDetail | undefined;
  const selectedPairingsRound =
    tournament.rounds.find((round) => round.number === selectedPairingsRoundNumber) ??
    currentRound ??
    tournament.rounds[tournament.rounds.length - 1];
  const isSeatBasedTournament = tournament.format === 'Cube' || tournament.format === 'Draft';
  const isTeamDraft = tournament.teamMode === 'TEAM_DRAFT_3V3';
  const teamSetupBeforeDraft = tournament.teamSetupTiming === 'BEFORE_DRAFT';
  const activePlayers = tournament.players.filter((player) => player.active);
  const allActivePlayersSeated =
    activePlayers.length > 0 && activePlayers.every((player) => player.seatNumber != null);
  const hasSeatAssignments = activePlayers.some((player) => player.seatNumber != null);
  const teamDraftTeamsReady =
    tournament.teams.length === 2 && tournament.teams.every((team) => team.members.length === 3);
  const teamDraftNeedsAssignment = isTeamDraft && !teamDraftTeamsReady;
  const teamDraftCanSetTeams =
    canManage &&
    tournament.status === 'ACTIVE' &&
    tournament.currentRound === 0 &&
    tournament.rounds.length === 0 &&
    (teamSetupBeforeDraft || hasSeatAssignments);
  const allResultsIn = currentRound?.matches.every((match) => match.result !== 'PENDING') ?? false;
  const canGenerateRound =
    tournament.status === 'ACTIVE' &&
    (tournament.currentRound === 0 || allResultsIn) &&
    tournament.currentRound < tournament.totalRounds &&
    (!isSeatBasedTournament || tournament.currentRound > 0 || allActivePlayersSeated) &&
    (!isTeamDraft || teamDraftTeamsReady);
  const canRandomizeSeats =
    canManage &&
    isSeatBasedTournament &&
    tournament.status === 'ACTIVE' &&
    tournament.currentRound === 0 &&
    tournament.rounds.length === 0 &&
    (!isTeamDraft || !teamSetupBeforeDraft || teamDraftTeamsReady);

  const openEdit = () => {
    setEditName(tournament.name);
    setEditFormat(tournament.format);
    setEditSubtitle(tournament.subtitle);
    setEditCubeCobraUrl(tournament.cubeCobraUrl ?? '');
    setEditRounds(String(tournament.totalRounds || ''));
    setEditLeagueId(tournament.leagueId ?? '');
    setEditTeamMode(tournament.teamMode);
    setEditTeamSetupTiming(tournament.teamSetupTiming);
    setEditHeldAt(
      tournament.heldAt ? tournament.heldAt.slice(0, 10) : tournament.createdAt.slice(0, 10),
    );
    setShowEdit(true);
  };

  const handleUpdateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      await api.updateTournament(id, {
        name: editName.trim() || undefined,
        format: editFormat || undefined,
        subtitle: editSubtitle.trim(),
        cubeCobraUrl: editCubeCobraUrl.trim() || null,
        totalRounds: parseInt(editRounds, 10) || undefined,
        leagueId: editLeagueId || null,
        teamMode: editTeamMode,
        teamSetupTiming: editTeamSetupTiming,
        heldAt: editHeldAt || null,
      });
      setShowEdit(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error updating tournament');
    } finally {
      setLoading(false);
    }
  };

  const startTournament = async () => {
    if (!id || !confirm('Start the tournament?')) return;
    setLoading(true);
    try {
      await api.startTournament(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error starting tournament');
    } finally {
      setLoading(false);
    }
  };

  const generateRound = async () => {
    if (!id) return;
    setLoading(true);
    setTab('pairings'); // switch immediately so there's no flash of new data on old tab
    const nextRound = tournament.currentRound + 1;
    try {
      await api.generateRound(id);
      await refresh();
      setSelectedPairingsRoundNumber(nextRound); // set after refresh so the round exists
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generating round');
    } finally {
      setLoading(false);
    }
  };

  const finishTournament = async () => {
    if (!id || !confirm('Finalize the tournament?')) return;
    setLoading(true);
    try {
      await api.finishTournament(id);
      setTab('standings');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error finalizing tournament');
    } finally {
      setLoading(false);
    }
  };

  const deleteTournament = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await api.deleteTournament(id);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deleting tournament');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tournament"
        title={tournament.name}
        compact
        description={`${tournament.format}${tournament.subtitle ? ` · ${tournament.subtitle}` : ''}${tournament.league?.name ? ` · ${tournament.league.name}` : ''}${tournament.teamMode === 'TEAM_DRAFT_3V3' ? ` · Team Draft 3v3 · ${tournament.teamSetupTiming === 'BEFORE_DRAFT' ? 'Teams Before Draft' : 'Teams After Draft'}` : ''}`}
        meta={
          <>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              {tournament.status}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              {tournament.players.length} players
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              Round {tournament.currentRound}/{tournament.totalRounds || '?'}
            </span>
            {tournament.eventStage && (
              <Link
                to={`/events/${tournament.eventStage.eventId}`}
                className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-rose-700 transition hover:bg-rose-100"
              >
                {tournament.eventStage.eventName} · {tournament.eventStage.name}
              </Link>
            )}
          </>
        }
        actions={
          <>
            {canManage && tournament.status === 'REGISTRATION' && (
              <button
                onClick={() => void startTournament()}
                disabled={loading}
                className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                Start Tournament
              </button>
            )}
            {canManage && canGenerateRound && (
              <button
                onClick={() => void generateRound()}
                disabled={loading}
                className="rounded-2xl bg-sky-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:opacity-50"
              >
                {loading ? 'Generating…' : `Pair Round ${tournament.currentRound + 1}`}
              </button>
            )}
            {canManage &&
              tournament.status === 'ACTIVE' &&
              tournament.currentRound >= tournament.totalRounds &&
              allResultsIn && (
                <button
                  onClick={() => void finishTournament()}
                  className="rounded-2xl bg-violet-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-600"
                >
                  Finalize Tournament
                </button>
              )}
            {canManage && (
              <>
                <button
                  onClick={openEdit}
                  title="Edit tournament"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-700 transition hover:border-slate-300"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  title="Delete tournament"
                  className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 transition hover:bg-red-100"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </>
            )}
          </>
        }
      />

      {showDeleteConfirm &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-[1.75rem] border border-red-200 bg-white p-7 shadow-[0_32px_80px_rgba(15,23,42,0.22)]">
              <h2 className="font-serif text-xl font-semibold text-slate-950">
                Delete tournament?
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                This will permanently delete <strong>{tournament.name}</strong> and cannot be
                undone.
              </p>
              <div className="mt-6 flex items-center gap-3">
                <button
                  onClick={() => void deleteTournament()}
                  disabled={deleting}
                  className="rounded-2xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {error && (
        <div className="rounded-[1.5rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {showEdit && canManage && (
        <form
          onSubmit={handleUpdateTournament}
          className="rounded-[1.75rem] border border-sky-200 bg-sky-50 p-5 space-y-3"
        >
          <p className="text-sm font-semibold text-sky-800">Edit Tournament</p>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Name"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"
            />
            <input
              type="date"
              value={editHeldAt}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setEditHeldAt(e.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <select
              value={editFormat}
              onChange={(e) => setEditFormat(e.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"
            >
              {[
                'Draft',
                'Sealed',
                'Cube',
                'Standard',
                'Pioneer',
                'Modern',
                'Legacy',
                'Vintage',
                'Pauper',
                'Commander',
              ].map((format) => (
                <option key={format} value={format}>
                  {format}
                </option>
              ))}
            </select>
            <input
              value={editRounds}
              onChange={(e) => setEditRounds(e.target.value)}
              placeholder="Total rounds"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"
            />
          </div>
          {tournament.status === 'ACTIVE' && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Changing planned rounds while the event is in progress is a local organizer workflow.
              This is not standard for sanctioned fixed-round play.
            </div>
          )}
          <input
            value={editSubtitle}
            onChange={(e) => setEditSubtitle(e.target.value)}
            placeholder="Subtitle"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
          />
          <input
            value={editCubeCobraUrl}
            onChange={(e) => setEditCubeCobraUrl(e.target.value)}
            placeholder="Cube Cobra URL"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <select
              value={editLeagueId}
              onChange={(e) => setEditLeagueId(e.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"
            >
              <option value="">No league</option>
              {leagues.map((league) => (
                <option key={league.id} value={league.id}>
                  {league.name}
                </option>
              ))}
            </select>
            <select
              value={editTeamMode}
              onChange={(e) => setEditTeamMode(e.target.value as TeamMode)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"
              disabled={tournament.status !== 'REGISTRATION'}
            >
              <option value="NONE">Individual</option>
              <option value="TEAM_DRAFT_3V3">Team Draft 3v3</option>
            </select>
          </div>
          {editTeamMode === 'TEAM_DRAFT_3V3' && (
            <div className="grid gap-3 md:grid-cols-2">
              <select
                value={editTeamSetupTiming}
                onChange={(e) => setEditTeamSetupTiming(e.target.value as TeamSetupTiming)}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                disabled={tournament.status !== 'REGISTRATION'}
              >
                <option value="BEFORE_DRAFT">Teams before draft</option>
                <option value="AFTER_DRAFT">Teams after draft</option>
              </select>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {editTeamSetupTiming === 'BEFORE_DRAFT'
                  ? 'Teams are set first, then seats are randomized to alternate opponents around the pod.'
                  : 'Players draft as individuals and teams are locked in before round 1.'}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-sky-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setShowEdit(false)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {tournament.teamMode === 'TEAM_DRAFT_3V3' && (
        <section className="rounded-[1.75rem] border border-white/80 bg-white/88 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-serif text-2xl font-semibold tracking-tight text-slate-950">
                Team Draft
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {teamSetupBeforeDraft
                  ? 'Set teams first, then seat the pod in alternating opponents to preserve classic team-draft dynamics.'
                  : 'Draft as six individuals, then assign teams before round 1 to remove hate-drafting incentives.'}
              </p>
            </div>
            {teamDraftCanSetTeams && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={async () => {
                    if (!id) return;
                    setLoading(true);
                    setError('');
                    try {
                      await api.generateTeams(id);
                      await refresh();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Error generating teams');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={loading}
                >
                  Random Teams
                </button>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {teamSetupBeforeDraft ? 'Step 1 of 2' : 'Before round 1'}
                </span>
              </div>
            )}
          </div>

          {teamDraftNeedsAssignment && (
            <div className="mt-4 rounded-[1.35rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {teamSetupBeforeDraft
                ? 'Pick teams first, then use Randomize Seats to alternate opponents around the draft pod.'
                : hasSeatAssignments
                  ? 'Seats are already set. Assign teams now, then pair round 1.'
                  : 'Randomize seats for the draft first. Once the pod is seated, you can assign post-draft teams here.'}
            </div>
          )}

          {teamSetupBeforeDraft && teamDraftTeamsReady && !allActivePlayersSeated && (
            <div className="mt-4 rounded-[1.35rem] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
              Teams are locked in. The next step is seat randomization, which will place Team A on
              seats 1, 3, 5 and Team B on seats 2, 4, 6 in random internal order.
            </div>
          )}

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {tournament.teams.map((team) => (
              <div
                key={team.id}
                className="rounded-[1.35rem] border border-slate-200 bg-slate-50 p-4"
              >
                <p className="text-sm font-semibold text-slate-900">{team.name}</p>
                <div className="mt-3 space-y-2">
                  {team.members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between text-sm text-slate-700"
                    >
                      <span>
                        Board {member.seatOrder} · {member.player.name}
                      </span>
                      <span className="text-slate-400">Seat {member.player.seatNumber ?? '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {tournament.teamStandings.length > 0 && (
            <div className="mt-4 overflow-x-auto">
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

          {teamDraftCanSetTeams && activePlayers.length === 6 && (
            <TeamEditor
              teams={tournament.teams}
              players={activePlayers}
              disabled={loading}
              onSave={async (assignments) => {
                if (!id) return;
                setLoading(true);
                setError('');
                try {
                  await api.saveTeams(id, assignments);
                  await refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Error saving teams');
                } finally {
                  setLoading(false);
                }
              }}
            />
          )}
        </section>
      )}

      <div className="rounded-[1.75rem] border border-white/80 bg-white/88 p-2 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
        <div className="grid grid-cols-3 gap-2">
          {(['players', 'pairings', 'standings'] as Tab[]).map((value) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                tab === value
                  ? 'bg-slate-950 text-white'
                  : 'bg-transparent text-slate-600 hover:bg-slate-100'
              }`}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {tab === 'players' && (
        <section className="rounded-[1.75rem] border border-white/80 bg-white/88 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
          {isSeatBasedTournament && (
            <DraftPod
              players={tournament.players}
              status={tournament.status}
              canRandomize={canRandomizeSeats}
              isRandomizing={loading}
              storageKey={`draft-pod-collapsed-${id}`}
              onRandomize={() => {
                if (!id) return;
                setLoading(true);
                setError('');
                api
                  .randomizeSeats(id)
                  .then(() => refresh())
                  .catch((err) => {
                    setError(err instanceof Error ? err.message : 'Error randomizing seats');
                  })
                  .finally(() => setLoading(false));
              }}
              onAssignByOrder={
                canRandomizeSeats
                  ? () => {
                      if (!id) return;
                      setLoading(true);
                      setError('');
                      api
                        .assignSeatsByOrder(id)
                        .then(() => refresh())
                        .catch((err) => {
                          setError(err instanceof Error ? err.message : 'Error assigning seats');
                        })
                        .finally(() => setLoading(false));
                    }
                  : undefined
              }
              onReorderSeats={
                canRandomizeSeats
                  ? (assignments) => {
                      if (!id) return;
                      setLoading(true);
                      setError('');
                      api
                        .updateSeatOrder(id, assignments)
                        .then(() => refresh())
                        .catch((err) => {
                          setError(err instanceof Error ? err.message : 'Error reordering seats');
                        })
                        .finally(() => setLoading(false));
                    }
                  : undefined
              }
            />
          )}
          <PlayerList
            tournamentId={tournament.id}
            players={tournament.players}
            canEdit={canManage && tournament.status === 'REGISTRATION'}
            onUpdate={() => void refresh()}
          />
        </section>
      )}

      {tab === 'pairings' && (
        <section className="rounded-[1.75rem] border border-white/80 bg-white/88 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
          {selectedPairingsRound?.status === 'ACTIVE' && (
            <div className="mb-5 rounded-[1.35rem] border border-slate-200 bg-slate-50 p-4 text-center">
              <Timer durationMinutes={50} storageKey={`round-timer-${selectedPairingsRound.id}`} />
            </div>
          )}
          {selectedPairingsRound ? (
            <PairingsTable
              matches={selectedPairingsRound.matches}
              canReport={canManage && tournament.status !== 'REGISTRATION'}
              bestOfFormat={tournament.bestOfFormat}
              onUpdate={() => void refresh()}
              headerRight={
                <RoundSelector
                  rounds={tournament.rounds.map((round) => ({
                    number: round.number,
                    status: round.status,
                  }))}
                  selectedRound={selectedPairingsRound.number}
                  onSelect={setSelectedPairingsRoundNumber}
                />
              }
            />
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">No pairings yet.</p>
          )}
        </section>
      )}

      {tab === 'standings' && (
        <section className="rounded-[1.75rem] border border-white/80 bg-white/88 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
          <StandingsTable
            tournamentId={tournament.id}
            standings={tournament.standings}
            finishedRounds={tournament.rounds
              .filter((round) => round.status === 'FINISHED')
              .map((round) => round.number)
              .sort((left, right) => left - right)}
            finished={tournament.status === 'FINISHED'}
            isTeamDraft={tournament.teamMode === 'TEAM_DRAFT_3V3'}
          />
        </section>
      )}
    </div>
  );
}
