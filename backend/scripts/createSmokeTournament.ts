import { SIMULATION_PLAYER_POOL } from "../src/simulationService";
import { createTournament, addPlayer } from "../src/tournamentService";

function parseArgs(argv: string[]) {
  let playerCount = 8;
  let name: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]!;
    if (value === "--players") {
      const parsed = Number.parseInt(argv[index + 1] ?? "", 10);
      if (!Number.isNaN(parsed)) playerCount = parsed;
      index += 1;
      continue;
    }
    if (value.startsWith("--players=")) {
      const parsed = Number.parseInt(value.slice("--players=".length), 10);
      if (!Number.isNaN(parsed)) playerCount = parsed;
      continue;
    }
    if (value === "--name") {
      name = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (value.startsWith("--name=")) {
      name = value.slice("--name=".length) || null;
    }
  }

  const clampedPlayerCount = Math.min(Math.max(playerCount, 2), SIMULATION_PLAYER_POOL.length);
  return { playerCount: clampedPlayerCount, name };
}

function buildDefaultName() {
  const now = new Date();
  const stamp = now.toISOString().replace("T", " ").slice(0, 16);
  return `Smoke Draft Pod ${stamp}`;
}

async function main() {
  const { playerCount, name } = parseArgs(process.argv.slice(2));
  const selectedPlayers = SIMULATION_PLAYER_POOL.slice(0, playerCount);

  const tournament = await createTournament({
    name: name?.trim() || buildDefaultName(),
    format: "Cube",
    subtitle: "Smoke validation",
    bestOfFormat: "BO3",
  });

  for (const player of selectedPlayers) {
    await addPlayer(tournament.id, {
      name: player.name,
      dciNumber: player.dciNumber,
    });
  }

  console.log(`Created smoke tournament: ${tournament.name}`);
  console.log(`Tournament ID: ${tournament.id}`);
  console.log(`Players added: ${selectedPlayers.length}`);
  console.log(`UI: http://localhost:5173/tournament/${tournament.id}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../src/db");
    await prisma.$disconnect();
  });
