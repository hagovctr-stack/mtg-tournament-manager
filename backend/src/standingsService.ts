import { prisma } from './db';
import { calculateTiebreakers, type PlayerState, type MatchRecord } from './pairingAlgorithm';
import { serializeStanding } from './presenters';
import { usesTeamDraftMode } from './teamService';

type TeamBoardTotals = {
  teamId: string;
  matchPoints: number;
  boardWins: number;
  boardLosses: number;
  boardDraws: number;
  gameWins: number;
};

function computeWinningTeamPlayerIds(
  teams: Array<{ id: string; members: Array<{ tournamentPlayerId: string }> }>,
  rounds: Array<{
    matches: Array<{
      player1TournamentPlayerId: string;
      player2TournamentPlayerId: string | null;
      result: string;
      wins1?: number | null;
      wins2?: number | null;
    }>;
  }>,
): Set<string> {
  if (teams.length === 0) return new Set();

  const playerToTeamId = new Map<string, string>();
  const teamTotals = new Map<string, TeamBoardTotals>();

  for (const team of teams) {
    teamTotals.set(team.id, {
      teamId: team.id,
      matchPoints: 0,
      boardWins: 0,
      boardLosses: 0,
      boardDraws: 0,
      gameWins: 0,
    });
    for (const member of team.members) {
      playerToTeamId.set(member.tournamentPlayerId, team.id);
    }
  }

  for (const round of rounds) {
    const roundBoardTotals = new Map<string, { wins: number; losses: number }>();

    for (const match of round.matches) {
      if (match.result === 'PENDING' || match.result === 'BYE' || !match.player2TournamentPlayerId)
        continue;
      const t1Id = playerToTeamId.get(match.player1TournamentPlayerId);
      const t2Id = playerToTeamId.get(match.player2TournamentPlayerId);
      if (!t1Id || !t2Id || t1Id === t2Id) continue;

      const t1 = teamTotals.get(t1Id)!;
      const t2 = teamTotals.get(t2Id)!;
      const r1 = roundBoardTotals.get(t1Id) ?? { wins: 0, losses: 0 };
      const r2 = roundBoardTotals.get(t2Id) ?? { wins: 0, losses: 0 };

      t1.gameWins += match.wins1 ?? 0;
      t2.gameWins += match.wins2 ?? 0;

      if (match.result === 'P1_WIN') {
        t1.boardWins++;
        t2.boardLosses++;
        r1.wins++;
        r2.losses++;
      } else if (match.result === 'P2_WIN') {
        t2.boardWins++;
        t1.boardLosses++;
        r2.wins++;
        r1.losses++;
      } else if (match.result === 'DRAW') {
        t1.boardDraws++;
        t2.boardDraws++;
      }

      roundBoardTotals.set(t1Id, r1);
      roundBoardTotals.set(t2Id, r2);
    }

    if (roundBoardTotals.size === 2) {
      const [fId, sId] = [...roundBoardTotals.keys()];
      const f = roundBoardTotals.get(fId)!;
      const s = roundBoardTotals.get(sId)!;
      const ft = teamTotals.get(fId)!;
      const st = teamTotals.get(sId)!;
      if (f.wins > s.wins) {
        ft.matchPoints += 3;
      } else if (s.wins > f.wins) {
        st.matchPoints += 3;
      } else {
        ft.matchPoints += 1;
        st.matchPoints += 1;
      }
    }
  }

  const sortedTeams = [...teamTotals.values()].sort((a, b) => {
    if (a.matchPoints !== b.matchPoints) return b.matchPoints - a.matchPoints;
    if (a.boardWins !== b.boardWins) return b.boardWins - a.boardWins;
    const aTotal = a.boardWins + a.boardLosses + a.boardDraws;
    const bTotal = b.boardWins + b.boardLosses + b.boardDraws;
    const aGW = aTotal > 0 ? a.boardWins / aTotal : 0;
    const bGW = bTotal > 0 ? b.boardWins / bTotal : 0;
    if (Math.abs(aGW - bGW) > 1e-9) return bGW - aGW;
    if (a.gameWins !== b.gameWins) return b.gameWins - a.gameWins;
    return 0;
  });

  const winningTeamId = sortedTeams[0]?.teamId;
  if (!winningTeamId) return new Set();

  const winnerIds = new Set<string>();
  for (const [playerId, teamId] of playerToTeamId) {
    if (teamId === winningTeamId) winnerIds.add(playerId);
  }
  return winnerIds;
}

