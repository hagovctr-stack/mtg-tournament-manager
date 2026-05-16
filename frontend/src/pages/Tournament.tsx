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

// ─── MTG 5-colour identity system ────────────────────────────────────────────
const MTG_COLORS = [
  { key: 'W', label: 'White',
    accent: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200',
    avatar: 'bg-amber-500 text-white', badge: 'bg-amber-50 text-amber-700 border-amber-200',
    statsBar: 'bg-amber-50', pip: '#f59e0b' },
  { key: 'U', label: 'Blue',
    accent: 'text-sky-700', bg: 'bg-sky-50', border: 'border-sky-200',
    avatar: 'bg-sky-700 text-white', badge: 'bg-sky-50 text-sky-700 border-sky-200',
    statsBar: 'bg-sky-50', pip: '#0369a1' },
  { key: 'B', label: 'Black',
    accent: 'text-slate-950', bg: 'bg-slate-50', border: 'border-slate-300',
    avatar: 'bg-slate-950 text-white', badge: 'bg-slate-50 text-slate-800 border-slate-300',
    statsBar: 'bg-slate-50', pip: '#020617' },
  { key: 'R', label: 'Red',
    accent: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200',
    avatar: 'bg-rose-600 text-white', badge: 'bg-rose-50 text-rose-700 border-rose-200',
    statsBar: 'bg-rose-50', pip: '#e11d48' },
  { key: 'G', label: 'Green',
    accent: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200',
    avatar: 'bg-emerald-600 text-white', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    statsBar: 'bg-emerald-50', pip: '#059669' },
] as const;

type MtgColorKey = (typeof MTG_COLORS)[number]['key'];
type MtgColor = (typeof MTG_COLORS)[number];
const MTG_COLOR_KEYS = new Set<string>(MTG_COLORS.map((color) => color.key));

