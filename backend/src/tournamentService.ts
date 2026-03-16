import { prisma } from "./db";
import {
  generatePairings,
  recommendedRounds,
  type PlayerState,
} from "./pairingAlgorithm";
import { recalculateStandings } from "./standingsService";

export async function createTournament(data: {
  name: string;
  format?: string;
  totalRounds?: number;
}) {
  return prisma.tournament.create({
    data: {
      name: data.name,
      format: data.format ?? "Swiss",
      totalRounds: data.totalRounds ?? 0,
    },
  });
}

export async function getTournament(id: string) {
  return prisma.tournament.findUnique({
    where: { id },
    include: {
      players: { where: { active: true }, orderBy: { name: "asc" } },
      rounds: {
        orderBy: { number: "asc" },
        include: {
          matches: {
            include: { player1: true, player2: true },
            orderBy: { tableNumber: "asc" },
          },
        },
      },
      standings: { include: { player: true }, orderBy: { rank: "asc" } },
    },
  });
}

export async function listTournaments() {
  return prisma.tournament.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { players: true } } },
  });
}

export async function addPlayer(
  tournamentId: string,
  data: { name: string; dciNumber?: string; elo?: number }
) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw new Error("Tournament not found");
  if (tournament.status !== "REGISTRATION") throw new Error("Tournament already started");

  const player = await prisma.player.create({
    data: { tournamentId, name: data.name, dciNumber: data.dciNumber, elo: data.elo ?? 1500 },
  });

  await prisma.standing.create({ data: { tournamentId, playerId: player.id } });

  return player;
}

export async function dropPlayer(playerId: string) {
  return prisma.player.update({ where: { id: playerId }, data: { active: false } });
}

export async function startTournament(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { players: { where: { active: true } } },
  });
  if (!tournament) throw new Error("Tournament not found");
  if (tournament.status !== "REGISTRATION") throw new Error("Tournament already started");
  if (tournament.players.length < 2) throw new Error("Need at least 2 players");

  const totalRounds =
    tournament.totalRounds > 0
      ? tournament.totalRounds
      : recommendedRounds(tournament.players.length);

  return prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "ACTIVE", totalRounds },
  });
}

export async function generateNextRound(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      players: { where: { active: true } },
      rounds: { include: { matches: true }, orderBy: { number: "desc" } },
      standings: true,
    },
  });

  if (!tournament) throw new Error("Tournament not found");
  if (tournament.status !== "ACTIVE") throw new Error("Tournament not active");

  if (tournament.rounds.length > 0) {
    const lastRound = tournament.rounds[0];
    if (lastRound.status !== "FINISHED") throw new Error("Previous round not finished");
  }

  const newRoundNumber = tournament.rounds.length + 1;
  if (newRoundNumber > tournament.totalRounds) throw new Error("All rounds completed");

  const playerStates = await buildPlayerStates(tournamentId);
  const { pairings, byePlayerId } = generatePairings(playerStates);

  const round = await prisma.$transaction(async (tx) => {
    const round = await tx.round.create({
      data: { tournamentId, number: newRoundNumber, status: "ACTIVE", startedAt: new Date() },
    });

    for (const pairing of pairings) {
      if (pairing.isBye) {
        await tx.match.create({
          data: {
            roundId: round.id,
            tournamentId,
            tableNumber: pairing.tableNumber,
            player1Id: pairing.player1Id,
            player2Id: null,
            byePlayerId: pairing.player1Id,
            result: "BYE",
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
            player1Id: pairing.player1Id,
            player2Id: pairing.player2Id,
            result: "PENDING",
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

  return prisma.round.findUnique({
    where: { id: round.id },
    include: {
      matches: {
        include: { player1: true, player2: true },
        orderBy: { tableNumber: "asc" },
      },
    },
  });
}

export async function reportResult(
  matchId: string,
  data: { wins1: number; wins2: number; draws: number }
) {
  const match = await prisma.match.findUnique({ where: { id: matchId }, include: { round: true } });
  if (!match) throw new Error("Match not found");
  if (match.result !== "PENDING") throw new Error("Result already reported");

  let result: "P1_WIN" | "P2_WIN" | "DRAW";
  if (data.wins1 > data.wins2) result = "P1_WIN";
  else if (data.wins2 > data.wins1) result = "P2_WIN";
  else result = "DRAW";

  await prisma.match.update({
    where: { id: matchId },
    data: { wins1: data.wins1, wins2: data.wins2, draws: data.draws, result },
  });

  const pendingMatches = await prisma.match.count({
    where: { roundId: match.roundId, result: "PENDING" },
  });

  if (pendingMatches === 0) {
    await prisma.round.update({
      where: { id: match.roundId },
      data: { status: "FINISHED", finishedAt: new Date() },
    });
  }

  await recalculateStandings(match.tournamentId);

  return prisma.match.findUnique({
    where: { id: matchId },
    include: { player1: true, player2: true },
  });
}

export async function finishTournament(tournamentId: string) {
  return prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "FINISHED" },
  });
}

export async function buildPlayerStates(tournamentId: string): Promise<PlayerState[]> {
  const data = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      players: { where: { active: true } },
      rounds: { include: { matches: true }, where: { status: "FINISHED" } },
      standings: true,
    },
  });

  if (!data) throw new Error("Tournament not found");

  const opponents = new Map<string, string[]>();
  const hadBye = new Map<string, boolean>();

  for (const player of data.players) {
    opponents.set(player.id, []);
    hadBye.set(player.id, false);
  }

  for (const round of data.rounds) {
    for (const match of round.matches) {
      if (match.result === "BYE") { hadBye.set(match.player1Id, true); continue; }
      if (!match.player2Id) continue;
      opponents.get(match.player1Id)?.push(match.player2Id);
      opponents.get(match.player2Id)?.push(match.player1Id);
    }
  }

  return data.players.map((player) => {
    const standing = data.standings.find((s) => s.playerId === player.id);
    return {
      id: player.id,
      name: player.name,
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
