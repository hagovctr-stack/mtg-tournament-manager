import { replayTournamentElo, type EloReplayMatch } from './eloService';
import {
  MAX_TOURNAMENT_PLAYERS,
  usesDraftPodSeating,
  type TournamentFormat,
} from './tournamentRules';

export type BestOfFormat = 'BO1' | 'BO3' | 'BO5';

export const MIN_SIMULATION_PLAYERS = 6;
export const MIN_DRAFT_POD_PLAYERS = 6;
export const MAX_DRAFT_POD_PLAYERS = 12;

export function getSimulationParticipantRange(format: string, poolSize: number) {
  const maxPlayers = Math.min(
    usesDraftPodSeating(format) ? MAX_DRAFT_POD_PLAYERS : MAX_TOURNAMENT_PLAYERS,
    poolSize,
  );
  const minPlayers = Math.min(
    usesDraftPodSeating(format) ? MIN_DRAFT_POD_PLAYERS : MIN_SIMULATION_PLAYERS,
    maxPlayers,
  );

  return {
    minPlayers,
    maxPlayers,
  };
}

export type SimulationPoolPlayer = {
  name: string;
  dciNumber: string;
};

export type SimulationResultInput = {
  wins1: number;
  wins2: number;
  draws: number;
};

export type PoolRatingSnapshot = {
  playerId: string | null;
  name: string;
  dciNumber: string;
  rating: number;
};

export type SimulationRoundMatch = {
  id: string;
  tableNumber: number;
  result: string;
  player1: { name: string };
  player2: { name: string } | null;
};

export type SimulationRound = {
  number: number;
  matches: SimulationRoundMatch[];
};

export type SimulationStanding = {
  rank: number;
  matchPoints: number;
  player: {
    name: string;
    elo: number;
  };
};

export type RatingValidationMismatch = {
  playerId: string;
  playerName: string;
  expected: number;
  actual: number;
};

export type CurrentEloMismatch = {
  tournamentId: string;
  tournamentName: string;
  playerId: string;
  playerName: string;
  expected: number;
  actual: number;
};

export type StartingEloMismatch = {
  tournamentId: string;
  tournamentName: string;
  playerId: string;
  playerName: string;
  expectedStartingElo: number;
  actualStartingElo: number;
};

export type RatingValidationResult = {
  ok: boolean;
  expectedRatings: Map<string, number>;
  actualRatings: Map<string, number>;
  playerRatingMismatches: RatingValidationMismatch[];
  currentEloMismatches: CurrentEloMismatch[];
  startingEloMismatches: StartingEloMismatch[];
};

export type PersistedTournamentRegistration = {
  tournamentPlayerId: string;
  playerId: string | null;
  playerName: string;
  startingElo: number;
  currentElo: number;
};

export type PersistedTournamentHistory = {
  tournamentId: string;
  tournamentName: string;
  createdAt: string;
  registrations: PersistedTournamentRegistration[];
  matches: EloReplayMatch[];
};

export type ActualPlayerRating = {
  playerId: string;
  name: string;
  rating: number;
};

export type SimulationRuntime = {
  ensurePool(players: SimulationPoolPlayer[]): Promise<PoolRatingSnapshot[]>;
  getPoolRatings(players: SimulationPoolPlayer[]): Promise<PoolRatingSnapshot[]>;
  createTournament(input: {
    name: string;
    format: TournamentFormat;
    bestOfFormat: BestOfFormat;
  }): Promise<{ id: string; name: string }>;
  addPlayer(tournamentId: string, input: { name: string; dciNumber: string }): Promise<void>;
  startTournament(tournamentId: string): Promise<{ id: string; totalRounds: number }>;
  randomizeSeats(tournamentId: string): Promise<void>;
  generateRound(tournamentId: string): Promise<SimulationRound | null>;
  reportResult(matchId: string, input: SimulationResultInput): Promise<void>;
  finishTournament(tournamentId: string): Promise<void>;
  getStandings(tournamentId: string): Promise<SimulationStanding[]>;
  validatePoolRatings(playerIds: string[]): Promise<RatingValidationResult>;
};

