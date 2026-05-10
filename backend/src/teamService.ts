import { prisma } from './db';

export function usesTeamDraftMode(teamMode: string) {
  return teamMode === 'TEAM_DRAFT_3V3';
}

export function usesBeforeDraftTeamSetup(teamSetupTiming: string) {
  return teamSetupTiming === 'BEFORE_DRAFT';
}

const TEAM_DEFINITIONS = [
  { seed: 1, name: 'Team A' },
  { seed: 2, name: 'Team B' },
] as const;
const TEMP_SEAT_ORDER_OFFSET = 10;

type TeamDefinition = {
  seed: number;
  name: string;
  members: Array<{ tournamentPlayerId: string; seatOrder: number }>;
};

type TeamAssignmentInput = {
  teamSeed: number;
  tournamentPlayerId: string;
  seatOrder: number;
};

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function buildRandomTeams(players: Array<{ tournamentPlayerId: string }>): TeamDefinition[] {
  if (players.length !== 6) {
    throw new Error('Team draft requires exactly 6 active players');
  }

  const shuffled = shuffle(players);
  return TEAM_DEFINITIONS.map((team, teamIndex) => ({
    seed: team.seed,
    name: team.name,
    members: shuffled.slice(teamIndex * 3, teamIndex * 3 + 3).map((player, memberIndex) => ({
      tournamentPlayerId: player.tournamentPlayerId,
      seatOrder: memberIndex + 1,
    })),
  }));
}

export function buildAlternatingTeams(
  players: Array<{ tournamentPlayerId: string; seatNumber: number; name: string }>,
): TeamDefinition[] {
  if (players.length !== 6) {
    throw new Error('Team draft requires exactly 6 seated players');
  }

  const ordered = [...players].sort((left, right) => left.seatNumber - right.seatNumber);

  return TEAM_DEFINITIONS.map((team, teamIndex) => ({
    seed: team.seed,
    name: team.name,
    members: ordered
      .filter((_, playerIndex) => playerIndex % 2 === teamIndex)
      .map((player, memberIndex) => ({
        tournamentPlayerId: player.tournamentPlayerId,
        seatOrder: memberIndex + 1,
      })),
  }));
}

function normalizeAssignments(assignments: TeamAssignmentInput[]): TeamDefinition[] {
  if (assignments.length !== 6) throw new Error('Exactly 6 assignments are required');

  const uniquePlayers = new Set(assignments.map((assignment) => assignment.tournamentPlayerId));
  if (uniquePlayers.size !== 6) throw new Error('Each player must be assigned exactly once');

  return TEAM_DEFINITIONS.map((team) => {
    const members = assignments
      .filter((assignment) => assignment.teamSeed === team.seed)
      .sort((left, right) => left.seatOrder - right.seatOrder);

    if (members.length !== 3) {
      throw new Error(`${team.name} must have exactly three players`);
    }

    const seatOrders = members
      .map((member) => member.seatOrder)
      .sort((left, right) => left - right);
    if (seatOrders.join(',') !== '1,2,3') {
      throw new Error(`${team.name} must use board slots 1, 2, and 3 exactly once`);
    }

    return {
      seed: team.seed,
      name: team.name,
      members: members.map((member) => ({
        tournamentPlayerId: member.tournamentPlayerId,
        seatOrder: member.seatOrder,
      })),
    };
  });
}

function validateTeamDraftTournament(tournament: {
  format: string;
  teamMode: string;
  players: Array<{ id: string; active?: boolean }>;
}) {
  if (!usesTeamDraftMode(tournament.teamMode)) {
    throw new Error('Tournament is not in team draft mode');
  }
  if (!['Draft', 'Cube'].includes(tournament.format)) {
    throw new Error('Team draft mode is only available for Draft and Cube');
  }
  if (tournament.players.length !== 6) {
    throw new Error('Team draft mode requires exactly 6 active players');
  }
}

async function replaceTournamentTeams(tournamentId: string, definitions: TeamDefinition[]) {
  await prisma.$transaction(async (tx) => {
    await tx.tournamentTeamMember.deleteMany({
      where: { team: { tournamentId } },
    });
    await tx.teamStanding.deleteMany({ where: { tournamentId } });
    await tx.tournamentTeam.deleteMany({ where: { tournamentId } });

    for (const definition of definitions) {
      const team = await tx.tournamentTeam.create({
        data: {
          tournamentId,
          name: definition.name,
          seed: definition.seed,
        },
      });

      for (const member of definition.members) {
        await tx.tournamentTeamMember.create({
          data: {
            teamId: team.id,
            tournamentPlayerId: member.tournamentPlayerId,
            seatOrder: member.seatOrder,
          },
        });
      }
    }
  });
}

