/**
 * MTG Professional Swiss Pairing Algorithm
 *
 * Implements Dutch Swiss system with:
 * - Score bracket grouping
 * - Float-down mechanism for odd brackets
 * - Backtracking search to minimize rematches
 * - BYE assignment (lowest ranked player without prior BYE)
 * - Deterministic output
 *
 * Scales to 256 players, target < 2 seconds.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlayerState {
  id: string;
  name: string;
  matchPoints: number;
  matchWins: number;
  matchLosses: number;
  matchDraws: number;
  opponents: string[];
  floatHistory: string[];
  hadBye: boolean;
  tiebreaker1: number; // OMW%
  tiebreaker2: number; // GW%
  tiebreaker3: number; // OGW%
}

export interface Pairing {
  player1Id: string;
  player2Id: string | null; // null = BYE
  tableNumber: number;
  isBye: boolean;
}

export interface PairingResult {
  pairings: Pairing[];
  byePlayerId: string | null;
}

export interface SeatedPlayer {
  id: string;
  seatNumber: number;
}

export function generateSeatPairings(players: SeatedPlayer[]): PairingResult {
  if (players.length === 0) {
    return { pairings: [], byePlayerId: null };
  }

  const seated = [...players].sort((a, b) => a.seatNumber - b.seatNumber);
  const pairings: Pairing[] = [];
  let byePlayerId: string | null = null;
  let tableNumber = 1;

  const pairedPlayerCount = seated.length % 2 === 0 ? seated.length : seated.length - 1;
  const halfway = pairedPlayerCount / 2;

  for (let index = 0; index < halfway; index += 1) {
    pairings.push({
      player1Id: seated[index].id,
      player2Id: seated[index + halfway].id,
      tableNumber: tableNumber++,
      isBye: false,
    });
  }

  if (pairedPlayerCount !== seated.length) {
    byePlayerId = seated[seated.length - 1].id;
    pairings.push({
      player1Id: byePlayerId,
      player2Id: null,
      tableNumber,
      isBye: true,
    });
  }

  return { pairings, byePlayerId };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MIN_OMW = 1 / 3;
const MIN_GW = 1 / 3;
const MAX_BACKTRACK = 2000;

// ─── Main entry point ────────────────────────────────────────────────────────

export function generatePairings(players: PlayerState[]): PairingResult {
  if (players.length === 0) {
    return { pairings: [], byePlayerId: null };
  }

  let byePlayerId: string | null = null;
  let activePlayers = [...players];

  if (activePlayers.length % 2 !== 0) {
    const byeCandidate = selectByePlayer(activePlayers);
    byePlayerId = byeCandidate.id;
    activePlayers = activePlayers.filter((p) => p.id !== byePlayerId);
  }

  const orderedPlayers = orderPlayersForSwiss(activePlayers);
  const result = pairWithoutRematches(orderedPlayers, [], 0);
  if (!result.success) {
    throw new Error("Unable to generate non-rematch Swiss pairings for this round");
  }

  const pairings: Pairing[] = result.pairs.map((pair, index) => ({
    player1Id: pair[0].id,
    player2Id: pair[1].id,
    tableNumber: index + 1,
    isBye: false,
  }));

  if (byePlayerId) {
    pairings.push({
      player1Id: byePlayerId,
      player2Id: null,
      tableNumber: pairings.length + 1,
      isBye: true,
    });
  }

  return { pairings, byePlayerId };
}

// ─── BYE selection ───────────────────────────────────────────────────────────

function selectByePlayer(players: PlayerState[]): PlayerState {
  return [...players].sort((a, b) => {
    if (a.hadBye !== b.hadBye) return a.hadBye ? 1 : -1;
    if (a.matchPoints !== b.matchPoints) return a.matchPoints - b.matchPoints;
    if (a.tiebreaker1 !== b.tiebreaker1) return a.tiebreaker1 - b.tiebreaker1;
    if (a.tiebreaker2 !== b.tiebreaker2) return a.tiebreaker2 - b.tiebreaker2;
    return a.tiebreaker3 - b.tiebreaker3;
  })[0];
}

// ─── Score bracket construction ──────────────────────────────────────────────

function buildScoreBrackets(
  players: PlayerState[]
): Record<number, PlayerState[]> {
  const brackets: Record<number, PlayerState[]> = {};

  for (const player of players) {
    const score = player.matchPoints;
    if (!brackets[score]) brackets[score] = [];
    brackets[score].push(player);
  }

  for (const score of Object.keys(brackets)) {
    brackets[Number(score)].sort((a, b) => {
      if (a.matchPoints !== b.matchPoints) return b.matchPoints - a.matchPoints;
      if (a.tiebreaker1 !== b.tiebreaker1) return b.tiebreaker1 - a.tiebreaker1;
      if (a.tiebreaker2 !== b.tiebreaker2) return b.tiebreaker2 - a.tiebreaker2;
      if (a.tiebreaker3 !== b.tiebreaker3) return b.tiebreaker3 - a.tiebreaker3;
      return a.name.localeCompare(b.name);
    });
  }

  return brackets;
}

// ─── Strict no-rematch Swiss pairing ────────────────────────────────────────

interface BacktrackResult {
  pairs: [PlayerState, PlayerState][];
  success: boolean;
}

function orderPlayersForSwiss(players: PlayerState[]) {
  const brackets = buildScoreBrackets(players);
  return Object.keys(brackets)
    .map(Number)
    .sort((a, b) => b - a)
    .flatMap((score) => brackets[score]);
}

function pairWithoutRematches(
  remaining: PlayerState[],
  currentPairs: [PlayerState, PlayerState][],
  iterations: number
): BacktrackResult {
  if (remaining.length === 0) {
    return { pairs: currentPairs, success: true };
  }

  if (iterations > MAX_BACKTRACK) {
    return { pairs: currentPairs, success: false };
  }

  const [first, ...rest] = remaining;
  const candidates = rankCandidates(first, rest);

  for (const candidate of candidates) {
    const newRemaining = rest.filter((player) => player.id !== candidate.id);
    const result = pairWithoutRematches(
      newRemaining,
      [...currentPairs, [first, candidate]],
      iterations + 1
    );
    if (result.success) return result;
  }

  return { pairs: currentPairs, success: false };
}

function rankCandidates(
  player: PlayerState,
  candidates: PlayerState[]
): PlayerState[] {
  return candidates
    .filter((candidate) => !player.opponents.includes(candidate.id))
    .sort((left, right) => {
      const pointDiff =
        Math.abs(player.matchPoints - left.matchPoints) -
        Math.abs(player.matchPoints - right.matchPoints);
      if (pointDiff !== 0) return pointDiff;
      if (left.matchPoints !== right.matchPoints) return right.matchPoints - left.matchPoints;
      if (left.tiebreaker1 !== right.tiebreaker1) return right.tiebreaker1 - left.tiebreaker1;
      if (left.tiebreaker2 !== right.tiebreaker2) return right.tiebreaker2 - left.tiebreaker2;
      if (left.tiebreaker3 !== right.tiebreaker3) return right.tiebreaker3 - left.tiebreaker3;
      return left.name.localeCompare(right.name);
    });
}

// ─── Tiebreaker calculation ───────────────────────────────────────────────────

export interface MatchRecord {
  playerId: string;
  opponentId: string | null;
  playerWins: number;
  opponentWins: number;
  draws: number;
  isBye: boolean;
}

export function calculateTiebreakers(
  players: PlayerState[],
  allMatches: MatchRecord[]
): Map<string, { omw: number; gw: number; ogw: number }> {
  const result = new Map<string, { omw: number; gw: number; ogw: number }>();

  const matchWinPct = new Map<string, number>();
  for (const player of players) {
    matchWinPct.set(player.id, calcMatchWinPct(player.id, allMatches));
  }

  const gameWinPct = new Map<string, number>();
  for (const player of players) {
    gameWinPct.set(player.id, calcGameWinPct(player.id, allMatches));
  }

  for (const player of players) {
    const opponents = player.opponents.filter((id) => id !== "BYE");

    const omw =
      opponents.length > 0
        ? opponents.reduce(
            (sum, oppId) => sum + (matchWinPct.get(oppId) ?? MIN_OMW),
            0
          ) / opponents.length
        : 0;

    const gw = gameWinPct.get(player.id) ?? MIN_GW;

    const ogw =
      opponents.length > 0
        ? opponents.reduce(
            (sum, oppId) => sum + (gameWinPct.get(oppId) ?? MIN_GW),
            0
          ) / opponents.length
        : 0;

    result.set(player.id, { omw, gw, ogw });
  }

  return result;
}

function calcMatchWinPct(playerId: string, allMatches: MatchRecord[]): number {
  const matches = allMatches.filter((m) => m.playerId === playerId);
  if (matches.length === 0) return MIN_OMW;

  const matchPoints = matches.reduce((sum, match) => {
    if (match.playerWins > match.opponentWins) return sum + 3;
    if (match.playerWins === match.opponentWins) return sum + 1;
    return sum;
  }, 0);

  return Math.max(matchPoints / (matches.length * 3), MIN_OMW);
}

function calcGameWinPct(playerId: string, allMatches: MatchRecord[]): number {
  const matches = allMatches.filter((m) => m.playerId === playerId);
  if (matches.length === 0) return MIN_GW;

  const totalGames = matches.reduce(
    (sum, match) => sum + match.playerWins + match.opponentWins + match.draws,
    0
  );
  if (totalGames === 0) return MIN_GW;

  const gamePoints = matches.reduce(
    (sum, match) => sum + match.playerWins * 3 + match.draws,
    0
  );

  return Math.max(gamePoints / (totalGames * 3), MIN_GW);
}

// ─── Recommended rounds ───────────────────────────────────────────────────────

export function recommendedRounds(playerCount: number): number {
  if (playerCount <= 8) return 3;
  if (playerCount <= 16) return 4;
  if (playerCount <= 32) return 5;
  if (playerCount <= 64) return 6;
  if (playerCount <= 128) return 7;
  if (playerCount <= 226) return 8;
  return 9;
}
