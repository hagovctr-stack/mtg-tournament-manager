import { prisma } from "./db";
import {
  calculateTiebreakers,
  type PlayerState,
  type MatchRecord,
} from "./pairingAlgorithm";
import { serializeStanding } from "./presenters";

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

      const s1 = statsMap.get(match.player1TournamentPlayerId);
      if (!s1) continue;

      if (match.result === "BYE") {
        s1.matchPoints += 3;
        s1.matchWins += 1;
        s1.hadBye = true;
        matchRecords.push({
          playerId: match.player1TournamentPlayerId,
          opponentId: null,
          playerWins: 2,
          opponentWins: 0,
          draws: 0,
          isBye: true,
        });
        continue;
      }

      if (!match.player2TournamentPlayerId) continue;
      const s2 = statsMap.get(match.player2TournamentPlayerId);
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

      s1.opponents.push(match.player2TournamentPlayerId);
      s2.opponents.push(match.player1TournamentPlayerId);

      matchRecords.push(
        {
          playerId: match.player1TournamentPlayerId,
          opponentId: match.player2TournamentPlayerId,
          playerWins: w1,
          opponentWins: w2,
          draws: d,
          isBye: false,
        },
        {
          playerId: match.player2TournamentPlayerId,
          opponentId: match.player1TournamentPlayerId,
          playerWins: w2,
          opponentWins: w1,
          draws: d,
          isBye: false,
        }
      );
    }
  }

  const playerStates: PlayerState[] = tournament.players.map((p: any) => {
    const s = statsMap.get(p.id)!;
    return {
      id: p.id,
      name: p.displayName,
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
        where: { tournamentPlayerId: p.id },
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
          tournamentPlayerId: p.id,
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
  const standings = await prisma.standing.findMany({
    where: { tournamentId },
    include: { tournamentPlayer: true },
    orderBy: { rank: "asc" },
  });

  return standings.map(serializeStanding);
}

export async function getStandingsAtRound(tournamentId: string, upToRound: number) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      players: { where: { active: true } },
      rounds: {
        where: { status: "FINISHED", number: { lte: upToRound } },
        include: { matches: true },
        orderBy: { number: "asc" },
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
      matchPoints: 0, matchWins: 0, matchLosses: 0, matchDraws: 0,
      gameWins: 0, gameLosses: 0, gameDraws: 0, opponents: [], hadBye: false,
    });
  }

  const matchRecords: import("./pairingAlgorithm").MatchRecord[] = [];

  for (const round of tournament.rounds) {
    for (const match of round.matches) {
      if (match.result === "PENDING") continue;

      const s1 = statsMap.get(match.player1TournamentPlayerId);
      if (!s1) continue;

      if (match.result === "BYE") {
        s1.matchPoints += 3; s1.matchWins += 1; s1.hadBye = true;
        matchRecords.push({ playerId: match.player1TournamentPlayerId, opponentId: null, playerWins: 2, opponentWins: 0, draws: 0, isBye: true });
        continue;
      }

      if (!match.player2TournamentPlayerId) continue;
      const s2 = statsMap.get(match.player2TournamentPlayerId);
      if (!s2) continue;

      const w1 = match.wins1 ?? 0, w2 = match.wins2 ?? 0, d = match.draws ?? 0;
      s1.gameWins += w1; s1.gameLosses += w2; s1.gameDraws += d;
      s2.gameWins += w2; s2.gameLosses += w1; s2.gameDraws += d;

      if (match.result === "P1_WIN") { s1.matchPoints += 3; s1.matchWins += 1; s2.matchLosses += 1; }
      else if (match.result === "P2_WIN") { s2.matchPoints += 3; s2.matchWins += 1; s1.matchLosses += 1; }
      else if (match.result === "DRAW") { s1.matchPoints += 1; s2.matchPoints += 1; s1.matchDraws += 1; s2.matchDraws += 1; }

      s1.opponents.push(match.player2TournamentPlayerId);
      s2.opponents.push(match.player1TournamentPlayerId);

      matchRecords.push(
        { playerId: match.player1TournamentPlayerId, opponentId: match.player2TournamentPlayerId, playerWins: w1, opponentWins: w2, draws: d, isBye: false },
        { playerId: match.player2TournamentPlayerId, opponentId: match.player1TournamentPlayerId, playerWins: w2, opponentWins: w1, draws: d, isBye: false },
      );
    }
  }

  const playerStates: import("./pairingAlgorithm").PlayerState[] = tournament.players.map((p: any) => {
    const s = statsMap.get(p.id)!;
    return { id: p.id, name: p.displayName, matchPoints: s.matchPoints, matchWins: s.matchWins, matchLosses: s.matchLosses, matchDraws: s.matchDraws, opponents: s.opponents, floatHistory: [], hadBye: s.hadBye, tiebreaker1: 0, tiebreaker2: 0, tiebreaker3: 0 };
  });

  const tiebreakers = calculateTiebreakers(playerStates, matchRecords);

  const sorted = playerStates.sort((a, b) => {
    const ta = tiebreakers.get(a.id)!, tb = tiebreakers.get(b.id)!;
    const sa = statsMap.get(a.id)!, sb = statsMap.get(b.id)!;
    if (sa.matchPoints !== sb.matchPoints) return sb.matchPoints - sa.matchPoints;
    if (ta.omw !== tb.omw) return tb.omw - ta.omw;
    if (ta.gw !== tb.gw) return tb.gw - ta.gw;
    return tb.ogw - ta.ogw;
  });

  return sorted.map((p, idx) => {
    const s = statsMap.get(p.id)!;
    const t = tiebreakers.get(p.id)!;
    const tp = tournament.players.find((x: any) => x.id === p.id)!;
    return {
      id: `${tournamentId}-${p.id}-r${upToRound}`,
      tournamentId,
      tournamentPlayerId: p.id,
      playerId: (tp as any).playerId,
      rank: idx + 1,
      matchPoints: s.matchPoints,
      matchWins: s.matchWins,
      matchLosses: s.matchLosses,
      matchDraws: s.matchDraws,
      gameWins: s.gameWins,
      gameLosses: s.gameLosses,
      omwPercent: t.omw,
      gwPercent: t.gw,
      ogwPercent: t.ogw,
      player: {
        id: tp.id,
        tournamentPlayerId: tp.id,
        playerId: (tp as any).playerId,
        name: tp.displayName,
        dciNumber: (tp as any).displayDciNumber,
        elo: tp.currentElo,
        active: tp.active,
        tournamentId: tp.tournamentId,
        seatNumber: (tp as any).seatNumber ?? null,
      },
    };
  });
}
