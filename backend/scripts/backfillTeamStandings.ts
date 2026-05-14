import { PrismaClient } from '@prisma/client';
import { recalculateStandings } from '../src/standingsService';
import { recalculateTeamStandings, usesTeamDraftMode } from '../src/teamService';

const prisma = new PrismaClient();

async function main() {
  const tournaments = await prisma.tournament.findMany({
    where: { teamMode: 'TEAM_DRAFT_3V3' },
    select: { id: true, name: true, status: true, teamMode: true },
    orderBy: { createdAt: 'desc' },
  });

  if (tournaments.length === 0) {
    console.log('No team draft tournaments found.');
    return;
  }

  console.log(`Found ${tournaments.length} team draft tournament(s):\n`);

  for (const t of tournaments) {
    console.log(`  [${t.status}] ${t.name} (${t.id})`);
  }

  console.log('\nRecalculating standings for all of them...\n');

  for (const t of tournaments) {
    try {
      await recalculateStandings(t.id);
      await recalculateTeamStandings(t.id);
      console.log(`  ✓ ${t.name}`);
    } catch (err) {
      console.error(`  ✗ ${t.name}: ${(err as Error).message}`);
    }
  }

  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
