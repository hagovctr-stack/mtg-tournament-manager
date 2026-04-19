import { prisma } from './db';
import {
  generatePairings,
  generateSeatPairings,
  recommendedRounds,
  type PlayerState,
} from './pairingAlgorithm';
import {
  ensureTournamentHasCapacity,
  usesDraftPodSeating,
  validateTournamentPlayerCount,
} from './tournamentRules';
import { recalculateTournamentElo, syncTournamentEloToPlayerRatings } from './eloService';
import { recalculateStandings } from './standingsService';
import { serializeEventPlayer, serializeMatch, serializeRound } from './presenters';

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeDciNumber(dciNumber?: string) {
  const normalized = dciNumber?.trim();
  return normalized ? normalized : null;
}

const VALID_BEST_OF_FORMATS = ['BO1', 'BO3', 'BO5', 'FREE'] as const;
type BestOfFormat = (typeof VALID_BEST_OF_FORMATS)[number];

function validateResult(wins1: number, wins2: number, format: BestOfFormat): void {
  if (!Number.isInteger(wins1) || !Number.isInteger(wins2) || wins1 < 0 || wins2 < 0) {
    throw new Error('Wins must be non-negative integers');
  }
  if (wins1 === 0 && wins2 === 0) throw new Error('Result cannot be 0-0');

  if (format === 'BO1') {
    if (wins1 > 1 || wins2 > 1) throw new Error('BO1: neither player can have more than 1 win');
    if (wins1 === wins2) throw new Error('BO1: draws are not allowed');
  } else if (format === 'BO3') {
    if (wins1 > 2 || wins2 > 2) throw new Error('BO3: neither player can have more than 2 wins');
    if (wins1 === wins2 && wins1 !== 1) throw new Error('BO3: the only valid draw is 1-1');
  } else if (format === 'BO5') {
    if (wins1 > 3 || wins2 > 3) throw new Error('BO5: neither player can have more than 3 wins');
    if (wins1 === wins2 && wins1 !== 2) throw new Error('BO5: the only valid draw is 2-2');
  }
  // FREE: no restrictions
}

export async function createTournament(data: {
  name: string;
  format?: string;
  subtitle?: string;
  cubeCobraUrl?: string;
  bestOfFormat?: string;
  totalRounds?: number;
}) {
  const bestOfFormat = (data.bestOfFormat ?? 'BO3').toUpperCase();
  if (!VALID_BEST_OF_FORMATS.includes(bestOfFormat as BestOfFormat)) {
    throw new Error(`Invalid bestOfFormat. Must be one of: ${VALID_BEST_OF_FORMATS.join(', ')}`);
  }
  return prisma.tournament.create({
    data: {
      name: data.name,
      format: data.format ?? 'Cube',
      subtitle: data.subtitle ?? '',
      cubeCobraUrl: data.cubeCobraUrl ?? null,
      bestOfFormat,
      totalRounds: data.totalRounds ?? 0,
    },
  });
}

export async function getTournament(id: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      players: {
        where: { active: true },
        orderBy: [{ seatNumber: 'asc' }, { id: 'asc' }],
        include: { player: { select: { avatarUrl: true } } },
      },
      rounds: {
        orderBy: { number: 'asc' },
        include: {
          matches: {
            include: { player1: true, player2: true },
            orderBy: { tableNumber: 'asc' },
          },
        },
      },
      standings: { include: { tournamentPlayer: true }, orderBy: { rank: 'asc' } },
    },
  });

  if (!tournament) return null;

  return {
    id: tournament.id,
    name: tournament.name,
    format: tournament.format,
    subtitle: tournament.subtitle,
    cubeCobraUrl: tournament.cubeCobraUrl,
    bestOfFormat: tournament.bestOfFormat,
    status: tournament.status,
    totalRounds: tournament.totalRounds,
    currentRound: tournament.currentRound,
    createdAt: tournament.createdAt.toISOString(),
    updatedAt: tournament.updatedAt.toISOString(),
    players: tournament.players.map(serializeEventPlayer),
    rounds: tournament.rounds.map(serializeRound),
    standings: tournament.standings.map((standing: any) => ({
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
    })),
  };
}

export async function listTournaments() {
  return prisma.tournament.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { players: true } } },
  });
}