export type TournamentParticipantSummary = {
  name: string;
  dciNumber: string;
  startRating: number;
  endRating: number;
  delta: number;
};

export type TournamentRoundSummary = {
  number: number;
  matches: Array<{
    tableNumber: number;
    player1: string;
    player2: string | null;
    result: string;
  }>;
};

export type TournamentSimulationSummary = {
  index: number;
  tournamentId: string;
  tournamentName: string;
  format: TournamentFormat;
  bestOfFormat: BestOfFormat;
  participants: TournamentParticipantSummary[];
  rounds: TournamentRoundSummary[];
  standings: SimulationStanding[];
  validation: RatingValidationResult;
};

export type SimulationSeriesSummary = {
  seed: string;
  tournaments: TournamentSimulationSummary[];
  finalRatings: PoolRatingSnapshot[];
  finalValidation: RatingValidationResult;
  playerIds: string[];
};

const NAMED_SIMULATION_POOL: SimulationPoolPlayer[] = [
  { name: 'Alice Mercer', dciNumber: 'SIM-001' },
  { name: 'Bruno Salvat', dciNumber: 'SIM-002' },
  { name: 'Carla Nunez', dciNumber: 'SIM-003' },
  { name: 'Diego Paredes', dciNumber: 'SIM-004' },
  { name: 'Elena Costa', dciNumber: 'SIM-005' },
  { name: 'Federico Paz', dciNumber: 'SIM-006' },
  { name: 'Gabriela Soto', dciNumber: 'SIM-007' },
  { name: 'Hector Luna', dciNumber: 'SIM-008' },
  { name: 'Ines Vidal', dciNumber: 'SIM-009' },
  { name: 'Javier Rios', dciNumber: 'SIM-010' },
  { name: 'Kiara Mendez', dciNumber: 'SIM-011' },
  { name: 'Lucas Ferrer', dciNumber: 'SIM-012' },
];

export function buildSimulationPlayerPool(
  totalPlayers = MAX_TOURNAMENT_PLAYERS,
): SimulationPoolPlayer[] {
  if (totalPlayers <= NAMED_SIMULATION_POOL.length) {
    return NAMED_SIMULATION_POOL.slice(0, totalPlayers);
  }

  const generatedPlayers = Array.from(
    { length: totalPlayers - NAMED_SIMULATION_POOL.length },
    (_, index) => {
      const playerNumber = NAMED_SIMULATION_POOL.length + index + 1;
      const suffix = String(playerNumber).padStart(3, '0');
      return {
        name: `Simulation Player ${suffix}`,
        dciNumber: `SIM-${suffix}`,
      };
    },
  );

  return [...NAMED_SIMULATION_POOL, ...generatedPlayers];
}

export const SIMULATION_PLAYER_POOL: SimulationPoolPlayer[] = buildSimulationPlayerPool();

const BEST_OF_FORMAT_OPTIONS: readonly BestOfFormat[] = ['BO1', 'BO3', 'BO5'] as const;

const TOURNAMENT_FORMAT_OPTIONS: readonly TournamentFormat[] = [
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
] as const;

type WeightedResultOption = SimulationResultInput & {
  label: string;
  weight: number;
};