function serializeTeam(team: any) {
  return {
    id: team.id,
    name: team.name,
    seed: team.seed,
    members: (team.members ?? [])
      .slice()
      .sort((left: any, right: any) => left.seatOrder - right.seatOrder)
      .map((member: any) => ({
        id: member.id,
        seatOrder: member.seatOrder,
        tournamentPlayerId: member.tournamentPlayerId,
        player: member.tournamentPlayer
          ? {
              id: member.tournamentPlayer.id,
              tournamentPlayerId: member.tournamentPlayer.id,
              playerId: member.tournamentPlayer.playerId,
              name: member.tournamentPlayer.displayName,
              dciNumber: member.tournamentPlayer.displayDciNumber,
              elo: member.tournamentPlayer.currentElo,
              active: member.tournamentPlayer.active,
              tournamentId: member.tournamentPlayer.tournamentId,
              seatNumber: member.tournamentPlayer.seatNumber ?? null,
              avatarUrl: member.tournamentPlayer.player?.avatarUrl ?? null,
            }
          : null,
      })),
  };
}

export async function generateRandomTournamentTeams(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      players: {
        where: { active: true },
        include: { player: true },
      },
      rounds: { select: { id: true } },
      teams: {
        include: {
          members: {
            include: {
              tournamentPlayer: {
                include: { player: true },
              },
            },
          },
        },
      },
    },
  });

  if (!tournament) throw new Error('Tournament not found');
  validateTeamDraftTournament(tournament);
  if (tournament.rounds?.length) {
    throw new Error('Teams are locked once round 1 has been created');
  }

  const definitions = buildRandomTeams(
    tournament.players.map((player) => ({
      tournamentPlayerId: player.id,
    })),
  );

  await replaceTournamentTeams(tournamentId, definitions);

  await recalculateTeamStandings(tournamentId);
  return getTournamentTeams(tournamentId);
}

export async function saveTournamentTeams(
  tournamentId: string,
  assignments: TeamAssignmentInput[],
) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      rounds: { select: { id: true } },
      players: { where: { active: true }, select: { id: true } },
    },
  });
  if (!tournament) throw new Error('Tournament not found');
  if (tournament.rounds.length > 0)
    throw new Error('Teams are locked once round 1 has been created');
  validateTeamDraftTournament(tournament);

  const activePlayerIds = new Set(tournament.players.map((player) => player.id));
  for (const assignment of assignments) {
    if (!TEAM_DEFINITIONS.some((team) => team.seed === assignment.teamSeed)) {
      throw new Error('Invalid team assignment');
    }
    if (!activePlayerIds.has(assignment.tournamentPlayerId)) {
      throw new Error('Invalid player assignment');
    }
  }

  await replaceTournamentTeams(tournamentId, normalizeAssignments(assignments));

  await recalculateTeamStandings(tournamentId);
  return getTournamentTeams(tournamentId);
}

