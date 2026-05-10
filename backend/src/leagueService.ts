import { prisma } from './db';
import type { AuthContext } from './auth';
import { evaluateTrophyOutcome, getTeamRankFromMembership } from './trophyService';

function startOfDay(value: string | Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value: string | Date) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

export function normalizeLeagueWindow(startsAt: string | Date, endsAt: string | Date) {
  const normalizedStart = startOfDay(startsAt);
  const normalizedEnd = endOfDay(endsAt);
  if (Number.isNaN(normalizedStart.getTime()) || Number.isNaN(normalizedEnd.getTime())) {
    throw new Error('League dates are required');
  }
  if (normalizedStart > normalizedEnd) {
    throw new Error('League start date must be on or before the end date');
  }
  return { startsAt: normalizedStart, endsAt: normalizedEnd };
}

async function assertNoActiveLeagueOverlap(
  organizationId: string | null,
  startsAt: Date,
  endsAt: Date,
  ignoreLeagueId?: string,
) {
  if (!organizationId) return;
  const overlap = await prisma.league.findFirst({
    where: {
      organizationId,
      status: 'ACTIVE',
      id: ignoreLeagueId ? { not: ignoreLeagueId } : undefined,
      startsAt: { lte: endsAt },
      endsAt: { gte: startsAt },
    },
  });
  if (overlap) {
    throw new Error(`League overlaps with active league "${overlap.name}"`);
  }
}

function serializeLeague(league: any) {
  return {
    id: league.id,
    name: league.name,
    startsAt: league.startsAt.toISOString(),
    endsAt: league.endsAt.toISOString(),
    status: league.status,
    organizationId: league.organizationId,
    createdAt: league.createdAt.toISOString(),
    updatedAt: league.updatedAt.toISOString(),
    tournamentCount: league._count?.tournaments ?? league.tournaments?.length ?? 0,
  };
}

export async function listLeagues(auth: AuthContext) {
  const leagues = await prisma.league.findMany({
    where: { organizationId: auth.organizationId ?? undefined },
    include: { _count: { select: { tournaments: true } } },
    orderBy: [{ startsAt: 'desc' }, { name: 'asc' }],
  });
  return leagues.map(serializeLeague);
}

export async function getLeague(id: string, auth: AuthContext) {
  const league = await prisma.league.findFirst({
    where: { id, organizationId: auth.organizationId ?? undefined },
    include: {
      tournaments: {
        orderBy: [{ createdAt: 'desc' }],
        include: { _count: { select: { players: true } } },
      },
      _count: { select: { tournaments: true } },
    },
  });

  if (!league) return null;

  return {
    ...serializeLeague(league),
    tournaments: league.tournaments.map((tournament) => ({
      id: tournament.id,
      name: tournament.name,
      format: tournament.format,
      status: tournament.status,
      totalRounds: tournament.totalRounds,
      currentRound: tournament.currentRound,
      createdAt: tournament.createdAt.toISOString(),
      startedAt: tournament.startedAt?.toISOString() ?? null,
      finishedAt: tournament.finishedAt?.toISOString() ?? null,
      playerCount: tournament._count.players,
    })),
  };
}

export async function createLeague(
  data: { name: string; startsAt: string; endsAt: string; status?: string },
  auth: AuthContext,
) {
  const name = data.name.trim();
  if (!name) throw new Error('League name is required');
  const { startsAt, endsAt } = normalizeLeagueWindow(data.startsAt, data.endsAt);
  const status = data.status ?? 'ACTIVE';
  if (status === 'ACTIVE') {
    await assertNoActiveLeagueOverlap(auth.organizationId, startsAt, endsAt);
  }
  const league = await prisma.league.create({
    data: {
      name,
      startsAt,
      endsAt,
      status,
      organizationId: auth.organizationId,
      createdById: auth.userId,
    },
    include: { _count: { select: { tournaments: true } } },
  });
  return serializeLeague(league);
}

export async function deleteLeague(id: string, auth: AuthContext) {
  const league = await prisma.league.findFirst({
    where: { id, organizationId: auth.organizationId ?? undefined },
  });
  if (!league) throw new Error('League not found');
  await prisma.league.delete({ where: { id } });
}

