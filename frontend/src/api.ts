const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';
const AUTH_USER_STORAGE_KEY = 'mtg-auth-user-id';

class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

function getAuthHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra);
  const userId = localStorage.getItem(AUTH_USER_STORAGE_KEY);
  if (userId) headers.set('x-user-id', userId);
  return headers;
}

function toQuery(params?: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const value = search.toString();
  return value ? `?${value}` : '';
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  init?: { headers?: HeadersInit },
): Promise<T> {
  const headers = getAuthHeaders(init?.headers);
  if (body !== undefined) headers.set('Content-Type', 'application/json');

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(err.error ?? 'Request failed', err.code);
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }
  return res.json();
}

export function getStoredUserId() {
  return localStorage.getItem(AUTH_USER_STORAGE_KEY);
}

export function setStoredUserId(userId: string | null) {
  if (userId) localStorage.setItem(AUTH_USER_STORAGE_KEY, userId);
  else localStorage.removeItem(AUTH_USER_STORAGE_KEY);
}

export const api = {
  getSession: () => request<AuthSession>('GET', '/auth/session'),
  listTournaments: () => request<Tournament[]>('GET', '/tournaments'),
  listPlayers: (leagueId?: string) =>
    request<PlayerListItem[]>('GET', `/players${toQuery({ leagueId })}`),
  createPlayer: (data: AddPlayerInput, force = false) =>
    request<PlayerListItem>(
      'POST',
      `/players${toQuery({ force: force ? 'true' : undefined })}`,
      data,
    ),
  createTournament: (data: CreateTournamentInput) =>
    request<Tournament>('POST', '/tournaments', data),
  getTournament: (id: string) => request<TournamentDetail>('GET', `/tournaments/${id}`),
  startTournament: (id: string) => request<Tournament>('POST', `/tournaments/${id}/start`),
  finishTournament: (id: string) => request<Tournament>('POST', `/tournaments/${id}/finish`),
  deleteTournament: (id: string) =>
    request<{ id: string; name: string }>('DELETE', `/tournaments/${id}`),
  addPlayer: (tournamentId: string, data: AddPlayerInput) =>
    request<Player>('POST', `/tournaments/${tournamentId}/players`, data),
  dropPlayer: (playerId: string) => request<Player>('DELETE', `/players/${playerId}`),
  deletePlayer: (playerId: string) =>
    request<{ id: string }>('DELETE', `/players/${playerId}/profile`),
  uploadPlayerAvatar: (playerId: string, file: File) => {
    const form = new FormData();
    form.append('avatar', file);
    return fetch(`${BASE_URL}/players/${playerId}/avatar`, {
      method: 'POST',
      body: form,
      headers: getAuthHeaders(),
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new ApiError(err.error ?? 'Upload failed', err.code);
      }
      return res.json() as Promise<PlayerListItem>;
    });
  },
  getPlayerSummary: (playerId: string, leagueId?: string) =>
    request<PlayerSummary>('GET', `/players/${playerId}/summary${toQuery({ leagueId })}`),
  generateRound: (tournamentId: string) =>
    request<Round>('POST', `/tournaments/${tournamentId}/rounds`),
  reportResult: (matchId: string, data: ReportResultInput) =>
    request<Match>('PATCH', `/matches/${matchId}/result`, data),
  getStandings: (tournamentId: string, round?: number) =>
    request<Standing[]>(
      'GET',
      `/tournaments/${tournamentId}/standings${toQuery({ round: round ?? undefined })}`,
    ),
  updateTournament: (id: string, data: UpdateTournamentInput) =>
    request<Tournament>('PATCH', `/tournaments/${id}`, data),
  randomizeSeats: (id: string) =>
    request<TournamentDetail>('POST', `/tournaments/${id}/randomize-seats`),
  exportCSV: (tournamentId: string) => {
    window.open(`${BASE_URL}/tournaments/${tournamentId}/export`, '_blank');
  },
  listLeagues: () => request<League[]>('GET', '/leagues'),
  createLeague: (data: CreateLeagueInput) => request<League>('POST', '/leagues', data),
  updateLeague: (id: string, data: UpdateLeagueInput) =>
    request<League>('PATCH', `/leagues/${id}`, data),
  deleteLeague: (id: string) => request<void>('DELETE', `/leagues/${id}`),
  getLeague: (id: string) => request<LeagueDetail>('GET', `/leagues/${id}`),
  getLeagueStandings: (id: string) => request<LeagueStanding[]>('GET', `/leagues/${id}/standings`),
  listEvents: () => request<EventSummary[]>('GET', '/events'),
  createEvent: (data: CreateEventInput) => request<EventDetail>('POST', '/events', data),
  getEvent: (id: string) => request<EventDetail>('GET', `/events/${id}`),
  getEventStages: (id: string) => request<EventStage[]>('GET', `/events/${id}/stages`),
  advanceStage: (id: string) => request<EventDetail>('POST', `/stages/${id}/advance`),
};

