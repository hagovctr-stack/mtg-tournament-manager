import { createRealSimulationRuntime, runSeededTournamentSimulation } from "../src/simulationService";

function parseSeed(argv: string[]) {
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]!;
    if (value === "--seed") return argv[index + 1] ?? "mtg-sim";
    if (value.startsWith("--seed=")) return value.slice("--seed=".length) || "mtg-sim";
  }
  return "mtg-sim";
}

async function main() {
  const seed = parseSeed(process.argv.slice(2));
  const runtime = await createRealSimulationRuntime();
  await runSeededTournamentSimulation({
    seed,
    runtime,
    log: (line) => console.log(line),
  });
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