export async function createPlayer(
  data: { name: string; dciNumber?: string; elo?: number },
  force = false,
) {
  const name = data.name.trim();
  if (!name) throw new Error('Player name is required');

  const dciNumber = normalizeDciNumber(data.dciNumber);
  if (dciNumber) {
    const existing = await prisma.player.findUnique({ where: { dciNumber } });
    if (existing) throw new Error('Player with this DCI number already exists');
  }

  const normalizedName = normalizeName(name);
  if (!force) {
    const duplicate = await prisma.player.findFirst({ where: { normalizedName } });
    if (duplicate) {
      const err = new Error(`A player named "${duplicate.name}" already exists`) as any;
      err.status = 409;
      err.code = 'DUPLICATE_NAME';
      throw err;
    }
  }

  const player = await prisma.player.create({
    data: {
      name,
      normalizedName,
      dciNumber,
      rating: data.elo ?? 1500,
    },
  });

  return {
    ...serializeGlobalPlayerBase(player),
    stats: buildPlayerStats([]),
  };
}

export async function addPlayer(
  tournamentId: string,
  data: { name: string; dciNumber?: string; elo?: number },
) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { players: { where: { active: true }, select: { id: true } } },
  });
  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'REGISTRATION') throw new Error('Tournament already started');

  const activePlayerCount = tournament.players.length;
  const name = data.name.trim();
  const dciNumber = normalizeDciNumber(data.dciNumber);
  const normalizedName = normalizeName(name);

  const existingByName = await prisma.tournamentPlayer.findFirst({
    where: { tournamentId, active: true, displayName: { equals: name, mode: 'insensitive' } },
  });
  if (existingByName) throw new Error('Player already added to this tournament');

  let matchedByNameFallback = false;

  let player = dciNumber ? await prisma.player.findUnique({ where: { dciNumber } }) : null;

  if (!player) {
    const matchedByName = await prisma.player.findMany({
      where: { normalizedName },
      take: 2,
    });
    if (matchedByName.length === 1) {
      player = matchedByName[0];
      matchedByNameFallback = true;
    }
  }

  let resolvedRegistration = player
    ? await prisma.tournamentPlayer.findFirst({
        where: { tournamentId, playerId: player.id },
      })
    : null;

  if (resolvedRegistration?.active && matchedByNameFallback) {
    ensureTournamentHasCapacity(tournament.format, activePlayerCount);
    const fallbackRating = data.elo ?? player?.rating ?? 1500;
    player = await prisma.player.create({
      data: {
        name,
        normalizedName,
        dciNumber: null,
        rating: fallbackRating,
      },
    });
    resolvedRegistration = null;
  }

  if (resolvedRegistration?.active) {
    throw new Error('Player already added to this tournament');
  }

  ensureTournamentHasCapacity(tournament.format, activePlayerCount);

  if (!player) {
    player = await prisma.player.create({
      data: {
        name,
        normalizedName,
        dciNumber,
        rating: data.elo ?? 1500,
      },
    });
  }

  if (resolvedRegistration) {
    const registration = await prisma.tournamentPlayer.update({
      where: { id: resolvedRegistration.id },
      data: {
        active: true,
        displayName: name,
        displayDciNumber: dciNumber,
        startingElo: data.elo ?? player.rating,
        currentElo: data.elo ?? player.rating,
      },
    });
    return serializeEventPlayer(registration);
  }

  const registration = await prisma.tournamentPlayer.create({
    data: {
      tournamentId,
      playerId: player.id,
      displayName: name,
      displayDciNumber: dciNumber,
      startingElo: data.elo ?? player.rating,
      currentElo: data.elo ?? player.rating,
    },
  });

  await prisma.standing.create({ data: { tournamentId, tournamentPlayerId: registration.id } });

  return serializeEventPlayer(registration);
}

export async function dropPlayer(playerId: string) {
  return prisma.tournamentPlayer.update({ where: { id: playerId }, data: { active: false } });
}

export async function deleteGlobalPlayer(id: string) {
  const registrations = await prisma.tournamentPlayer.count({ where: { playerId: id } });
  if (registrations > 0) {
    const err = new Error('Cannot delete a player with tournament history.') as any;
    err.status = 409;
    throw err;
  }
  return prisma.player.delete({ where: { id } });
}

export async function updatePlayerAvatar(id: string, avatarUrl: string) {
  const player = await prisma.player.update({ where: { id }, data: { avatarUrl } });
  return serializeGlobalPlayerBase(player);
}

