type EventPlayerLike = {
  id: string;
  playerId: string | null;
  tournamentId: string;
  displayName: string;
  displayDciNumber: string | null;
  startingElo: number;
  currentElo: number;
  active: boolean;
  seatNumber?: number | null;
  player?: { avatarUrl: string | null } | null;
};

type MatchLike = {
  id: string;
  tableNumber: number;
  player1TournamentPlayerId: string;
  player2TournamentPlayerId: string | null;
  wins1: number | null;
  wins2: number | null;
  draws: number | null;
  result: string;
  tournamentId: string;
  player1: EventPlayerLike;
  player2: EventPlayerLike | null;
};

type RoundLike = {
  id: string;
  number: number;
  status: string;
  startedAt: Date | null;
  finishedAt?: Date | null;
  matches: MatchLike[];
};

type StandingLike = {
  id: string;
  tournamentId: string;
  tournamentPlayerId: string;
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
  tournamentPlayer: EventPlayerLike;
};

export function serializeEventPlayer(player: EventPlayerLike) {
  return {
    id: player.id,
    tournamentPlayerId: player.id,
    playerId: player.playerId,
    name: player.displayName,
    dciNumber: player.displayDciNumber,
    elo: player.currentElo,
    active: player.active,
    tournamentId: player.tournamentId,
    seatNumber: player.seatNumber ?? null,
    avatarUrl: player.player?.avatarUrl ?? null,
  };
}

export function serializeMatch(match: MatchLike) {
  return {
    id: match.id,
    tableNumber: match.tableNumber,
    player1Id: match.player1TournamentPlayerId,
    player2Id: match.player2TournamentPlayerId,
    wins1: match.wins1,
    wins2: match.wins2,
    draws: match.draws,
    result: match.result,
    tournamentId: match.tournamentId,
    player1: serializeEventPlayer(match.player1),
    player2: match.player2 ? serializeEventPlayer(match.player2) : null,
  };
}

export function serializeRound(round: RoundLike) {
  return {
    id: round.id,
    number: round.number,
    status: round.status,
    startedAt: round.startedAt?.toISOString(),
    finishedAt: round.finishedAt?.toISOString(),
    matches: round.matches.map(serializeMatch),
  };
}

export function serializeStanding(standing: StandingLike) {
  return {
    id: standing.id,
    tournamentId: standing.tournamentId,
    tournamentPlayerId: standing.tournamentPlayerId,
    playerId: standing.tournamentPlayer.playerId,
    rank: standing.rank,
    matchPoints: standing.matchPoints,
    matchWins: standing.matchWins,
    matchLosses: standing.matchLosses,
    matchDraws: standing.matchDraws,
    gameWins: standing.gameWins,
    gameLosses: standing.gameLosses,
    omwPercent: standing.omwPercent,
    gwPercent: standing.gwPercent,
    ogwPercent: standing.ogwPercent,
    player: serializeEventPlayer(standing.tournamentPlayer),
  };
}