export interface SessionUser {
  userId: string;
  name: string;
  email: string;
  role: OrganizationRole;
  organizationId: string;
  organizationName: string;
}

export interface AuthSession {
  organizationId: string | null;
  organizationSlug: string | null;
  userId: string | null;
  userName: string | null;
  role: OrganizationRole;
  users: SessionUser[];
}

export type OrganizationRole = 'ORG_ADMIN' | 'ORGANIZER' | 'PLAYER';

export interface PlayerStats {
  tournamentsPlayed: number;
  activeRegistrations: number;
  trophies: number;
  teamDraftTrophies: number;
  matchWins: number;
  matchLosses: number;
  matchDraws: number;
  gameWins: number;
  gameLosses: number;
  gameDraws: number;
  matchWinRate: number;
  gameWinRate: number;
  lastTournamentAt: string | null;
}

export interface PlayerTournamentHistoryEntry {
  tournamentId: string;
  tournamentPlayerId: string;
  name: string;
  status: 'REGISTRATION' | 'ACTIVE' | 'FINISHED';
  playedAt: string;
  displayName: string;
  displayDciNumber: string | null;
  startingElo: number;
  currentElo: number;
  endingElo: number | null;
  active: boolean;
  rank: number | null;
  matchPoints: number;
  matchWins: number;
  matchLosses: number;
  matchDraws: number;
  earnedTrophy: boolean;
  earnedTeamDraftTrophy: boolean;
  leagueId: string | null;
  leagueName: string | null;
  format: string;
}

export interface LeagueRef {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: string;
}

export interface Tournament {
  id: string;
  name: string;
  format: string;
  subtitle: string;
  cubeCobraUrl: string | null;
  bestOfFormat: string;
  status: 'REGISTRATION' | 'ACTIVE' | 'FINISHED';
  totalRounds: number;
  currentRound: number;
  leagueId: string | null;
  organizationId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  league?: LeagueRef | null;
  _count?: { players: number };
}

export interface EventStageRef {
  id: string;
  name: string;
  kind: string;
  sequence: number;
  eventId: string;
  eventName: string;
}

export interface TournamentDetail extends Tournament {
  players: Player[];
  rounds: RoundDetail[];
  standings: Standing[];
  league: LeagueRef | null;
  eventStage: EventStageRef | null;
}

export interface Player {
  id: string;
  tournamentPlayerId: string;
  playerId: string | null;
  name: string;
  dciNumber?: string;
  elo: number;
  active: boolean;
  tournamentId: string;
  seatNumber: number | null;
  avatarUrl: string | null;
}

export interface PlayerListItem {
  id: string;
  name: string;
  normalizedName: string;
  dciNumber?: string | null;
  rating: number;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  stats: PlayerStats;
}

export interface Round {
  id: string;
  number: number;
  status: 'PENDING' | 'ACTIVE' | 'FINISHED';
  startedAt?: string;
  matches: Match[];
}