export async function randomizeTeamDraftSeats(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      players: { where: { active: true }, select: { id: true } },
      rounds: { select: { id: true } },
      teams: {
        orderBy: { seed: 'asc' },
        include: {
          members: {
            orderBy: { seatOrder: 'asc' },
          },
        },
      },
    },
  });

  if (!tournament) throw new Error('Tournament not found');
  validateTeamDraftTournament(tournament);
  if (!usesBeforeDraftTeamSetup((tournament as any).teamSetupTiming)) {
    throw new Error('This tournament assigns teams after the draft');
  }
  if (tournament.rounds.length > 0) {
    throw new Error('Seats are locked once round 1 has been created');
  }
  if (tournament.teams.length !== 2 || tournament.teams.some((team) => team.members.length !== 3)) {
    throw new Error('Define two full teams before randomizing seats');
  }

  const [left, right] = tournament.teams;
  const leftMembers = shuffle(left.members);
  const rightMembers = shuffle(right.members);
  const seatAssignments = [...leftMembers, ...rightMembers].map((member) => ({
    tournamentPlayerId: member.tournamentPlayerId,
    seatNumber: 0,
    seatOrder: 0,
  }));

  for (let index = 0; index < 3; index += 1) {
    const leftAssignment = seatAssignments.find(
      (member) => member.tournamentPlayerId === leftMembers[index]!.tournamentPlayerId,
    )!;
    leftAssignment.seatNumber = index * 2 + 1;
    leftAssignment.seatOrder = index + 1;

    const rightAssignment = seatAssignments.find(
      (member) => member.tournamentPlayerId === rightMembers[index]!.tournamentPlayerId,
    )!;
    rightAssignment.seatNumber = index * 2 + 2;
    rightAssignment.seatOrder = index + 1;
  }

  await prisma.$transaction([
    ...seatAssignments.map((assignment) =>
      prisma.tournamentPlayer.update({
        where: { id: assignment.tournamentPlayerId },
        data: { seatNumber: assignment.seatNumber },
      }),
    ),
    ...seatAssignments.map((assignment) =>
      prisma.tournamentTeamMember.updateMany({
        where: { tournamentPlayerId: assignment.tournamentPlayerId },
        data: { seatOrder: assignment.seatOrder + TEMP_SEAT_ORDER_OFFSET },
      }),
    ),
    ...seatAssignments.map((assignment) =>
      prisma.tournamentTeamMember.updateMany({
        where: { tournamentPlayerId: assignment.tournamentPlayerId },
        data: { seatOrder: assignment.seatOrder },
      }),
    ),
  ]);

  return { seated: seatAssignments.length };
}

export async function getTournamentTeams(tournamentId: string) {
  const teams = await prisma.tournamentTeam.findMany({
    where: { tournamentId },
    orderBy: { seed: 'asc' },
    include: {
      members: {
        include: {
          tournamentPlayer: {
            include: { player: { select: { avatarUrl: true } } },
          },
        },
      },
    },
  });

  return teams.map(serializeTeam);
}

