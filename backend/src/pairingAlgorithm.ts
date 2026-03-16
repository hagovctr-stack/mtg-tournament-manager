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

// ─── Constants ───────────────────────────────────────────────────────────────

const MIN_OMW = 0.33;
const MIN_GW = 0.33;
const MAX_BACKTRACK = 2000;

// ─── Main entry point ────────────────────────────────────────────────────────

export function generatePairings(players: PlayerState[]): PairingResult {
  if (players.length === 0) {
    return { pairings: [], byePlayerId: null };
  }

  let byePlayerId: string | null = null;
  let activePlayers = [...players];

  // BYE assignment: odd player count → lowest ranked without prior BYE
  if (activePlayers.length % 2 !== 0) {
    const byeCandidate = selectByePlayer(activePlayers);
    byePlayerId = byeCandidate.id;
    activePlayers = activePlayers.filter((p) => p.id !== byePlayerId);
  }

  const brackets = buildScoreBrackets(activePlayers);
  const pairedIds = new Set<string>();
  const pairings: Pairing[] = [];
  let tableNumber = 1;

  const bracketKeys = Object.keys(brackets)
    .map(Number)
    .sort((a, b) => b - a);

  let carryover: PlayerState[] = [];

  for (const score of bracketKeys) {
    const bracket = [...carryover, ...brackets[score]].filter(
      (p) => !pairedIds.has(p.id)
    );
    carryover = [];

    if (bracket.length === 0) continue;

    const result = pairBracket(bracket, pairedIds);

    for (const pair of result.paired) {
      pairings.push({
        player1Id: pair[0].id,
        player2Id: pair[1].id,
        tableNumber: tableNumber++,
        isBye: false,
      });
      pairedIds.add(pair[0].id);
      pairedIds.add(pair[1].id);
    }

    if (result.leftover) {
      result.leftover.floatHistory.push(String(score));
      carryover = [result.leftover];
    }
  }

  if (carryover.length === 1 && byePlayerId === null) {
    byePlayerId = carryover[0].id;
    carryover = [];
  }

  if (byePlayerId) {
    pairings.push({
      player1Id: byePlayerId,
      player2Id: null,
      tableNumber: tableNumber++,
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

// ─── Bracket pairing with backtracking ───────────────────────────────────────

interface BracketResult {
  paired: [PlayerState, PlayerState][];
  leftover: PlayerState | null;
}

function pairBracket(
  bracket: PlayerState[],
  alreadyPaired: Set<string>
): BracketResult {
  const available = bracket.filter((p) => !alreadyPaired.has(p.id));

  if (available.length === 0) return { paired: [], leftover: null };
  if (available.length === 1) return { paired: [], leftover: available[0] };

  const result = backtrackPair(available, [], 0);

  return {
    paired: result.pairs,
    leftover: result.leftover ?? null,
  };
}

interface BacktrackResult {
  pairs: [PlayerState, PlayerState][];
  leftover: PlayerState | undefined;
  success: boolean;
}

function backtrackPair(
  remaining: PlayerState[],
  currentPairs: [PlayerState, PlayerState][],
  iterations: number
): BacktrackResult {
  if (iterations > MAX_BACKTRACK) {
    return greedyPair(remaining, currentPairs);
  }

  if (remaining.length === 0) {
    return { pairs: currentPairs, leftover: undefined, success: true };
  }

  if (remaining.length === 1) {
    return { pairs: currentPairs, leftover: remaining[0], success: true };
  }

  const [first, ...rest] = remaining;
  const candidates = rankCandidates(first, rest);

  for (const candidate of candidates) {
    const newRemaining = rest.filter((p) => p.id !== candidate.id);
    const newPairs: [PlayerState, PlayerState][] = [
      ...currentPairs,
      [first, candidate],
    ];

    const result = backtrackPair(newRemaining, newPairs, iterations + 1);
    if (result.success) return result;
  }

  if (rest.length % 2 === 0) {
    const result = backtrackPair(rest, currentPairs, iterations + 1);
    if (result.success) return { ...result, leftover: first };
  }

  return { pairs: currentPairs, leftover: first, success: false };
}

function rankCandidates(
  player: PlayerState,
  candidates: PlayerState[]
): PlayerState[] {
  const nonRematches = candidates.filter(
    (c) => !player.opponents.includes(c.id)
  );
  const rematches = candidates.filter((c) => player.opponents.includes(c.id));
  return [...nonRematches, ...rematches];
}

function greedyPair(
  remaining: PlayerState[],
  currentPairs: [PlayerState, PlayerState][]
): BacktrackResult {
  const pairs: [PlayerState, PlayerState][] = [...currentPairs];
  const list = [...remaining];
  let leftover: PlayerState | undefined;

  while (list.length >= 2) {
    pairs.push([list.shift()!, list.shift()!]);
  }
  if (list.length === 1) leftover = list[0];

  return { pairs, leftover, success: true };
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
    matchWinPct.set(player.id, calcMatchWinPct(player, allMatches));
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

    const gw = gameWinPct.get(player.id) ?? 0;

    const ogw =
      opponents.length > 0
        ? opponents.reduce(
            (sum, oppId) => sum + (gameWinPct.get(oppId) ?? MIN_GW),
            0
          ) / opponents.length
        : 0;

    result.set(player.id, {
      omw: Math.max(omw, opponents.length > 0 ? MIN_OMW : 0),
      gw: Math.max(gw, MIN_GW),
      ogw: Math.max(ogw, opponents.length > 0 ? MIN_GW : 0),
    });
  }

  return result;
}

function calcMatchWinPct(
  player: PlayerState,
  allMatches: MatchRecord[]
): number {
  const matches = allMatches.filter(
    (m) => m.playerId === player.id && !m.isBye
  );
  if (matches.length === 0) return MIN_OMW;

  const points = matches.reduce((sum, m) => {
    if (m.playerWins > m.opponentWins) return sum + 3;
    if (m.draws > 0) return sum + 1;
    return sum;
  }, 0);

  return Math.max(points / (matches.length * 3), MIN_OMW);
}

function calcGameWinPct(playerId: string, allMatches: MatchRecord[]): number {
  const matches = allMatches.filter(
    (m) => m.playerId === playerId && !m.isBye
  );
  if (matches.length === 0) return MIN_GW;

  const totalGames = matches.reduce(
    (sum, m) => sum + m.playerWins + m.opponentWins + m.draws,
    0
  );
  const totalWins = matches.reduce((sum, m) => sum + m.playerWins, 0);

  if (totalGames === 0) return MIN_GW;
  return Math.max(totalWins / totalGames, MIN_GW);
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
