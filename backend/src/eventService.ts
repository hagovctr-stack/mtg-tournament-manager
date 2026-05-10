import { Prisma } from '@prisma/client';
import { prisma } from './db';
import type { AuthContext } from './auth';
import { recommendedRounds } from './pairingAlgorithm';

type EventTemplateKey = 'single_pod_to_top8' | 'multi_pod_to_top8' | 'double_draft_then_top8';

type EventParticipantInput = {
  playerId?: string | null;
  name: string;
};

type CreateEventInput = {
  name: string;
  template: EventTemplateKey;
  format?: string;
  bestOfFormat?: string;
  podCount?: number;
  topCutSize?: number;
  stageRounds?: number;
  participants?: EventParticipantInput[];
};

type StageBlueprint = {
  name: string;
  kind: string;
  advancementCount?: number;
  advancementSourceIndex?: number;
  configJson?: Record<string, unknown>;
};

function serializeTournamentCard(tournament: any) {
  if (!tournament) return null;
  return {
    id: tournament.id,
    name: tournament.name,
    status: tournament.status,
    format: tournament.format,
    totalRounds: tournament.totalRounds,
    currentRound: tournament.currentRound,
  };
}

function serializeEventStage(stage: any) {
  return {
    id: stage.id,
    name: stage.name,
    kind: stage.kind,
    sequence: stage.sequence,
    status: stage.status,
    advancementCount: stage.advancementCount,
    advancementSourceStageId: stage.advancementSourceStageId,
    configJson: stage.configJson ?? null,
    tournament: serializeTournamentCard(stage.tournament),
  };
}

function buildTemplateStages(template: EventTemplateKey, input: CreateEventInput) {
  const podCount = Math.max(1, input.podCount ?? (template === 'multi_pod_to_top8' ? 2 : 1));
  const topCutSize = Math.max(2, input.topCutSize ?? 8);
  const roundCount = Math.max(1, input.stageRounds ?? 3);

  if (template === 'single_pod_to_top8') {
    return [
      {
        name: 'Draft Pod 1',
        kind: 'SWISS',
        advancementCount: topCutSize,
        configJson: { rounds: roundCount },
      },
      {
        name: `Top ${topCutSize}`,
        kind: 'TOP_CUT',
        advancementSourceIndex: 0,
        advancementCount: topCutSize,
        configJson: { topCutSize },
      },
    ] as StageBlueprint[];
  }

  if (template === 'double_draft_then_top8') {
    return [
      {
        name: 'Draft 1',
        kind: 'SWISS',
        advancementCount: topCutSize,
        configJson: { rounds: roundCount },
      },
      {
        name: 'Draft 2',
        kind: 'SWISS',
        advancementSourceIndex: 0,
        advancementCount: topCutSize,
        configJson: { rounds: roundCount },
      },
      {
        name: `Top ${topCutSize}`,
        kind: 'TOP_CUT',
        advancementSourceIndex: 1,
        advancementCount: topCutSize,
        configJson: { topCutSize },
      },
    ] as StageBlueprint[];
  }

  const podStages = Array.from({ length: podCount }, (_, index) => ({
    name: `Draft Pod ${index + 1}`,
    kind: 'SWISS',
    advancementCount: Math.max(1, Math.floor(topCutSize / podCount)),
    configJson: { rounds: roundCount, podIndex: index + 1 },
  }));

  return [
    ...podStages,
    {
      name: `Top ${topCutSize}`,
      kind: 'TOP_CUT',
      advancementCount: topCutSize,
      configJson: { topCutSize, sourceStageIndexes: podStages.map((_, index) => index) },
    },
  ] as StageBlueprint[];
}

async function createBackingTournament(
  tx: any,
  stage: any,
  input: CreateEventInput,
  auth: AuthContext,
) {
  return tx.tournament.create({
    data: {
      name: `${input.name} - ${stage.name}`,
      format: input.format ?? 'Cube',
      bestOfFormat: input.bestOfFormat ?? 'BO3',
      totalRounds:
        (stage.configJson as any)?.rounds ??
        recommendedRounds(Math.max(2, input.participants?.length ?? 8)),
      organizationId: auth.organizationId,
      createdById: auth.userId,
      eventStageId: stage.id,
    },
  });
}

