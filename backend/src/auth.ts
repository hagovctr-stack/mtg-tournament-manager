import type { NextFunction, Request, Response } from 'express';
import { prisma } from './db';

export type AppRole = 'ORG_ADMIN' | 'ORGANIZER' | 'PLAYER';

export type AuthContext = {
  organizationId: string | null;
  organizationSlug: string | null;
  userId: string | null;
  userName: string | null;
  role: AppRole;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const DEFAULT_ORG_SLUG = 'default-org';
const DEFAULT_USERS = [
  { email: 'admin@local.test', name: 'Default Admin', role: 'ORG_ADMIN' as AppRole },
  { email: 'organizer@local.test', name: 'Default Organizer', role: 'ORGANIZER' as AppRole },
  { email: 'player@local.test', name: 'Default Player', role: 'PLAYER' as AppRole },
];

export async function ensureDefaultOrganization() {
  let org = await prisma.organization.findUnique({
    where: { slug: DEFAULT_ORG_SLUG },
  });

  if (!org) {
    org = await prisma.organization.create({
      data: {
        slug: DEFAULT_ORG_SLUG,
        name: 'Local MTG Organization',
      },
    });
  }

  for (const entry of DEFAULT_USERS) {
    const user = await prisma.user.upsert({
      where: { email: entry.email },
      update: { name: entry.name, organizationId: org.id },
      create: {
        email: entry.email,
        name: entry.name,
        organizationId: org.id,
      },
    });

    await prisma.organizationMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId: org.id,
          userId: user.id,
        },
      },
      update: { role: entry.role },
      create: {
        organizationId: org.id,
        userId: user.id,
        role: entry.role,
      },
    });
  }

  return org;
}

async function buildAuthContextFromUser(userId?: string | null): Promise<AuthContext> {
  const org = await ensureDefaultOrganization();
  const fallbackMembership = await prisma.organizationMembership.findFirst({
    where: {
      organizationId: org.id,
      role: { in: ['ORG_ADMIN', 'ORGANIZER'] },
    },
    include: { user: true, organization: true },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  });

  if (!userId) {
    return {
      organizationId: org.id,
      organizationSlug: org.slug,
      userId: fallbackMembership?.userId ?? null,
      userName: fallbackMembership?.user.name ?? null,
      role: (fallbackMembership?.role as AppRole | undefined) ?? 'ORGANIZER',
    };
  }

  const membership = await prisma.organizationMembership.findFirst({
    where: { userId },
    include: { user: true, organization: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!membership) {
    return {
      organizationId: org.id,
      organizationSlug: org.slug,
      userId: fallbackMembership?.userId ?? null,
      userName: fallbackMembership?.user.name ?? null,
      role: (fallbackMembership?.role as AppRole | undefined) ?? 'ORGANIZER',
    };
  }

  return {
    organizationId: membership.organizationId,
    organizationSlug: membership.organization.slug,
    userId: membership.userId,
    userName: membership.user.name,
    role: membership.role as AppRole,
  };
}

export async function attachAuthContext(req: Request, _res: Response, next: NextFunction) {
  try {
    req.auth = await buildAuthContextFromUser(req.header('x-user-id'));
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.auth?.role ?? 'PLAYER';
    if (!roles.includes(role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

export async function listAuthUsers() {
  await ensureDefaultOrganization();
  const memberships = await prisma.organizationMembership.findMany({
    include: { user: true, organization: true },
    orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }],
  });

  return memberships.map((membership) => ({
    userId: membership.userId,
    name: membership.user.name,
    email: membership.user.email,
    role: membership.role,
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
  }));
}

export async function getSession(userId?: string | null) {
  const auth = await buildAuthContextFromUser(userId);
  return {
    ...auth,
    users: await listAuthUsers(),
  };
}