export async function recalculateStandings(tournamentId: string): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      players: { where: { active: true } },
      rounds: {
        include: { matches: true },
        where: { status: { in: ['ACTIVE', 'FINISHED'] } },
      },
      teams: { include: { members: true } },
    },
  });

  if (!tournament) throw new Error('Tournament not found');

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
      if (match.result === 'PENDING') continue;

      const s1 = statsMap.get(match.player1TournamentPlayerId);
      if (!s1) continue;

      if (match.result === 'BYE') {
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

      if (match.result === 'P1_WIN') {
        s1.matchPoints += 3;
        s1.matchWins += 1;
        s2.matchLosses += 1;
      } else if (match.result === 'P2_WIN') {
        s2.matchPoints += 3;
        s2.matchWins += 1;
        s1.matchLosses += 1;
      } else if (match.result === 'DRAW') {
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
        },
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

  const isTeamDraft = usesTeamDraftMode((tournament as any).teamMode ?? 'NONE');
  const winningTeamPlayerIds = isTeamDraft
    ? computeWinningTeamPlayerIds((tournament as any).teams ?? [], tournament.rounds)
    : null;

  const sorted = playerStates.sort((a, b) => {
    if (winningTeamPlayerIds) {
      const aWins = winningTeamPlayerIds.has(a.id);
      const bWins = winningTeamPlayerIds.has(b.id);
      if (aWins !== bWins) return aWins ? -1 : 1;
    }
    const ta = tiebreakers.get(a.id)!;
    const tb = tiebreakers.get(b.id)!;
    const sa = statsMap.get(a.id)!;
    const sb = statsMap.get(b.id)!;
    if (sa.matchPoints !== sb.matchPoints) return sb.matchPoints - sa.matchPoints;
    if (ta.omw !== tb.omw) return tb.omw - ta.omw;
    if (ta.gw !== tb.gw) return tb.gw - ta.gw;
    if (ta.ogw !== tb.ogw) return tb.ogw - ta.ogw;
    return a.name.localeCompare(b.name);
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
    }),
  );
}

export async function getStandings(tournamentId: string) {
  const standings = await prisma.standing.findMany({
    where: { tournamentId },
    include: { tournamentPlayer: { include: { player: { select: { avatarUrl: true } } } } },
    orderBy: { rank: 'asc' },
  });

  return standings.map(serializeStanding);
}

export async function getStandingsAtRound(tournamentId: string, upToRound: number) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      players: { where: { active: true }, include: { player: { select: { avatarUrl: true } } } },
      rounds: {
        where: { status: 'FINISHED', number: { lte: upToRound } },
        include: { matches: true },
        orderBy: { number: 'asc' },
      },
      teams: { include: { members: true } },
    },
  });

  if (!tournament) throw new Error('Tournament not found');

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

  const matchRecords: import('./pairingAlgorithm').MatchRecord[] = [];

  for (const round of tournament.rounds) {
    for (const match of round.matches) {
      if (match.result === 'PENDING') continue;

      const s1 = statsMap.get(match.player1TournamentPlayerId);
      if (!s1) continue;

      if (match.result === 'BYE') {
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

      const w1 = match.wins1 ?? 0,
        w2 = match.wins2 ?? 0,
        d = match.draws ?? 0;
      s1.gameWins += w1;
      s1.gameLosses += w2;
      s1.gameDraws += d;
      s2.gameWins += w2;
      s2.gameLosses += w1;
      s2.gameDraws += d;

      if (match.result === 'P1_WIN') {
        s1.matchPoints += 3;
        s1.matchWins += 1;
        s2.matchLosses += 1;
      } else if (match.result === 'P2_WIN') {
        s2.matchPoints += 3;
        s2.matchWins += 1;
        s1.matchLosses += 1;
      } else if (match.result === 'DRAW') {
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
        },
      );
    }
  }

  const playerStates: import('./pairingAlgorithm').PlayerState[] = tournament.players.map(
    (p: any) => {
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
    },
  );

  const tiebreakers = calculateTiebreakers(playerStates, matchRecords);

  const isTeamDraftAtRound = usesTeamDraftMode((tournament as any).teamMode ?? 'NONE');
  const winningTeamPlayerIdsAtRound = isTeamDraftAtRound
    ? computeWinningTeamPlayerIds((tournament as any).teams ?? [], tournament.rounds)
    : null;

  const sorted = playerStates.sort((a, b) => {
    if (winningTeamPlayerIdsAtRound) {
      const aWins = winningTeamPlayerIdsAtRound.has(a.id);
      const bWins = winningTeamPlayerIdsAtRound.has(b.id);
      if (aWins !== bWins) return aWins ? -1 : 1;
    }
    const ta = tiebreakers.get(a.id)!,
      tb = tiebreakers.get(b.id)!;
    const sa = statsMap.get(a.id)!,
      sb = statsMap.get(b.id)!;
    if (sa.matchPoints !== sb.matchPoints) return sb.matchPoints - sa.matchPoints;
    if (ta.omw !== tb.omw) return tb.omw - ta.omw;
    if (ta.gw !== tb.gw) return tb.gw - ta.gw;
    if (ta.ogw !== tb.ogw) return tb.ogw - ta.ogw;
    return a.name.localeCompare(b.name);
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
        avatarUrl: (tp as any).player?.avatarUrl ?? null,
      },
    };
  });
}