export async function updateTournament(
  id: string,
  data: {
    name?: string;
    format?: string;
    subtitle?: string;
    cubeCobraUrl?: string | null;
    totalRounds?: number;
  },
) {
  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) throw new Error('Tournament not found');

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.subtitle !== undefined) updateData.subtitle = data.subtitle;
  if ('cubeCobraUrl' in data) updateData.cubeCobraUrl = data.cubeCobraUrl ?? null;
  if (data.format !== undefined && tournament.status === 'REGISTRATION')
    updateData.format = data.format;
  if (data.totalRounds !== undefined && tournament.status === 'REGISTRATION')
    updateData.totalRounds = data.totalRounds;

  return prisma.tournament.update({ where: { id }, data: updateData });
}

export async function randomizeSeats(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      players: { where: { active: true } },
      rounds: { select: { id: true } },
    },
  });
  if (!tournament) throw new Error('Tournament not found');
  if (!usesDraftPodSeating(tournament.format)) {
    throw new Error('Seat randomization is only available for Draft and Cube tournaments');
  }
  if (tournament.status !== 'ACTIVE') {
    throw new Error('Start the tournament before randomizing seats');
  }
  if (tournament.currentRound > 0 || tournament.rounds.length > 0) {
    throw new Error('Seats are locked once round 1 has been created');
  }
  validateTournamentPlayerCount(tournament.format, tournament.players.length);

  const players = [...tournament.players];
  for (let i = players.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [players[i], players[j]] = [players[j], players[i]];
  }

  await prisma.$transaction(
    players.map((player, index) =>
      prisma.tournamentPlayer.update({ where: { id: player.id }, data: { seatNumber: index + 1 } }),
    ),
  );

  return { seated: players.length };
}

export async function startTournament(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { players: { where: { active: true } } },
  });
  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'REGISTRATION') throw new Error('Tournament already started');
  validateTournamentPlayerCount(tournament.format, tournament.players.length);

  const totalRounds =
    tournament.totalRounds > 0
      ? tournament.totalRounds
      : recommendedRounds(tournament.players.length);

  return prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: 'ACTIVE', totalRounds },
  });
}

export async function generateNextRound(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      players: { where: { active: true } },
      rounds: { include: { matches: true }, orderBy: { number: 'desc' } },
      standings: true,
    },
  });

  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'ACTIVE') throw new Error('Tournament not active');

  if (tournament.rounds.length > 0) {
    const lastRound = tournament.rounds[0];
    if (lastRound.status !== 'FINISHED') throw new Error('Previous round not finished');
  }

  const newRoundNumber = tournament.rounds.length + 1;
  if (newRoundNumber > tournament.totalRounds) throw new Error('All rounds completed');

  const allSeated = tournament.players.every((player: any) => player.seatNumber != null);
  const requiresSeatPairings = newRoundNumber === 1 && usesDraftPodSeating(tournament.format);
  let pairings: ReturnType<typeof generatePairings>['pairings'];
  let byePlayerId: string | null;

  if (requiresSeatPairings) {
    if (!allSeated) {
      throw new Error('Randomize seats before generating round 1');
    }

    ({ pairings, byePlayerId } = generateSeatPairings(
      tournament.players.map((player: any) => ({
        id: player.id,
        seatNumber: player.seatNumber,
      })),
    ));
  } else {
    const playerStates = await buildPlayerStates(tournamentId);
    ({ pairings, byePlayerId } = generatePairings(playerStates));
  }

  const round = await prisma.$transaction(async (tx: any) => {
    const round = await tx.round.create({
      data: { tournamentId, number: newRoundNumber, status: 'ACTIVE', startedAt: new Date() },
    });

    for (const pairing of pairings) {
      if (pairing.isBye) {
        await tx.match.create({
          data: {
            roundId: round.id,
            tournamentId,
            tableNumber: pairing.tableNumber,
            player1TournamentPlayerId: pairing.player1Id,
            player2TournamentPlayerId: null,
            byeTournamentPlayerId: pairing.player1Id,
            result: 'BYE',
            wins1: 2,
            wins2: 0,
            draws: 0,
          },
        });
      } else {
        await tx.match.create({
          data: {
            roundId: round.id,
            tournamentId,
            tableNumber: pairing.tableNumber,
            player1TournamentPlayerId: pairing.player1Id,
            player2TournamentPlayerId: pairing.player2Id,
            result: 'PENDING',
          },
        });
      }
    }

    await tx.tournament.update({
      where: { id: tournamentId },
      data: { currentRound: newRoundNumber },
    });

    return round;
  });

  await recalculateStandings(tournamentId);

  const persistedRound = await prisma.round.findUnique({
    where: { id: round.id },
    include: {
      matches: {
        include: { player1: true, player2: true },
        orderBy: { tableNumber: 'asc' },
      },
    },
  });

  if (!persistedRound) return null;

  return serializeRound(persistedRound);
}

