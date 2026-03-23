export const ELO_K_FACTOR = 32;

export type EloReplayMatchResult = "PENDING" | "P1_WIN" | "P2_WIN" | "DRAW" | "BYE";

export type EloReplayPlayer = {
  id: string;
  startingElo: number;
};

export type EloReplayMatch = {
  roundNumber: number;
  tableNumber: number;
  player1Id: string;
  player2Id: string | null;
  result: EloReplayMatchResult;
};

async function resolveDb(db?: any) {
  if (db) return db;
  const { prisma } = await import("./db");
  return prisma;
}

function expectedScore(playerRating: number, opponentRating: number) {
  return 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
}

function scoreForResult(result: EloReplayMatchResult): number | null {
  if (result === "P1_WIN") return 1;
  if (result === "P2_WIN") return 0;
  if (result === "DRAW") return 0.5;
  return null;
}

export function replayTournamentElo(players: EloReplayPlayer[], matches: EloReplayMatch[]) {
  const ratings = new Map(players.map((player) => [player.id, player.startingElo]));

  const reportedMatches = [...matches]
    .filter((match) => match.result !== "PENDING")
    .sort((a, b) => a.roundNumber - b.roundNumber || a.tableNumber - b.tableNumber);

  for (const match of reportedMatches) {
    if (match.result === "BYE" || !match.player2Id) continue;

    const player1Rating = ratings.get(match.player1Id);
    const player2Rating = ratings.get(match.player2Id);
    const score1 = scoreForResult(match.result);

    if (player1Rating === undefined || player2Rating === undefined || score1 === null) continue;

    const delta = Math.round(
      ELO_K_FACTOR * (score1 - expectedScore(player1Rating, player2Rating))
    );

    ratings.set(match.player1Id, player1Rating + delta);
    ratings.set(match.player2Id, player2Rating - delta);
  }

  return ratings;
}

export async function recalculateTournamentElo(tournamentId: string, db?: any) {
  const client = await resolveDb(db);
  const tournament = await client.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      players: true,
      rounds: {
        orderBy: { number: "asc" },
        include: {
          matches: {
            orderBy: { tableNumber: "asc" },
          },
        },
      },
    },
  });

  if (!tournament) throw new Error("Tournament not found");

  const ratings = replayTournamentElo(
    tournament.players.map((player: any) => ({
      id: player.id,
      startingElo: player.startingElo,
    })),
    tournament.rounds.flatMap((round: any) =>
      round.matches.map((match: any) => ({
        roundNumber: round.number,
        tableNumber: match.tableNumber,
        player1Id: match.player1TournamentPlayerId,
        player2Id: match.player2TournamentPlayerId,
        result: match.result,
      }))
    )
  );

  await Promise.all(
    tournament.players.map((player: any) =>
      client.tournamentPlayer.update({
        where: { id: player.id },
        data: { currentElo: ratings.get(player.id) ?? player.startingElo },
      })
    )
  );

  return ratings;
}

export async function syncTournamentEloToPlayerRatings(tournamentId: string, db?: any) {
  const client = await resolveDb(db);
  const registrations = await client.tournamentPlayer.findMany({
    where: {
      tournamentId,
      playerId: { not: null },
    },
    select: {
      playerId: true,
      currentElo: true,
    },
  });

  await Promise.all(
    registrations.map((registration: any) =>
      client.player.update({
        where: { id: registration.playerId },
        data: { rating: registration.currentElo },
      })
    )
  );
}