export async function updateLeague(
  id: string,
  data: { name?: string; startsAt?: string; endsAt?: string; status?: string },
  auth: AuthContext,
) {
  const league = await prisma.league.findFirst({
    where: { id, organizationId: auth.organizationId ?? undefined },
  });
  if (!league) throw new Error('League not found');

  const nextWindow = normalizeLeagueWindow(
    data.startsAt ?? league.startsAt,
    data.endsAt ?? league.endsAt,
  );
  const nextStatus = data.status ?? league.status;
  if (nextStatus === 'ACTIVE') {
    await assertNoActiveLeagueOverlap(
      auth.organizationId,
      nextWindow.startsAt,
      nextWindow.endsAt,
      id,
    );
  }

  const updated = await prisma.league.update({
    where: { id },
    data: {
      name: data.name?.trim() ?? league.name,
      startsAt: nextWindow.startsAt,
      endsAt: nextWindow.endsAt,
      status: nextStatus,
    },
    include: { _count: { select: { tournaments: true } } },
  });

  return serializeLeague(updated);
}

export async function getLeagueStandings(id: string, auth: AuthContext) {
  const league = await prisma.league.findFirst({
    where: { id, organizationId: auth.organizationId ?? undefined },
    include: {
      tournaments: {
        include: {
          standings: {
            include: {
              tournamentPlayer: {
                include: {
                  player: true,
                  teamMembership: {
                    include: {
                      team: {
                        include: {
                          standings: {
                            select: { rank: true },
                            orderBy: { rank: 'asc' },
                            take: 1,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!league) throw new Error('League not found');

  const totals = new Map<string, any>();

  for (const tournament of league.tournaments) {
    for (const standing of tournament.standings) {
      const player = standing.tournamentPlayer.player;
      const key = player?.id ?? `registration:${standing.tournamentPlayerId}`;
      const existing = totals.get(key) ?? {
        key,
        playerId: player?.id ?? null,
        name: standing.tournamentPlayer.displayName,
        avatarUrl: player?.avatarUrl ?? null,
        rating: player?.rating ?? standing.tournamentPlayer.currentElo,
        tournamentsPlayed: 0,
        trophies: 0,
        teamDraftTrophies: 0,
        matchPoints: 0,
        matchWins: 0,
        matchLosses: 0,
        matchDraws: 0,
        gameWins: 0,
        gameLosses: 0,
        gameDraws: 0,
        lastPlayedAt: null as string | null,
      };

      existing.tournamentsPlayed += 1;
      existing.matchPoints += standing.matchPoints;
      existing.matchWins += standing.matchWins;
      existing.matchLosses += standing.matchLosses;
      existing.matchDraws += standing.matchDraws;
      existing.gameWins += standing.gameWins;
      existing.gameLosses += standing.gameLosses;
      existing.gameDraws += standing.gameDraws;
      const trophyOutcome = evaluateTrophyOutcome({
        tournamentStatus: tournament.status,
        teamMode: tournament.teamMode,
        individualRank: standing.rank,
        teamRank: getTeamRankFromMembership(standing.tournamentPlayer.teamMembership),
      });
      if (trophyOutcome.regularTrophy) {
        existing.trophies += 1;
      }
      if (trophyOutcome.teamDraftTrophy) {
        existing.teamDraftTrophies += 1;
      }
      const playedAt = (
        tournament.finishedAt ??
        tournament.startedAt ??
        tournament.createdAt
      ).toISOString();
      if (!existing.lastPlayedAt || existing.lastPlayedAt < playedAt) {
        existing.lastPlayedAt = playedAt;
      }
      totals.set(key, existing);
    }
  }

  return [...totals.values()]
    .sort((left, right) => {
      if (left.matchPoints !== right.matchPoints) return right.matchPoints - left.matchPoints;
      if (left.trophies !== right.trophies) return right.trophies - left.trophies;
      if (left.teamDraftTrophies !== right.teamDraftTrophies) {
        return right.teamDraftTrophies - left.teamDraftTrophies;
      }
      if (left.matchWins !== right.matchWins) return right.matchWins - left.matchWins;
      return left.name.localeCompare(right.name);
    })
    .map((entry, index) => ({
      rank: index + 1,
      ...entry,
      matchWinRate:
        entry.matchWins + entry.matchLosses + entry.matchDraws > 0
          ? entry.matchWins / (entry.matchWins + entry.matchLosses + entry.matchDraws)
          : 0,
    }));
}