export async function reportResult(
  matchId: string,
  data: { wins1: number; wins2: number; draws: number },
) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { round: true, player1: { select: { tournamentId: true } } },
  });
  if (!match) throw new Error('Match not found');
  if (match.result === 'BYE') throw new Error('Cannot edit a bye match');

  // Validate against the tournament's best-of format
  const tournament = await prisma.tournament.findUnique({
    where: { id: match.tournamentId },
    select: { bestOfFormat: true, status: true },
  });
  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status === 'FINISHED') throw new Error('Tournament already finished');
  const bestOfFormat = tournament.bestOfFormat as BestOfFormat;
  validateResult(data.wins1, data.wins2, bestOfFormat);

  // If the round was already closed, reopen it so the edit is valid
  if (match.round.status === 'FINISHED') {
    await prisma.round.update({
      where: { id: match.roundId },
      data: { status: 'ACTIVE', finishedAt: null },
    });
  }

  let result: 'P1_WIN' | 'P2_WIN' | 'DRAW';
  if (data.wins1 > data.wins2) result = 'P1_WIN';
  else if (data.wins2 > data.wins1) result = 'P2_WIN';
  else result = 'DRAW';

  await prisma.match.update({
    where: { id: matchId },
    data: { wins1: data.wins1, wins2: data.wins2, draws: data.draws, result },
  });

  // Re-check: if all matches in the round are now reported, close it again
  const pendingMatches = await prisma.match.count({
    where: { roundId: match.roundId, result: 'PENDING' },
  });

  if (pendingMatches === 0) {
    await prisma.round.update({
      where: { id: match.roundId },
      data: { status: 'FINISHED', finishedAt: new Date() },
    });
  }

  await recalculateStandings(match.tournamentId);
  await recalculateTournamentElo(match.tournamentId);

  const persistedMatch = await prisma.match.findUnique({
    where: { id: matchId },
    include: { player1: true, player2: true },
  });

  return persistedMatch ? serializeMatch(persistedMatch) : null;
}

export async function finishTournament(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true },
  });

  if (!tournament) throw new Error('Tournament not found');

  await recalculateTournamentElo(tournamentId);

  return prisma.$transaction(async (tx: any) => {
    await syncTournamentEloToPlayerRatings(tournamentId, tx);
    return tx.tournament.update({
      where: { id: tournamentId },
      data: { status: 'FINISHED' },
    });
  });
}

export async function deleteTournament(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, name: true },
  });

  if (!tournament) throw new Error('Tournament not found');

  await prisma.$transaction(async (tx: any) => {
    await tx.match.deleteMany({
      where: { tournamentId },
    });

    await tx.standing.deleteMany({
      where: { tournamentId },
    });

    await tx.round.deleteMany({
      where: { tournamentId },
    });

    await tx.tournamentPlayer.deleteMany({
      where: { tournamentId },
    });

    await tx.tournament.delete({
      where: { id: tournamentId },
    });
  });

  return tournament;
}

function buildPlayerStats(registrations: any[]) {
  const totals = registrations.reduce(
    (acc: any, registration: any) => {
      acc.tournamentsPlayed += 1;
      if (registration.active) acc.activeRegistrations += 1;
      if (registration.tournament.status === 'FINISHED' && registration.standing?.rank === 1) {
        acc.trophies += 1;
      }
      if (registration.standing) {
        acc.matchWins += registration.standing.matchWins;
        acc.matchLosses += registration.standing.matchLosses;
        acc.matchDraws += registration.standing.matchDraws;
        acc.gameWins += registration.standing.gameWins;
        acc.gameLosses += registration.standing.gameLosses;
        acc.gameDraws += registration.standing.gameDraws;
      }
      return acc;
    },
    {
      tournamentsPlayed: 0,
      activeRegistrations: 0,
      trophies: 0,
      matchWins: 0,
      matchLosses: 0,
      matchDraws: 0,
      gameWins: 0,
      gameLosses: 0,
      gameDraws: 0,
    },
  );

  return {
    ...totals,
    matchWinRate:
      totals.matchWins + totals.matchLosses + totals.matchDraws > 0
        ? totals.matchWins / (totals.matchWins + totals.matchLosses + totals.matchDraws)
        : 0,
    gameWinRate:
      totals.gameWins + totals.gameLosses + totals.gameDraws > 0
        ? totals.gameWins / (totals.gameWins + totals.gameLosses + totals.gameDraws)
        : 0,
    lastTournamentAt: registrations[0]?.tournament.createdAt.toISOString() ?? null,
  };
}