export async function recalculateTeamStandings(tournamentId: string) {
  const teams = await prisma.tournamentTeam.findMany({
    where: { tournamentId },
    include: {
      members: {
        include: {
          tournamentPlayer: true,
        },
      },
    },
    orderBy: { seed: 'asc' },
  });

  if (teams.length === 0) {
    await prisma.teamStanding.deleteMany({ where: { tournamentId } });
    return [];
  }

  const membershipToTeam = new Map<string, string>();
  for (const team of teams) {
    for (const member of team.members) {
      membershipToTeam.set(member.tournamentPlayerId, team.id);
    }
  }

  const rounds = await prisma.round.findMany({
    where: { tournamentId, status: { in: ['ACTIVE', 'FINISHED'] } },
    include: { matches: true },
    orderBy: { number: 'asc' },
  });

  const totals = new Map<string, any>();
  for (const team of teams) {
    totals.set(team.id, {
      tournamentId,
      tournamentTeamId: team.id,
      teamName: team.name,
      matchPoints: 0,
      roundWins: 0,
      roundLosses: 0,
      roundDraws: 0,
      boardWins: 0,
      boardLosses: 0,
      boardDraws: 0,
    });
  }

  for (const round of rounds) {
    const roundTeamTotals = new Map<string, { wins: number; losses: number; draws: number }>();

    for (const match of round.matches) {
      if (
        match.result === 'PENDING' ||
        match.result === 'BYE' ||
        !match.player2TournamentPlayerId
      ) {
        continue;
      }
      const team1Id = membershipToTeam.get(match.player1TournamentPlayerId);
      const team2Id = membershipToTeam.get(match.player2TournamentPlayerId);
      if (!team1Id || !team2Id || team1Id === team2Id) continue;

      const team1 = totals.get(team1Id);
      const team2 = totals.get(team2Id);
      const round1 = roundTeamTotals.get(team1Id) ?? { wins: 0, losses: 0, draws: 0 };
      const round2 = roundTeamTotals.get(team2Id) ?? { wins: 0, losses: 0, draws: 0 };

      if (match.result === 'P1_WIN') {
        team1.boardWins += 1;
        team2.boardLosses += 1;
        round1.wins += 1;
        round2.losses += 1;
      } else if (match.result === 'P2_WIN') {
        team2.boardWins += 1;
        team1.boardLosses += 1;
        round2.wins += 1;
        round1.losses += 1;
      } else if (match.result === 'DRAW') {
        team1.boardDraws += 1;
        team2.boardDraws += 1;
        round1.draws += 1;
        round2.draws += 1;
      }

      roundTeamTotals.set(team1Id, round1);
      roundTeamTotals.set(team2Id, round2);
    }

    if (roundTeamTotals.size === 2) {
      const [firstTeamId, secondTeamId] = [...roundTeamTotals.keys()];
      const left = roundTeamTotals.get(firstTeamId)!;
      const right = roundTeamTotals.get(secondTeamId)!;
      const first = totals.get(firstTeamId)!;
      const second = totals.get(secondTeamId)!;

      if (left.wins > right.wins) {
        first.roundWins += 1;
        first.matchPoints += 3;
        second.roundLosses += 1;
      } else if (right.wins > left.wins) {
        second.roundWins += 1;
        second.matchPoints += 3;
        first.roundLosses += 1;
      } else {
        first.roundDraws += 1;
        second.roundDraws += 1;
        first.matchPoints += 1;
        second.matchPoints += 1;
      }
    }
  }

  const sorted = [...totals.values()].sort((left, right) => {
    if (left.matchPoints !== right.matchPoints) return right.matchPoints - left.matchPoints;
    if (left.boardWins !== right.boardWins) return right.boardWins - left.boardWins;
    return left.teamName.localeCompare(right.teamName);
  });

  await prisma.$transaction(
    sorted.map((entry, index) =>
      prisma.teamStanding.upsert({
        where: {
          tournamentId_tournamentTeamId: {
            tournamentId,
            tournamentTeamId: entry.tournamentTeamId,
          },
        },
        update: {
          matchPoints: entry.matchPoints,
          roundWins: entry.roundWins,
          roundLosses: entry.roundLosses,
          roundDraws: entry.roundDraws,
          boardWins: entry.boardWins,
          boardLosses: entry.boardLosses,
          boardDraws: entry.boardDraws,
          rank: index + 1,
        },
        create: {
          tournamentId,
          tournamentTeamId: entry.tournamentTeamId,
          matchPoints: entry.matchPoints,
          roundWins: entry.roundWins,
          roundLosses: entry.roundLosses,
          roundDraws: entry.roundDraws,
          boardWins: entry.boardWins,
          boardLosses: entry.boardLosses,
          boardDraws: entry.boardDraws,
          rank: index + 1,
        },
      }),
    ),
  );

  const standings = await prisma.teamStanding.findMany({
    where: { tournamentId },
    include: { team: true },
    orderBy: { rank: 'asc' },
  });

  return standings.map((standing) => ({
    id: standing.id,
    rank: standing.rank,
    matchPoints: standing.matchPoints,
    roundWins: standing.roundWins,
    roundLosses: standing.roundLosses,
    roundDraws: standing.roundDraws,
    boardWins: standing.boardWins,
    boardLosses: standing.boardLosses,
    boardDraws: standing.boardDraws,
    team: {
      id: standing.team.id,
      name: standing.team.name,
      seed: standing.team.seed,
    },
  }));
}

export function buildTeamRoundPairingsForRound(
  leftMembers: Array<{ tournamentPlayerId: string }>,
  rightMembers: Array<{ tournamentPlayerId: string }>,
  roundNumber: number,
) {
  if (leftMembers.length !== 3 || rightMembers.length !== 3) {
    throw new Error('Each team must have exactly three players');
  }

  const rotation =
    (((roundNumber - 1) % rightMembers.length) + rightMembers.length) % rightMembers.length;

  return leftMembers.map((member, index) => ({
    player1Id: member.tournamentPlayerId,
    player2Id: rightMembers[(index + rotation) % rightMembers.length]?.tournamentPlayerId ?? null,
    tableNumber: index + 1,
    isBye: false,
  }));
}

export async function buildTeamRoundPairings(tournamentId: string, roundNumber: number) {
  const teams = await prisma.tournamentTeam.findMany({
    where: { tournamentId },
    orderBy: { seed: 'asc' },
    include: {
      members: {
        include: { tournamentPlayer: true },
        orderBy: { seatOrder: 'asc' },
      },
    },
  });

  if (teams.length !== 2) {
    throw new Error('Team draft rounds require exactly two teams');
  }

  const [left, right] = teams;
  if (left.members.length !== 3 || right.members.length !== 3) {
    throw new Error('Each team must have exactly three players');
  }

  return buildTeamRoundPairingsForRound(left.members, right.members, roundNumber);
}