function getMtgColor(key: MtgColorKey | undefined): MtgColor {
  return MTG_COLORS.find((c) => c.key === key) ?? MTG_COLORS[1]!;
}
function pickRandomColors(): [MtgColorKey, MtgColorKey] {
  const shuffled = [...MTG_COLORS].sort(() => Math.random() - 0.5);
  return [shuffled[0]!.key, shuffled[1]!.key];
}
function loadTeamColors(key: string): [MtgColorKey, MtgColorKey] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw) as unknown;
    if (
      Array.isArray(p) &&
      p.length === 2 &&
      typeof p[0] === 'string' &&
      typeof p[1] === 'string' &&
      MTG_COLOR_KEYS.has(p[0]) &&
      MTG_COLOR_KEYS.has(p[1])
    ) {
      return p as [MtgColorKey, MtgColorKey];
    }
  } catch { /* ignore */ }
  return null;
}
function saveTeamColors(key: string, colors: [MtgColorKey, MtgColorKey]) {
  try { localStorage.setItem(key, JSON.stringify(colors)); } catch { /* ignore */ }
}
function loadOrCreateTeamColors(key: string): [MtgColorKey, MtgColorKey] {
  const saved = loadTeamColors(key);
  if (saved) return saved;
  const generated = pickRandomColors();
  saveTeamColors(key, generated);
  return generated;
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`.toUpperCase();
}
// ─────────────────────────────────────────────────────────────────────────────

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

  const teamColorsKey = `team-colors-${id ?? 'default'}`;
  const [teamColors, setTeamColors] = useState<[MtgColorKey, MtgColorKey]>(() => {
    return loadOrCreateTeamColors(`team-colors-${id ?? 'default'}`);
  });
  const [openPickerSlot, setOpenPickerSlot] = useState<0 | 1 | null>(null);
  const [teamSlots, setTeamSlots] = useState<TeamSlot[]>([]);
  const [draggedTeamSlotKey, setDraggedTeamSlotKey] = useState<string | null>(null);
  const [dragOverTeamSlotKey, setDragOverTeamSlotKey] = useState<string | null>(null);

  useEffect(() => {
    setTeamColors(loadOrCreateTeamColors(teamColorsKey));
    setOpenPickerSlot(null);
  }, [teamColorsKey]);

  const setTeamColor = (slot: 0 | 1, key: MtgColorKey) => {
    setTeamColors((prev) => {
      const next: [MtgColorKey, MtgColorKey] = [...prev] as [MtgColorKey, MtgColorKey];
      next[slot] = key;
      saveTeamColors(teamColorsKey, next);
      return next;
    });
    setOpenPickerSlot(null);
  };

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

  const initialTeamSlots = useMemo(() => {
    if (!tournament) return [];
    return buildInitialTeamSlots(
      tournament.players.filter((player) => player.active),
      tournament.teams,
    );
  }, [tournament]);

  const activePlayerById = useMemo(() => {
    if (!tournament) return new Map<string, Player>();
    return new Map(
      tournament.players.filter((player) => player.active).map((player) => [player.id, player]),
    );
  }, [tournament]);

  useEffect(() => {
    setTeamSlots(initialTeamSlots);
    setDraggedTeamSlotKey(null);
    setDragOverTeamSlotKey(null);
  }, [initialTeamSlots]);

  const playerTeamColors = useMemo(() => {
    const map: Record<string, string> = {};
    if (!tournament) return map;
    tournament.teams.forEach((team, teamIndex) => {
      const tc = getMtgColor(teamColors[teamIndex % teamColors.length]);
      team.members.forEach((member) => {
        map[member.tournamentPlayerId] = tc.pip;
      });
    });
    return map;
  }, [tournament, teamColors]);

  const teamSlotsDirty = useMemo(() => {
    if (teamSlots.length !== initialTeamSlots.length) return false;
    return teamSlots.some(
      (slot, index) => slot.tournamentPlayerId !== initialTeamSlots[index]?.tournamentPlayerId,
    );
  }, [initialTeamSlots, teamSlots]);

  const swapTeamSlots = useCallback((sourceKey: string, targetKey: string) => {
    if (sourceKey === targetKey) return;
    setTeamSlots((current) => {
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
  }, []);

  const saveTeamSlots = useCallback(async () => {
    if (!id || teamSlots.some((slot) => !slot.tournamentPlayerId)) return;
    setLoading(true);
    setError('');
    try {
      await api.saveTeams(
        id,
        teamSlots.map((slot) => ({
          teamSeed: slot.teamSeed,
          tournamentPlayerId: slot.tournamentPlayerId!,
          seatOrder: slot.seatOrder,
        })),
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving teams');
    } finally {
      setLoading(false);
    }
  }, [id, refresh, teamSlots]);

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
  const canEditTeamCards =
    teamDraftCanSetTeams && activePlayers.length === 6 && teamSlots.length === 6;
  const allTeamSlotsFilled = teamSlots.every((slot) => slot.tournamentPlayerId);
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
                {canEditTeamCards && teamSlotsDirty && (
                  <>
                    <button
                      onClick={() => void saveTeamSlots()}
                      className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                      disabled={loading || !allTeamSlotsFilled}
                    >
                      Save Teams
                    </button>
                    <button
                      onClick={() => setTeamSlots(initialTeamSlots)}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                      disabled={loading}
                    >
                      Reset
                    </button>
                  </>
                )}
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
            {tournament.teams.map((team, teamIndex) => {
              const slot = (teamIndex % teamColors.length) as 0 | 1;
              const tc = getMtgColor(teamColors[slot]);
              const standing = tournament.teamStandings.find((s) => s.team.id === team.id);
              const teamRows = canEditTeamCards
                ? teamSlots
                    .filter((teamSlot) => teamSlot.teamSeed === team.seed)
                    .map((teamSlot) => ({
                      key: teamSlot.key,
                      player: teamSlot.tournamentPlayerId
                        ? (activePlayerById.get(teamSlot.tournamentPlayerId) ?? null)
                        : null,
                      slotKey: teamSlot.key,
                    }))
                : team.members.map((member) => ({
                    key: member.id,
                    player: member.player,
                    slotKey: null,
                  }));
              return (
                <div key={team.id} className={`rounded-[1.35rem] border ${tc.border} overflow-hidden shadow-[0_6px_24px_rgba(15,23,42,0.07)]`}>
                  {/* Header with color picker */}
                  <div className={`${tc.bg} border-b ${tc.border} px-4 py-3 flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <p className={`font-semibold text-sm ${tc.accent}`}>{team.name}</p>
                    </div>
                    {/* Mana pip color picker */}
                    <div className="relative flex items-center">
                      {openPickerSlot === slot ? (
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-full bg-white/95 p-1 shadow-lg ring-1 ring-slate-900/10 z-10">
                          {MTG_COLORS.map((c) => (
                            <button
                              key={c.key}
                              title={c.label}
                              onClick={() => setTeamColor(slot, c.key)}
                              style={{ background: c.pip }}
                              className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${
                                teamColors[slot] === c.key ? 'border-slate-800 scale-110' : 'border-white'
                              }`}
                            />
                          ))}
                        </div>
                      ) : (
                        <button
                          title="Change team color"
                          onClick={() => setOpenPickerSlot(slot)}
                          style={{ background: tc.pip }}
                          className="h-5 w-5 rounded-full border-2 border-white/60 transition-transform hover:scale-110"
                        />
                      )}
                    </div>
                  </div>
                  {/* Player rows */}
                  <div className="bg-white p-3 space-y-1">
                    {teamRows.map(({ key, player, slotKey }) => {
                      const isDropTarget =
                        Boolean(slotKey) &&
                        dragOverTeamSlotKey === slotKey &&
                        draggedTeamSlotKey !== slotKey;
                      return (
                        <div
                          key={key}
                          onDragOver={
                            slotKey
                              ? (event) => {
                                  event.preventDefault();
                                  setDragOverTeamSlotKey(slotKey);
                                }
                              : undefined
                          }
                          onDragLeave={
                            slotKey
                              ? () =>
                                  setDragOverTeamSlotKey((current) =>
                                    current === slotKey ? null : current,
                                  )
                              : undefined
                          }
                          onDrop={
                            slotKey
                              ? (event) => {
                                  event.preventDefault();
                                  const sourceKey =
                                    draggedTeamSlotKey ||
                                    event.dataTransfer.getData('text/plain') ||
                                    null;
                                  if (sourceKey) swapTeamSlots(sourceKey, slotKey);
                                  setDraggedTeamSlotKey(null);
                                  setDragOverTeamSlotKey(null);
                                }
                              : undefined
                          }
                          className={`flex items-center gap-3 rounded-xl px-3 py-2 transition ${
                            isDropTarget ? `${tc.bg} ring-2 ring-inset ring-slate-200` : 'hover:bg-slate-50'
                          } ${canEditTeamCards ? 'cursor-grab active:cursor-grabbing' : ''}`}
                          draggable={Boolean(canEditTeamCards && player && slotKey)}
                          onDragStart={(event) => {
                            if (!slotKey || !player) return;
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', slotKey);
                            setDraggedTeamSlotKey(slotKey);
                          }}
                          onDragEnd={() => {
                            setDraggedTeamSlotKey(null);
                            setDragOverTeamSlotKey(null);
                          }}
                        >
                          {player ? (
                            <>
                              {player.avatarUrl
                                ? <img src={player.avatarUrl} alt={player.name} className="h-8 w-8 rounded-full object-cover shrink-0 border-2 border-white shadow-sm" />
                                : <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold ${tc.avatar} shadow-sm`}>{initialsFor(player.name)}</div>
                              }
                              <span className="flex-1 text-sm font-medium text-slate-800">{player.name}</span>
                              {player.seatNumber && (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] font-semibold text-slate-500">#{player.seatNumber}</span>
                              )}
                            </>
                          ) : (
                            <>
                              <div className="h-8 w-8 shrink-0 rounded-full border border-dashed border-slate-300 bg-white" />
                              <span className="flex-1 text-sm font-medium text-slate-400">Drop player here</span>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Merged standings footer */}
                  {standing && (
                    <div className={`border-t ${tc.border} ${tc.statsBar} px-4 py-2.5 grid grid-cols-4 divide-x divide-slate-200/60`}>
                      <div className="text-center">
                        <p className={`text-base font-bold ${tc.accent}`}>#{standing.rank}</p>
                        <p className="text-[0.62rem] uppercase tracking-wide text-slate-400 font-semibold">Rank</p>
                      </div>
                      <div className="text-center">
                        <p className={`text-base font-bold ${tc.accent}`}>{standing.matchPoints}</p>
                        <p className="text-[0.62rem] uppercase tracking-wide text-slate-400 font-semibold">MP</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-slate-600">{standing.roundWins}–{standing.roundLosses}–{standing.roundDraws}</p>
                        <p className="text-[0.62rem] uppercase tracking-wide text-slate-400 font-semibold">Rounds</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-slate-600">{standing.boardWins}–{standing.boardLosses}–{standing.boardDraws}</p>
                        <p className="text-[0.62rem] uppercase tracking-wide text-slate-400 font-semibold">Boards</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
              assignByOrderLabel={isTeamDraft && teamSetupBeforeDraft ? 'Use Team Order' : undefined}
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
              playerTeamColors={playerTeamColors}
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
              playerTeamColors={playerTeamColors}
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
            playerTeamColors={playerTeamColors}
          />
        </section>
      )}
    </div>
  );
}
