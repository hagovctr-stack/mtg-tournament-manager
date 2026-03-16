import { prisma } from "./db";
import {
  calculateTiebreakers,
  type PlayerState,
  type MatchRecord,
} from "./pairingAlgorithm";

export async function recalculateStandings(tournamentId: string): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      players: { where: { active: true } },
      rounds: {
        include: { matches: true },
        where: { status: { in: ["ACTIVE", "FINISHED"] } },
      },
    },
  });

  if (!tournament) throw new Error("Tournament not found");

  type Stats = {
    matchPoints: number;
    matchWins: number;
    matchLosses: number;
    matchDraws: number;
    gameWins: number;
    gameLosses: number;
    gameDraws: number;
    opponents: string[];
    hadBye: boolean;
  };

  const statsMap = new Map<string, Stats>();
  for (const player of tournament.players) {
    statsMap.set(player.id, {
      matchPoints: 0,
      matchWins: 0,
      matchLosses: 0,
      matchDraws: 0,
      gameWins: 0,
      gameLosses: 0,
      gameDraws: 0,
      opponents: [],
      hadBye: false,
    });
  }

  const matchRecords: MatchRecord[] = [];

  for (const round of tournament.rounds) {
    for (const match of round.matches) {
      if (match.result === "PENDING") continue;

      const s1 = statsMap.get(match.player1Id);
      if (!s1) continue;

      if (match.result === "BYE") {
        s1.matchPoints += 3;
        s1.matchWins += 1;
        s1.hadBye = true;
        matchRecords.push({
          playerId: match.player1Id,
          opponentId: null,
          playerWins: 2,
          opponentWins: 0,
          draws: 0,
          isBye: true,
        });
        continue;
      }

      if (!match.player2Id) continue;
      const s2 = statsMap.get(match.player2Id);
      if (!s2) continue;

      const w1 = match.wins1 ?? 0;
      const w2 = match.wins2 ?? 0;
      const d = match.draws ?? 0;

      s1.gameWins += w1;
      s1.gameLosses += w2;
      s1.gameDraws += d;
      s2.gameWins += w2;
      s2.gameLosses += w1;
      s2.gameDraws += d;

      if (match.result === "P1_WIN") {
        s1.matchPoints += 3;
        s1.matchWins += 1;
        s2.matchLosses += 1;
      } else if (match.result === "P2_WIN") {
        s2.matchPoints += 3;
        s2.matchWins += 1;
        s1.matchLosses += 1;
      } else if (match.result === "DRAW") {
        s1.matchPoints += 1;
        s2.matchPoints += 1;
        s1.matchDraws += 1;
        s2.matchDraws += 1;
      }

      s1.opponents.push(match.player2Id);
      s2.opponents.push(match.player1Id);

      matchRecords.push(
        {
          playerId: match.player1Id,
          opponentId: match.player2Id,
          playerWins: w1,
          opponentWins: w2,
          draws: d,
          isBye: false,
        },
        {
          playerId: match.player2Id,
          opponentId: match.player1Id,
          playerWins: w2,
          opponentWins: w1,
          draws: d,
          isBye: false,
        }
      );
    }
  }

  const playerStates: PlayerState[] = tournament.players.map((p) => {
    const s = statsMap.get(p.id)!;
    return {
      id: p.id,
      name: p.name,
      matchPoints: s.matchPoints,
      matchWins: s.matchWins,
      matchLosses: s.matchLosses,
      matchDraws: s.matchDraws,
      opponents: s.opponents,
      floatHistory: [],
      hadBye: s.hadBye,
      tiebreaker1: 0,
      tiebreaker2: 0,
      tiebreaker3: 0,
    };
  });

  const tiebreakers = calculateTiebreakers(playerStates, matchRecords);

  const sorted = playerStates.sort((a, b) => {
    const ta = tiebreakers.get(a.id)!;
    const tb = tiebreakers.get(b.id)!;
    const sa = statsMap.get(a.id)!;
    const sb = statsMap.get(b.id)!;
    if (sa.matchPoints !== sb.matchPoints) return sb.matchPoints - sa.matchPoints;
    if (ta.omw !== tb.omw) return tb.omw - ta.omw;
    if (ta.gw !== tb.gw) return tb.gw - ta.gw;
    return tb.ogw - ta.ogw;
  });

  await prisma.$transaction(
    sorted.map((p, idx) => {
      const s = statsMap.get(p.id)!;
      const t = tiebreakers.get(p.id)!;
      return prisma.standing.upsert({
        where: { playerId: p.id },
        update: {
          matchPoints: s.matchPoints,
          matchWins: s.matchWins,
          matchLosses: s.matchLosses,
          matchDraws: s.matchDraws,
          gameWins: s.gameWins,
          gameLosses: s.gameLosses,
          gameDraws: s.gameDraws,
          omwPercent: t.omw,
          gwPercent: t.gw,
          ogwPercent: t.ogw,
          rank: idx + 1,
        },
        create: {
          tournamentId,
          playerId: p.id,
          matchPoints: s.matchPoints,
          matchWins: s.matchWins,
          matchLosses: s.matchLosses,
          matchDraws: s.matchDraws,
          gameWins: s.gameWins,
          gameLosses: s.gameLosses,
          gameDraws: s.gameDraws,
          omwPercent: t.omw,
          gwPercent: t.gw,
          ogwPercent: t.ogw,
          rank: idx + 1,
        },
      });
    })
  );
}

export async function getStandings(tournamentId: string) {
  return prisma.standing.findMany({
    where: { tournamentId },
    include: { player: true },
    orderBy: { rank: "asc" },
  });
}
