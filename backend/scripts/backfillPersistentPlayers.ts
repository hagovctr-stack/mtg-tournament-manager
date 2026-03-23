import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeDciNumber(dciNumber: string | null) {
  const normalized = dciNumber?.trim();
  return normalized ? normalized : null;
}

async function main() {
  const registrations = await prisma.tournamentPlayer.findMany({
    where: { playerId: null },
    orderBy: [{ tournamentId: "asc" }, { id: "asc" }],
  });

  for (const registration of registrations) {
    const normalizedName = normalizeName(registration.displayName);
    const dciNumber = normalizeDciNumber(registration.displayDciNumber);

    let player =
      dciNumber
        ? await prisma.player.findUnique({ where: { dciNumber } })
        : null;

    if (!player) {
      const matchedByName = await prisma.player.findMany({
        where: { normalizedName },
        take: 2,
      });

      if (matchedByName.length === 1) {
        player = matchedByName[0];
      }
    }

    if (!player) {
      player = await prisma.player.create({
        data: {
          name: registration.displayName,
          normalizedName,
          dciNumber,
          rating: registration.startingElo,
        },
      });
    } else if (dciNumber && !player.dciNumber) {
      player = await prisma.player.update({
        where: { id: player.id },
        data: { dciNumber },
      });
    }

    const existingTournamentRegistration = await prisma.tournamentPlayer.findFirst({
      where: {
        tournamentId: registration.tournamentId,
        playerId: player.id,
        id: { not: registration.id },
      },
    });

    if (existingTournamentRegistration) {
      player = await prisma.player.create({
        data: {
          name: registration.displayName,
          normalizedName,
          dciNumber: null,
          rating: registration.startingElo,
        },
      });
    }

    await prisma.tournamentPlayer.update({
      where: { id: registration.id },
      data: { playerId: player.id },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
