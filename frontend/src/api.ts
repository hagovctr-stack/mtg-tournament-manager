const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}

export const api = {
  listTournaments: () => request<Tournament[]>("GET", "/tournaments"),
  createTournament: (data: CreateTournamentInput) => request<Tournament>("POST", "/tournaments", data),
  getTournament: (id: string) => request<TournamentDetail>("GET", `/tournaments/${id}`),
  startTournament: (id: string) => request<Tournament>("POST", `/tournaments/${id}/start`),
  finishTournament: (id: string) => request<Tournament>("POST", `/tournaments/${id}/finish`),
  addPlayer: (tournamentId: string, data: AddPlayerInput) =>
    request<Player>("POST", `/tournaments/${tournamentId}/players`, data),
  dropPlayer: (playerId: string) => request<Player>("DELETE", `/players/${playerId}`),
  generateRound: (tournamentId: string) => request<Round>("POST", `/tournaments/${tournamentId}/rounds`),
  reportResult: (matchId: string, data: ReportResultInput) =>
    request<Match>("PATCH", `/matches/${matchId}/result`, data),
  getStandings: (tournamentId: string) => request<Standing[]>("GET", `/tournaments/${tournamentId}/standings`),
  getTop8: (tournamentId: string) => request<Top8Bracket[]>("GET", `/tournaments/${tournamentId}/top8`),
  exportCSV: (tournamentId: string) => {
    window.open(`${BASE_URL}/tournaments/${tournamentId}/export`, "_blank");
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Tournament {
  id: string;
  name: string;
  format: string;
  status: "REGISTRATION" | "ACTIVE" | "FINISHED";
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
  name: string;
  dciNumber?: string;
  elo: number;
  active: boolean;
  tournamentId: string;
}

export interface Round {
  id: string;
  number: number;
  status: "PENDING" | "ACTIVE" | "FINISHED";
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
  result: "PENDING" | "P1_WIN" | "P2_WIN" | "DRAW" | "BYE";
  tournamentId: string;
}

export interface MatchDetail extends Match {
  player1: Player;
  player2: Player | null;
}

export interface Standing {
  id: string;
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

export interface Top8Bracket {
  match: number;
  player1: Standing;
  player2: Standing;
}

export interface CreateTournamentInput {
  name: string;
  format?: string;
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