export interface RoundDetail extends Round {
  matches: MatchDetail[];
}

export interface Match {
  id: string;
  tableNumber: number;
  player1Id: string;
  player2Id: string | null;
  wins1: number | null;
  wins2: number | null;
  draws: number | null;
  result: 'PENDING' | 'P1_WIN' | 'P2_WIN' | 'DRAW' | 'BYE';
  tournamentId: string;
}

export interface MatchDetail extends Match {
  player1: Player;
  player2: Player | null;
}

export interface Standing {
  id: string;
  tournamentId: string;
  tournamentPlayerId: string;
  playerId: string | null;
  rank: number;
  matchPoints: number;
  matchWins: number;
  matchLosses: number;
  matchDraws: number;
  gameWins: number;
  gameLosses: number;
  omwPercent: number;
  gwPercent: number;
  ogwPercent: number;
  player: Player;
}

export interface CreateTournamentInput {
  name: string;
  format?: string;
  subtitle?: string;
  cubeCobraUrl?: string;
  bestOfFormat?: string;
  totalRounds?: number;
  leagueId?: string | null;
}

export interface UpdateTournamentInput {
  name?: string;
  format?: string;
  subtitle?: string;
  cubeCobraUrl?: string | null;
  totalRounds?: number;
  leagueId?: string | null;
}

export interface AddPlayerInput {
  name: string;
  dciNumber?: string;
  elo?: number;
}

export interface ReportResultInput {
  wins1: number;
  wins2: number;
  draws: number;
}

export interface PlayerSummary extends PlayerListItem {
  tournaments: PlayerTournamentHistoryEntry[];
}

export interface League {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: string;
  organizationId: string | null;
  createdAt: string;
  updatedAt: string;
  tournamentCount: number;
}

export interface LeagueTournamentCard {
  id: string;
  name: string;
  format: string;
  status: string;
  totalRounds: number;
  currentRound: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  playerCount: number;
}

export interface LeagueDetail extends League {
  tournaments: LeagueTournamentCard[];
}



export interface LeagueStanding {
  rank: number;
  key: string;
  playerId: string | null;
  name: string;
  avatarUrl: string | null;
  rating: number;
  tournamentsPlayed: number;
  trophies: number;
  teamDraftTrophies: number;
  matchPoints: number;
  matchWins: number;
  matchLosses: number;
  matchDraws: number;
  gameWins: number;
  gameLosses: number;
  gameDraws: number;
  lastPlayedAt: string | null;
  matchWinRate: number;
}

export interface CreateLeagueInput {
  name: string;
  startsAt: string;
  endsAt: string;
  status?: string;
}

export interface UpdateLeagueInput extends Partial<CreateLeagueInput> {}

export interface EventParticipant {
  id: string;
  seed: number;
  playerId: string | null;
  name: string;
}

export interface EventStageTournamentCard {
  id: string;
  name: string;
  status: string;
  format: string;
  totalRounds: number;
  currentRound: number;
}

export interface EventStage {
  id: string;
  name: string;
  kind: string;
  sequence: number;
  status: string;
  advancementCount: number | null;
  advancementSourceStageId: string | null;
  configJson: Record<string, unknown> | null;
  tournament: EventStageTournamentCard | null;
}

export interface EventSummary {
  id: string;
  name: string;
  template: string;
  status: string;
  participantCount: number;
  createdAt: string;
  updatedAt: string;
  stages: EventStage[];
}

export interface EventDetail {
  id: string;
  name: string;
  template: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  participants: EventParticipant[];
  stages: EventStage[];
}

export interface CreateEventInput {
  name: string;
  template: 'single_pod_to_top8' | 'multi_pod_to_top8' | 'double_draft_then_top8';
  format?: string;
  bestOfFormat?: string;
  podCount?: number;
  topCutSize?: number;
  stageRounds?: number;
  participants?: Array<{ playerId?: string | null; name: string }>;
}
