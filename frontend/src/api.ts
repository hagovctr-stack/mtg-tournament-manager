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
  listPlayers: () => request<PlayerListItem[]>('GET', '/players'),
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
  getPlayerSummary: (playerId: string) =>
    request<PlayerSummary>('GET', `/players/${playerId}/summary`),
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
  createdAt: string;
  _count?: { players: number };
}

export interface TournamentDetail extends Tournament {
  players: Player[];
  rounds: RoundDetail[];
  standings: Standing[];
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
}

export interface UpdateTournamentInput {
  name?: string;
  format?: string;
  subtitle?: string;
  cubeCobraUrl?: string | null;
  totalRounds?: number;
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