const RESULT_OPTIONS: Record<BestOfFormat, WeightedResultOption[]> = {
  BO1: [
    { wins1: 1, wins2: 0, draws: 0, label: '1-0', weight: 0.5 },
    { wins1: 0, wins2: 1, draws: 0, label: '0-1', weight: 0.5 },
  ],
  BO3: [
    { wins1: 2, wins2: 0, draws: 0, label: '2-0', weight: 0.225 },
    { wins1: 2, wins2: 1, draws: 0, label: '2-1', weight: 0.225 },
    { wins1: 1, wins2: 2, draws: 0, label: '1-2', weight: 0.225 },
    { wins1: 0, wins2: 2, draws: 0, label: '0-2', weight: 0.225 },
    { wins1: 1, wins2: 1, draws: 0, label: '1-1 draw', weight: 0.1 },
  ],
  BO5: [
    { wins1: 3, wins2: 0, draws: 0, label: '3-0', weight: 0.1566666667 },
    { wins1: 3, wins2: 1, draws: 0, label: '3-1', weight: 0.1566666667 },
    { wins1: 3, wins2: 2, draws: 0, label: '3-2', weight: 0.1566666667 },
    { wins1: 2, wins2: 3, draws: 0, label: '2-3', weight: 0.1566666667 },
    { wins1: 1, wins2: 3, draws: 0, label: '1-3', weight: 0.1566666667 },
    { wins1: 0, wins2: 3, draws: 0, label: '0-3', weight: 0.1566666667 },
    { wins1: 2, wins2: 2, draws: 0, label: '2-2 draw', weight: 0.06 },
  ],
};

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

async function resolveDb(db?: any) {
  if (db) return db;
  const { prisma } = await import('./db');
  return prisma;
}

function hashSeed(seed: string | number) {
  const text = String(seed);
  let hash = 1779033703 ^ text.length;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^= hash >>> 16) >>> 0;
  };
}