async function registerTournamentPlayers(
  tx: any,
  tournamentId: string,
  participants: EventParticipantInput[],
) {
  for (const participant of participants) {
    let player = participant.playerId
      ? await tx.player.findUnique({ where: { id: participant.playerId } })
      : null;

    if (!player) {
      player = await tx.player.create({
        data: {
          name: participant.name,
          normalizedName: participant.name.trim().replace(/\s+/g, ' ').toLowerCase(),
          rating: 1500,
        },
      });
    }

    const registration = await tx.tournamentPlayer.create({
      data: {
        tournamentId,
        playerId: player.id,
        displayName: player.name,
        displayDciNumber: player.dciNumber,
        startingElo: player.rating,
        currentElo: player.rating,
      },
    });

    await tx.standing.create({
      data: {
        tournamentId,
        tournamentPlayerId: registration.id,
      },
    });
  }
}

export async function createEvent(input: CreateEventInput, auth: AuthContext) {
  const name = input.name.trim();
  if (!name) throw new Error('Event name is required');
  const stages = buildTemplateStages(input.template, input);
  const participants = (input.participants ?? []).map((participant) => ({
    playerId: participant.playerId ?? null,
    name: participant.name.trim(),
  }));

  const event = await prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        name,
        template: input.template,
        status: 'ACTIVE',
        organizationId: auth.organizationId,
        createdById: auth.userId,
      },
    });

    for (const [index, participant] of participants.entries()) {
      await tx.eventParticipant.create({
        data: {
          eventId: event.id,
          playerId: participant.playerId,
          displayName: participant.name,
          seed: index + 1,
        },
      });
    }

    const createdStages: Array<{ id: string }> = [];
    for (const [index, blueprint] of stages.entries()) {
      const stage = await tx.eventStage.create({
        data: {
          eventId: event.id,
          name: blueprint.name,
          kind: blueprint.kind,
          sequence: index + 1,
          status: index === 0 ? 'ACTIVE' : 'PENDING',
          advancementCount: blueprint.advancementCount,
          advancementSourceStageId:
            blueprint.advancementSourceIndex !== undefined
              ? createdStages[blueprint.advancementSourceIndex].id
              : null,
          configJson: (blueprint.configJson ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
      createdStages.push(stage);
      const tournament = await createBackingTournament(tx, stage, input, auth);
      if (index === 0 && participants.length > 0) {
        await registerTournamentPlayers(tx, tournament.id, participants);
      } else if (
        input.template === 'multi_pod_to_top8' &&
        index < stages.length - 1 &&
        participants.length > 0
      ) {
        const podParticipants = participants.filter(
          (_, participantIndex) => participantIndex % (input.podCount ?? 2) === index,
        );
        await registerTournamentPlayers(tx, tournament.id, podParticipants);
      }
    }

    return event;
  });

  return getEvent(event.id, auth);
}

export async function listEvents(auth: AuthContext) {
  const events = await prisma.event.findMany({
    where: { organizationId: auth.organizationId ?? undefined },
    include: {
      stages: {
        include: { tournament: true },
        orderBy: { sequence: 'asc' },
      },
      _count: { select: { participants: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return events.map((event) => ({
    id: event.id,
    name: event.name,
    template: event.template,
    status: event.status,
    participantCount: event._count.participants,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    stages: event.stages.map(serializeEventStage),
  }));
}

export async function getEvent(id: string, auth: AuthContext) {
  const event = await prisma.event.findFirst({
    where: { id, organizationId: auth.organizationId ?? undefined },
    include: {
      participants: {
        include: { player: true },
        orderBy: { seed: 'asc' },
      },
      stages: {
        include: { tournament: true },
        orderBy: { sequence: 'asc' },
      },
    },
  });

  if (!event) return null;

  return {
    id: event.id,
    name: event.name,
    template: event.template,
    status: event.status,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    participants: event.participants.map((participant) => ({
      id: participant.id,
      seed: participant.seed,
      playerId: participant.playerId,
      name: participant.displayName,
    })),
    stages: event.stages.map(serializeEventStage),
  };
}

export async function listEventStages(eventId: string, auth: AuthContext) {
  const event = await getEvent(eventId, auth);
  if (!event) throw new Error('Event not found');
  return event.stages;
}

function pickAdvancersFromStandings(standings: any[], advancementCount: number) {
  return standings
    .slice()
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank;
      return left.player.name.localeCompare(right.player.name);
    })
    .slice(0, advancementCount);
}

export async function advanceStage(stageId: string, auth: AuthContext) {
  const stage = await prisma.eventStage.findFirst({
    where: {
      id: stageId,
      event: { organizationId: auth.organizationId ?? undefined },
    },
    include: {
      event: {
        include: {
          stages: {
            include: {
              tournament: {
                include: {
                  standings: {
                    include: {
                      tournamentPlayer: {
                        include: { player: true },
                      },
                    },
                  },
                },
              },
            },
            orderBy: { sequence: 'asc' },
          },
        },
      },
    },
  });

  if (!stage) throw new Error('Stage not found');
  const nextStages = stage.event.stages.filter(
    (candidate) => candidate.advancementSourceStageId === stage.id,
  );
  if (nextStages.length === 0) {
    throw new Error('This stage does not feed another stage');
  }

  await prisma.$transaction(async (tx) => {
    await tx.eventStage.update({
      where: { id: stage.id },
      data: { status: 'COMPLETED' },
    });

    const multiSourceTopCut = stage.event.stages.find(
      (candidate) =>
        candidate.id !== stage.id &&
        Array.isArray((candidate.configJson as any)?.sourceStageIndexes) &&
        (candidate.configJson as any).sourceStageIndexes.includes(stage.sequence - 1),
    );

    const targets = multiSourceTopCut ? [multiSourceTopCut] : nextStages;

    for (const target of targets) {
      if (!target.tournament) continue;
      const registrations = await tx.tournamentPlayer.count({
        where: { tournamentId: target.tournament.id },
      });
      if (registrations > 0) continue;

      const sourceStages = Array.isArray((target.configJson as any)?.sourceStageIndexes)
        ? stage.event.stages.filter((candidate) =>
            (target.configJson as any).sourceStageIndexes.includes(candidate.sequence - 1),
          )
        : stage.event.stages.filter((candidate) => candidate.id === stage.id);

      const advancers = sourceStages.flatMap((sourceStage) =>
        pickAdvancersFromStandings(
          sourceStage.tournament?.standings ?? [],
          sourceStage.advancementCount ?? target.advancementCount ?? 8,
        ),
      );

      for (const [index, standing] of advancers.entries()) {
        const player = standing.tournamentPlayer.player;
        const displayName = standing.tournamentPlayer.displayName;
        const persistedPlayer =
          player ??
          (await tx.player.create({
            data: {
              name: displayName,
              normalizedName: displayName.trim().replace(/\s+/g, ' ').toLowerCase(),
              rating: standing.tournamentPlayer.currentElo,
            },
          }));

        const registration = await tx.tournamentPlayer.create({
          data: {
            tournamentId: target.tournament.id,
            playerId: persistedPlayer.id,
            displayName,
            displayDciNumber: standing.tournamentPlayer.displayDciNumber,
            startingElo: standing.tournamentPlayer.currentElo,
            currentElo: standing.tournamentPlayer.currentElo,
            seatNumber: null,
          },
        });

        await tx.standing.create({
          data: {
            tournamentId: target.tournament.id,
            tournamentPlayerId: registration.id,
            rank: index + 1,
          },
        });
      }

      await tx.eventStage.update({
        where: { id: target.id },
        data: { status: 'ACTIVE' },
      });
    }
  });

  return getEvent(stage.eventId, auth);
}
