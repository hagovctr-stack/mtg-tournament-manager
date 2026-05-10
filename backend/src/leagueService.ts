import { prisma } from './db';
import type { AuthContext } from './auth';

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