function serializeGlobalPlayerBase(player: any) {
  return {
    id: player.id,
    name: player.name,
    normalizedName: player.normalizedName,
    dciNumber: player.dciNumber,
    rating: player.rating,
    avatarUrl: player.avatarUrl ?? null,
    createdAt: player.createdAt.toISOString(),
    updatedAt: player.updatedAt.toISOString(),
  };
}

function serializePlayerTournamentHistoryEntry(registration: any) {
  return {
    tournamentId: registration.tournamentId,
    tournamentPlayerId: registration.id,
    name: registration.tournament.name,
    status: registration.tournament.status,
    playedAt: registration.tournament.createdAt.toISOString(),
    displayName: registration.displayName,
    displayDciNumber: registration.displayDciNumber,
    startingElo: registration.startingElo,
    currentElo: registration.currentElo,
    endingElo: registration.tournament.status === 'FINISHED' ? registration.currentElo : null,
    active: registration.active,
    rank: registration.standing?.rank ?? null,
    matchPoints: registration.standing?.matchPoints ?? 0,
    matchWins: registration.standing?.matchWins ?? 0,
    matchLosses: registration.standing?.matchLosses ?? 0,
    matchDraws: registration.standing?.matchDraws ?? 0,
  };
}

function serializeGlobalPlayerSummary(player: any) {
  const registrations = player.tournaments ?? [];
  return {
    ...serializeGlobalPlayerBase(player),
    stats: buildPlayerStats(registrations),
    tournaments: registrations.map(serializePlayerTournamentHistoryEntry),
  };
}

export async function listPlayers() {
  const players = await prisma.player.findMany({
    include: {
      tournaments: {
        include: {
          tournament: true,
          standing: true,
        },
        orderBy: { tournament: { createdAt: 'desc' } },
      },
    },
    orderBy: [{ rating: 'desc' }, { name: 'asc' }],
  });

  return players.map((player: any) => {
    const summary = serializeGlobalPlayerSummary(player);
    return {
      ...serializeGlobalPlayerBase(player),
      stats: summary.stats,
    };
  });
}

export async function getPlayerSummary(playerId: string) {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    include: {
      tournaments: {
        include: {
          tournament: true,
          standing: true,
        },
        orderBy: { tournament: { createdAt: 'desc' } },
      },
    },
  });

  if (!player) return null;

  return serializeGlobalPlayerSummary(player);
}

export async function buildPlayerStates(tournamentId: string): Promise<PlayerState[]> {
  const data = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      players: { where: { active: true } },
      rounds: { include: { matches: true }, where: { status: 'FINISHED' } },
      standings: true,
    },
  });

  if (!data) throw new Error('Tournament not found');

  const opponents = new Map<string, string[]>();
  const hadBye = new Map<string, boolean>();

  for (const player of data.players) {
    opponents.set(player.id, []);
    hadBye.set(player.id, false);
  }

  for (const round of data.rounds) {
    for (const match of round.matches) {
      if (match.result === 'BYE') {
        hadBye.set(match.player1TournamentPlayerId, true);
        continue;
      }
      if (!match.player2TournamentPlayerId) continue;
      opponents.get(match.player1TournamentPlayerId)?.push(match.player2TournamentPlayerId);
      opponents.get(match.player2TournamentPlayerId)?.push(match.player1TournamentPlayerId);
    }
  }

  return data.players.map((player: any) => {
    const standing = data.standings.find((s: any) => s.tournamentPlayerId === player.id);
    return {
      id: player.id,
      name: player.displayName,
      matchPoints: standing?.matchPoints ?? 0,
      matchWins: standing?.matchWins ?? 0,
      matchLosses: standing?.matchLosses ?? 0,
      matchDraws: standing?.matchDraws ?? 0,
      opponents: opponents.get(player.id) ?? [],
      floatHistory: [],
      hadBye: hadBye.get(player.id) ?? false,
      tiebreaker1: standing?.omwPercent ?? 0,
      tiebreaker2: standing?.gwPercent ?? 0,
      tiebreaker3: standing?.ogwPercent ?? 0,
    };
  });
}