export function createSeededRandom(seed: string | number) {
  let state = hashSeed(seed)();
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomIntInclusive(rng: () => number, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function shuffleWithRng<T>(items: T[], rng: () => number) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function pickTournamentParticipants(
  pool: SimulationPoolPlayer[],
  rng: () => number,
  format: TournamentFormat,
  forceFullCapacity = false,
) {
  const { minPlayers, maxPlayers } = getSimulationParticipantRange(format, pool.length);
  const participantCount = forceFullCapacity
    ? maxPlayers
    : randomIntInclusive(rng, minPlayers, maxPlayers);
  return shuffleWithRng(pool, rng).slice(0, participantCount);
}

export function pickBestOfFormat(rng: () => number): BestOfFormat {
  return BEST_OF_FORMAT_OPTIONS[Math.floor(rng() * BEST_OF_FORMAT_OPTIONS.length)]!;
}

export function pickTournamentFormat(rng: () => number): TournamentFormat {
  return TOURNAMENT_FORMAT_OPTIONS[Math.floor(rng() * TOURNAMENT_FORMAT_OPTIONS.length)]!;
}

export function usesDraftPodSimulationSeating(format: TournamentFormat) {
  return usesDraftPodSeating(format);
}

function pickNonDraftPodFormat(rng: () => number): TournamentFormat {
  const eligibleFormats = TOURNAMENT_FORMAT_OPTIONS.filter(
    (format) => !usesDraftPodSimulationSeating(format),
  );
  return eligibleFormats[Math.floor(rng() * eligibleFormats.length)]!;
}

function pickWeightedOption<T extends { weight: number }>(options: T[], rng: () => number) {
  const totalWeight = options.reduce((sum, option) => sum + option.weight, 0);
  let remaining = rng() * totalWeight;
  for (const option of options) {
    remaining -= option.weight;
    if (remaining <= 0) return option;
  }
  return options[options.length - 1]!;
}

export function generateRandomResult(
  format: BestOfFormat,
  rng: () => number,
): SimulationResultInput {
  const option = pickWeightedOption(RESULT_OPTIONS[format], rng);
  return { wins1: option.wins1, wins2: option.wins2, draws: option.draws };
}

export function describeResult(input: SimulationResultInput) {
  if (input.wins1 === input.wins2) return `${input.wins1}-${input.wins2} draw`;
  return `${input.wins1}-${input.wins2}`;
}

export function isValidRandomResult(format: BestOfFormat, input: SimulationResultInput) {
  return RESULT_OPTIONS[format].some(
    (option) =>
      option.wins1 === input.wins1 && option.wins2 === input.wins2 && option.draws === input.draws,
  );
}

export function validatePersistedTournamentRatings(
  finishedTournaments: PersistedTournamentHistory[],
  actualPlayers: ActualPlayerRating[],
): RatingValidationResult {
  const expectedRatings = new Map<string, number>();
  const actualRatings = new Map(actualPlayers.map((player) => [player.playerId, player.rating]));
  const currentEloMismatches: CurrentEloMismatch[] = [];
  const startingEloMismatches: StartingEloMismatch[] = [];
  const playerRatingMismatches: RatingValidationMismatch[] = [];
  const seenPlayerIds = new Set<string>();

  const orderedTournaments = [...finishedTournaments].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.tournamentId.localeCompare(right.tournamentId),
  );

  for (const tournament of orderedTournaments) {
    const replayedRatings = replayTournamentElo(
      tournament.registrations.map((registration) => ({
        id: registration.tournamentPlayerId,
        startingElo: registration.startingElo,
      })),
      tournament.matches,
    );

    for (const registration of tournament.registrations) {
      const replayedCurrent =
        replayedRatings.get(registration.tournamentPlayerId) ?? registration.startingElo;

      if (registration.currentElo !== replayedCurrent) {
        currentEloMismatches.push({
          tournamentId: tournament.tournamentId,
          tournamentName: tournament.tournamentName,
          playerId: registration.playerId ?? registration.tournamentPlayerId,
          playerName: registration.playerName,
          expected: replayedCurrent,
          actual: registration.currentElo,
        });
      }

      if (!registration.playerId) continue;

      seenPlayerIds.add(registration.playerId);
      const previousExpected = expectedRatings.get(registration.playerId);
      if (previousExpected !== undefined && previousExpected !== registration.startingElo) {
        startingEloMismatches.push({
          tournamentId: tournament.tournamentId,
          tournamentName: tournament.tournamentName,
          playerId: registration.playerId,
          playerName: registration.playerName,
          expectedStartingElo: previousExpected,
          actualStartingElo: registration.startingElo,
        });
      }

      expectedRatings.set(registration.playerId, replayedCurrent);
    }
  }

  for (const player of actualPlayers) {
    if (!seenPlayerIds.has(player.playerId)) continue;
    const expected = expectedRatings.get(player.playerId);
    if (expected === undefined) continue;
    if (expected !== player.rating) {
      playerRatingMismatches.push({
        playerId: player.playerId,
        playerName: player.name,
        expected,
        actual: player.rating,
      });
    }
  }

  return {
    ok:
      currentEloMismatches.length === 0 &&
      startingEloMismatches.length === 0 &&
      playerRatingMismatches.length === 0,
    expectedRatings,
    actualRatings,
    playerRatingMismatches,
    currentEloMismatches,
    startingEloMismatches,
  };
}

export function buildValidationFailureMessage(result: RatingValidationResult) {
  if (result.ok) return 'validation ok';

  const lines: string[] = [];

  for (const mismatch of result.playerRatingMismatches) {
    lines.push(
      `player rating mismatch: ${mismatch.playerName} expected ${mismatch.expected}, actual ${mismatch.actual}`,
    );
  }

  for (const mismatch of result.currentEloMismatches) {
    lines.push(
      `tournament currentElo mismatch: ${mismatch.tournamentName} / ${mismatch.playerName} expected ${mismatch.expected}, actual ${mismatch.actual}`,
    );
  }

  for (const mismatch of result.startingEloMismatches) {
    lines.push(
      `startingElo continuity mismatch: ${mismatch.tournamentName} / ${mismatch.playerName} expected ${mismatch.expectedStartingElo}, actual ${mismatch.actualStartingElo}`,
    );
  }

  return lines.join('\n');
}

export async function validatePersistedPlayerRatings(playerIds: string[], db?: any) {
  const client = await resolveDb(db);

  const actualPlayers = await client.player.findMany({
    where: { id: { in: playerIds } },
    select: { id: true, name: true, rating: true },
  });

  const tournaments = await client.tournament.findMany({
    where: {
      status: 'FINISHED',
      players: {
        some: {
          playerId: { in: playerIds },
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: {
      players: {
        select: {
          id: true,
          playerId: true,
          displayName: true,
          startingElo: true,
          currentElo: true,
        },
      },
      rounds: {
        orderBy: { number: 'asc' },
        include: {
          matches: {
            orderBy: { tableNumber: 'asc' },
            select: {
              tableNumber: true,
              player1TournamentPlayerId: true,
              player2TournamentPlayerId: true,
              result: true,
            },
          },
        },
      },
    },
  });

  const histories: PersistedTournamentHistory[] = tournaments.map((tournament: any) => ({
    tournamentId: tournament.id,
    tournamentName: tournament.name,
    createdAt: tournament.createdAt.toISOString(),
    registrations: tournament.players.map((registration: any) => ({
      tournamentPlayerId: registration.id,
      playerId: registration.playerId,
      playerName: registration.displayName,
      startingElo: registration.startingElo,
      currentElo: registration.currentElo,
    })),
    matches: tournament.rounds.flatMap((round: any) =>
      round.matches.map((match: any) => ({
        roundNumber: round.number,
        tableNumber: match.tableNumber,
        player1Id: match.player1TournamentPlayerId,
        player2Id: match.player2TournamentPlayerId,
        result: match.result,
      })),
    ),
  }));

  return validatePersistedTournamentRatings(
    histories,
    actualPlayers.map((player: any) => ({
      playerId: player.id,
      name: player.name,
      rating: player.rating,
    })),
  );
}

export async function createRealSimulationRuntime(db?: any): Promise<SimulationRuntime> {
  const client = await resolveDb(db);
  const standingsService = await import('./standingsService');
  const tournamentService = await import('./tournamentService');

  const fetchPoolRatings = async (
    players: SimulationPoolPlayer[],
  ): Promise<PoolRatingSnapshot[]> => {
    const records = await client.player.findMany({
      where: {
        dciNumber: {
          in: players.map((player) => player.dciNumber),
        },
      },
      select: { id: true, name: true, dciNumber: true, rating: true },
    });

    const byDciNumber = new Map<
      string,
      { id: string; name: string; dciNumber: string | null; rating: number }
    >(
      records
        .filter((record: any) => record.dciNumber)
        .map((record: any) => [record.dciNumber as string, record]),
    );

    return players.map((player) => {
      const record = byDciNumber.get(player.dciNumber);
      return {
        playerId: record?.id ?? null,
        name: record?.name ?? player.name,
        dciNumber: player.dciNumber,
        rating: record?.rating ?? 1500,
      };
    });
  };

  return {
    async ensurePool(players) {
      await Promise.all(
        players.map((player) =>
          client.player.upsert({
            where: { dciNumber: player.dciNumber },
            update: {
              name: player.name,
              normalizedName: normalizeName(player.name),
            },
            create: {
              name: player.name,
              normalizedName: normalizeName(player.name),
              dciNumber: player.dciNumber,
              rating: 1500,
            },
          }),
        ),
      );

      return fetchPoolRatings(players);
    },

    getPoolRatings(players) {
      return fetchPoolRatings(players);
    },

    async createTournament(input) {
      const tournament = await tournamentService.createTournament({
        name: input.name,
        format: input.format,
        bestOfFormat: input.bestOfFormat,
      });
      return { id: tournament.id, name: tournament.name };
    },

    async addPlayer(tournamentId, input) {
      await tournamentService.addPlayer(tournamentId, input);
    },

    async startTournament(tournamentId) {
      const tournament = await tournamentService.startTournament(tournamentId);
      return { id: tournament.id, totalRounds: tournament.totalRounds };
    },

    async randomizeSeats(tournamentId) {
      await tournamentService.randomizeSeats(tournamentId);
    },

    async generateRound(tournamentId) {
      return (await tournamentService.generateNextRound(tournamentId)) as SimulationRound | null;
    },

    async reportResult(matchId, input) {
      await tournamentService.reportResult(matchId, input);
    },

    async finishTournament(tournamentId) {
      await tournamentService.finishTournament(tournamentId);
    },

    async getStandings(tournamentId) {
      return (await standingsService.getStandings(tournamentId)) as SimulationStanding[];
    },

    validatePoolRatings(playerIds) {
      return validatePersistedPlayerRatings(playerIds, client);
    },
  };
}

function formatDelta(delta: number) {
  return delta >= 0 ? `+${delta}` : `${delta}`;
}

function logRatingsTable(
  log: (line: string) => void,
  title: string,
  ratings: PoolRatingSnapshot[],
) {
  log(title);
  for (const rating of ratings) {
    log(`  ${rating.name.padEnd(16)} ${String(rating.rating).padStart(4)}`);
  }
}

export type RunSeededTournamentSimulationOptions = {
  seed?: string;
  tournamentCount?: number;
  pool?: SimulationPoolPlayer[];
  runtime: SimulationRuntime;
  log?: (line: string) => void;
  namePrefix?: string;
};

export async function runSeededTournamentSimulation(
  options: RunSeededTournamentSimulationOptions,
): Promise<SimulationSeriesSummary> {
  const seed = options.seed ?? 'mtg-sim';
  const tournamentCount = options.tournamentCount ?? 10;
  const pool = options.pool ?? SIMULATION_PLAYER_POOL;
  const log = options.log ?? (() => undefined);
  const rng = createSeededRandom(seed);
  const ensuredPool = await options.runtime.ensurePool(pool);
  const playerIds = ensuredPool
    .map((player) => player.playerId)
    .filter((playerId): playerId is string => Boolean(playerId));

  if (playerIds.length !== pool.length) {
    throw new Error('Simulation pool did not resolve to persistent player ids');
  }

  log(`Simulation seed: ${seed}`);
  log(`Pool size: ${pool.length}`);
  log('');

  const tournaments: TournamentSimulationSummary[] = [];

  for (let tournamentIndex = 1; tournamentIndex <= tournamentCount; tournamentIndex += 1) {
    const beforeRatings = await options.runtime.getPoolRatings(pool);
    const beforeByDci = new Map(beforeRatings.map((rating) => [rating.dciNumber, rating.rating]));
    const forceFullCapacity = tournamentIndex === tournamentCount;
    const initialFormat = pickTournamentFormat(rng);
    const format =
      forceFullCapacity && usesDraftPodSimulationSeating(initialFormat)
        ? pickNonDraftPodFormat(rng)
        : initialFormat;
    const participants = pickTournamentParticipants(pool, rng, format, forceFullCapacity);
    const bestOfFormat = pickBestOfFormat(rng);
    const tournamentName = `${options.namePrefix ?? 'Simulation'} ${seed} #${tournamentIndex}`;

    const tournament = await options.runtime.createTournament({
      name: tournamentName,
      format,
      bestOfFormat,
    });

    for (const participant of participants) {
      await options.runtime.addPlayer(tournament.id, {
        name: participant.name,
        dciNumber: participant.dciNumber,
      });
    }

    const startedTournament = await options.runtime.startTournament(tournament.id);
    if (usesDraftPodSimulationSeating(format)) {
      await options.runtime.randomizeSeats(tournament.id);
    }
    const rounds: TournamentRoundSummary[] = [];

    for (let roundIndex = 0; roundIndex < startedTournament.totalRounds; roundIndex += 1) {
      const round = await options.runtime.generateRound(tournament.id);
      if (!round) break;

      const matchSummaries: TournamentRoundSummary['matches'] = [];
      for (const match of round.matches) {
        if (match.result === 'BYE' || !match.player2) {
          matchSummaries.push({
            tableNumber: match.tableNumber,
            player1: match.player1.name,
            player2: match.player2?.name ?? null,
            result: 'BYE',
          });
          continue;
        }

        const randomResult = generateRandomResult(bestOfFormat, rng);
        await options.runtime.reportResult(match.id, randomResult);
        matchSummaries.push({
          tableNumber: match.tableNumber,
          player1: match.player1.name,
          player2: match.player2.name,
          result: describeResult(randomResult),
        });
      }

      rounds.push({ number: round.number, matches: matchSummaries });
    }

    await options.runtime.finishTournament(tournament.id);

    const standings = await options.runtime.getStandings(tournament.id);
    const afterRatings = await options.runtime.getPoolRatings(pool);
    const afterByDci = new Map(afterRatings.map((rating) => [rating.dciNumber, rating.rating]));
    const validation = await options.runtime.validatePoolRatings(playerIds);

    const participantSummaries = participants.map((participant) => {
      const startRating = beforeByDci.get(participant.dciNumber) ?? 1500;
      const endRating = afterByDci.get(participant.dciNumber) ?? startRating;
      return {
        name: participant.name,
        dciNumber: participant.dciNumber,
        startRating,
        endRating,
        delta: endRating - startRating,
      };
    });

    const summary: TournamentSimulationSummary = {
      index: tournamentIndex,
      tournamentId: tournament.id,
      tournamentName,
      format,
      bestOfFormat,
      participants: participantSummaries,
      rounds,
      standings,
      validation,
    };

    tournaments.push(summary);

    log(`Tournament ${tournamentIndex}: ${tournamentName}`);
    log(`Format: ${format} · ${bestOfFormat}`);
    log(`Participants: ${participants.length}${forceFullCapacity ? ' (full room)' : ''}`);
    logRatingsTable(log, 'Global ratings before:', beforeRatings);
    log('Roster ELO delta:');
    for (const participant of participantSummaries) {
      log(
        `  ${participant.name.padEnd(16)} ${String(participant.startRating).padStart(4)} -> ${String(
          participant.endRating,
        ).padStart(4)} (${formatDelta(participant.delta)})`,
      );
    }
    log('Round results:');
    for (const round of rounds) {
      log(`  Round ${round.number}`);
      for (const match of round.matches) {
        const pairing = match.player2
          ? `${match.player1} vs ${match.player2}`
          : `${match.player1} BYE`;
        log(`    Table ${match.tableNumber}: ${pairing} -> ${match.result}`);
      }
    }
    log('Standings:');
    for (const standing of standings) {
      log(
        `  ${standing.rank}. ${standing.player.name.padEnd(16)} ${String(standing.matchPoints).padStart(2)} pts ELO ${standing.player.elo}`,
      );
    }
    logRatingsTable(log, 'Global ratings after:', afterRatings);
    log(`Validation: ${validation.ok ? 'OK' : 'FAILED'}`);
    if (!validation.ok) {
      log(buildValidationFailureMessage(validation));
      throw new Error(`Simulation validation failed after ${tournamentName}`);
    }
    log('');
  }

  const finalRatings = await options.runtime.getPoolRatings(pool);
  const finalValidation = await options.runtime.validatePoolRatings(playerIds);

  log('Final rating table:');
  for (const rating of finalRatings) {
    log(`  ${rating.name.padEnd(16)} ${String(rating.rating).padStart(4)}`);
  }
  log(`Final validation: ${finalValidation.ok ? 'OK' : 'FAILED'}`);
  if (!finalValidation.ok) {
    log(buildValidationFailureMessage(finalValidation));
    throw new Error('Simulation validation failed at final replay check');
  }

  return {
    seed,
    tournaments,
    finalRatings,
    finalValidation,
    playerIds,
  };
}
