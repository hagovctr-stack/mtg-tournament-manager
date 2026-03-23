import { describe, expect, it } from "vitest";
import { generateSeatPairings, recommendedRounds } from "../src/pairingAlgorithm";
import { MAX_TOURNAMENT_PLAYERS } from "../src/tournamentRules";
import { replayTournamentElo } from "../src/eloService";
import {
  MAX_DRAFT_POD_PLAYERS,
  SIMULATION_PLAYER_POOL,
  buildValidationFailureMessage,
  createSeededRandom,
  describeResult,
  getSimulationParticipantRange,
  generateRandomResult,
  isValidRandomResult,
  pickBestOfFormat,
  pickTournamentFormat,
  pickTournamentParticipants,
  runSeededTournamentSimulation,
  usesDraftPodSimulationSeating,
  type ActualPlayerRating,
  type BestOfFormat,
  type TournamentFormat,
  type PersistedTournamentHistory,
  type PoolRatingSnapshot,
  type RatingValidationResult,
  type SimulationResultInput,
  type SimulationRound,
  type SimulationRuntime,
  validatePersistedTournamentRatings,
} from "../src/simulationService";

type FakePlayer = {
  id: string;
  name: string;
  dciNumber: string;
  rating: number;
};

type FakeRegistration = {
  id: string;
  playerId: string;
  displayName: string;
  displayDciNumber: string;
  startingElo: number;
  currentElo: number;
  seatNumber: number | null;
};

type FakeMatch = {
  id: string;
  tableNumber: number;
  player1RegistrationId: string;
  player2RegistrationId: string | null;
  result: "PENDING" | "P1_WIN" | "P2_WIN" | "DRAW" | "BYE";
  wins1: number | null;
  wins2: number | null;
  draws: number | null;
};

type FakeTournament = {
  id: string;
  name: string;
  format: TournamentFormat;
  bestOfFormat: BestOfFormat;
  createdAt: string;
  totalRounds: number;
  currentRound: number;
  status: "REGISTRATION" | "ACTIVE" | "FINISHED";
  registrations: FakeRegistration[];
  rounds: Array<{
    number: number;
    matches: FakeMatch[];
  }>;
};

class FakeSimulationRuntime implements SimulationRuntime {
  private players = new Map<string, FakePlayer>();
  private tournaments: FakeTournament[] = [];
  private nextPlayerId = 1;
  private nextTournamentId = 1;
  private nextRegistrationId = 1;
  private nextMatchId = 1;

  async ensurePool(players: typeof SIMULATION_PLAYER_POOL) {
    for (const player of players) {
      if (this.players.has(player.dciNumber)) continue;
      const id = `player-${this.nextPlayerId++}`;
      this.players.set(player.dciNumber, {
        id,
        name: player.name,
        dciNumber: player.dciNumber,
        rating: 1500,
      });
    }
    return this.getPoolRatings(players);
  }

  async getPoolRatings(players: typeof SIMULATION_PLAYER_POOL): Promise<PoolRatingSnapshot[]> {
    return players.map((player) => {
      const existing = this.players.get(player.dciNumber);
      return {
        playerId: existing?.id ?? null,
        name: existing?.name ?? player.name,
        dciNumber: player.dciNumber,
        rating: existing?.rating ?? 1500,
      };
    });
  }

  async createTournament(input: { name: string; format: TournamentFormat; bestOfFormat: BestOfFormat }) {
    const tournament: FakeTournament = {
      id: `tournament-${this.nextTournamentId++}`,
      name: input.name,
      format: input.format,
      bestOfFormat: input.bestOfFormat,
      createdAt: new Date(Date.UTC(2026, 0, this.tournaments.length + 1)).toISOString(),
      totalRounds: 0,
      currentRound: 0,
      status: "REGISTRATION",
      registrations: [],
      rounds: [],
    };
    this.tournaments.push(tournament);
    return { id: tournament.id, name: tournament.name };
  }

  async addPlayer(tournamentId: string, input: { name: string; dciNumber: string }) {
    const tournament = this.getTournamentOrThrow(tournamentId);
    const player = this.players.get(input.dciNumber);
    if (!player) throw new Error(`Unknown player ${input.dciNumber}`);
    tournament.registrations.push({
      id: `registration-${this.nextRegistrationId++}`,
      playerId: player.id,
      displayName: input.name,
      displayDciNumber: input.dciNumber,
      startingElo: player.rating,
      currentElo: player.rating,
      seatNumber: null,
    });
  }

  async startTournament(tournamentId: string) {
    const tournament = this.getTournamentOrThrow(tournamentId);
    tournament.status = "ACTIVE";
    tournament.totalRounds = recommendedRounds(tournament.registrations.length);
    return { id: tournament.id, totalRounds: tournament.totalRounds };
  }

  async randomizeSeats(tournamentId: string) {
    const tournament = this.getTournamentOrThrow(tournamentId);
    if (!usesDraftPodSimulationSeating(tournament.format)) {
      throw new Error(`Seat randomization not supported for ${tournament.format}`);
    }
    tournament.registrations.forEach((registration, index) => {
      registration.seatNumber = index + 1;
    });
  }

  async generateRound(tournamentId: string): Promise<SimulationRound | null> {
    const tournament = this.getTournamentOrThrow(tournamentId);
    if (tournament.currentRound >= tournament.totalRounds) return null;

    tournament.currentRound += 1;
    const number = tournament.currentRound;
    const matches: FakeMatch[] = [];

    if (
      number === 1 &&
      usesDraftPodSimulationSeating(tournament.format) &&
      tournament.registrations.every((registration) => registration.seatNumber != null)
    ) {
      const { pairings } = generateSeatPairings(
        tournament.registrations.map((registration) => ({
          id: registration.id,
          seatNumber: registration.seatNumber!,
        }))
      );

      for (const pairing of pairings) {
        matches.push({
          id: `match-${this.nextMatchId++}`,
          tableNumber: pairing.tableNumber,
          player1RegistrationId: pairing.player1Id,
          player2RegistrationId: pairing.player2Id,
          result: pairing.isBye ? "BYE" : "PENDING",
          wins1: pairing.isBye ? 2 : null,
          wins2: pairing.isBye ? 0 : null,
          draws: pairing.isBye ? 0 : null,
        });
      }
    } else {
      const orderedRegistrations = [...tournament.registrations].sort((left, right) =>
        left.displayName.localeCompare(right.displayName)
      );
      const rotation = orderedRegistrations.length === 0 ? 0 : (number - 1) % orderedRegistrations.length;
      const rotated = orderedRegistrations
        .slice(rotation)
        .concat(orderedRegistrations.slice(0, rotation));

      let tableNumber = 1;
      for (let index = 0; index < rotated.length; index += 2) {
        const player1 = rotated[index]!;
        const player2 = rotated[index + 1] ?? null;
        if (!player2) {
          matches.push({
            id: `match-${this.nextMatchId++}`,
            tableNumber,
            player1RegistrationId: player1.id,
            player2RegistrationId: null,
            result: "BYE",
            wins1: 2,
            wins2: 0,
            draws: 0,
          });
        } else {
          matches.push({
            id: `match-${this.nextMatchId++}`,
            tableNumber,
            player1RegistrationId: player1.id,
            player2RegistrationId: player2.id,
            result: "PENDING",
            wins1: null,
            wins2: null,
            draws: null,
          });
        }
        tableNumber += 1;
      }
    }

    tournament.rounds.push({ number, matches });

    return {
      number,
      matches: matches.map((match) => ({
        id: match.id,
        tableNumber: match.tableNumber,
        result: match.result,
        player1: { name: this.getRegistration(tournament, match.player1RegistrationId).displayName },
        player2: match.player2RegistrationId
          ? { name: this.getRegistration(tournament, match.player2RegistrationId).displayName }
          : null,
      })),
    };
  }

  async reportResult(matchId: string, input: SimulationResultInput) {
    const { match } = this.findMatch(matchId);
    match.wins1 = input.wins1;
    match.wins2 = input.wins2;
    match.draws = input.draws;
    if (input.wins1 > input.wins2) match.result = "P1_WIN";
    else if (input.wins2 > input.wins1) match.result = "P2_WIN";
    else match.result = "DRAW";
  }

  async finishTournament(tournamentId: string) {
    const tournament = this.getTournamentOrThrow(tournamentId);
    const replayed = replayTournamentElo(
      tournament.registrations.map((registration) => ({
        id: registration.id,
        startingElo: registration.startingElo,
      })),
      tournament.rounds.flatMap((round) =>
        round.matches.map((match) => ({
          roundNumber: round.number,
          tableNumber: match.tableNumber,
          player1Id: match.player1RegistrationId,
          player2Id: match.player2RegistrationId,
          result: match.result,
        }))
      )
    );

    for (const registration of tournament.registrations) {
      const finalRating = replayed.get(registration.id) ?? registration.startingElo;
      registration.currentElo = finalRating;
      const player = [...this.players.values()].find((candidate) => candidate.id === registration.playerId);
      if (player) player.rating = finalRating;
    }

    tournament.status = "FINISHED";
  }

  async getStandings(tournamentId: string) {
    const tournament = this.getTournamentOrThrow(tournamentId);
    const points = new Map<string, number>();
    for (const registration of tournament.registrations) {
      points.set(registration.id, 0);
    }

    for (const round of tournament.rounds) {
      for (const match of round.matches) {
        if (match.result === "BYE") {
          points.set(match.player1RegistrationId, (points.get(match.player1RegistrationId) ?? 0) + 3);
          continue;
        }
        if (match.result === "P1_WIN") {
          points.set(match.player1RegistrationId, (points.get(match.player1RegistrationId) ?? 0) + 3);
        } else if (match.result === "P2_WIN" && match.player2RegistrationId) {
          points.set(match.player2RegistrationId, (points.get(match.player2RegistrationId) ?? 0) + 3);
        } else if (match.result === "DRAW" && match.player2RegistrationId) {
          points.set(match.player1RegistrationId, (points.get(match.player1RegistrationId) ?? 0) + 1);
          points.set(match.player2RegistrationId, (points.get(match.player2RegistrationId) ?? 0) + 1);
        }
      }
    }

    const sorted = [...tournament.registrations].sort((left, right) => {
      const pointDiff = (points.get(right.id) ?? 0) - (points.get(left.id) ?? 0);
      if (pointDiff !== 0) return pointDiff;
      return left.displayName.localeCompare(right.displayName);
    });

    return sorted.map((registration, index) => ({
      rank: index + 1,
      matchPoints: points.get(registration.id) ?? 0,
      player: {
        name: registration.displayName,
        elo: registration.currentElo,
      },
    }));
  }

  async validatePoolRatings(playerIds: string[]): Promise<RatingValidationResult> {
    const histories: PersistedTournamentHistory[] = this.tournaments
      .filter((tournament) => tournament.status === "FINISHED")
      .map((tournament) => ({
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        createdAt: tournament.createdAt,
        registrations: tournament.registrations.map((registration) => ({
          tournamentPlayerId: registration.id,
          playerId: registration.playerId,
          playerName: registration.displayName,
          startingElo: registration.startingElo,
          currentElo: registration.currentElo,
        })),
        matches: tournament.rounds.flatMap((round) =>
          round.matches.map((match) => ({
            roundNumber: round.number,
            tableNumber: match.tableNumber,
            player1Id: match.player1RegistrationId,
            player2Id: match.player2RegistrationId,
            result: match.result,
          }))
        ),
      }));

    const actualPlayers: ActualPlayerRating[] = [...this.players.values()]
      .filter((player) => playerIds.includes(player.id))
      .map((player) => ({
        playerId: player.id,
        name: player.name,
        rating: player.rating,
      }));

    return validatePersistedTournamentRatings(histories, actualPlayers);
  }

  private getTournamentOrThrow(tournamentId: string) {
    const tournament = this.tournaments.find((candidate) => candidate.id === tournamentId);
    if (!tournament) throw new Error(`Unknown tournament ${tournamentId}`);
    return tournament;
  }

  private getRegistration(tournament: FakeTournament, registrationId: string) {
    const registration = tournament.registrations.find((candidate) => candidate.id === registrationId);
    if (!registration) throw new Error(`Unknown registration ${registrationId}`);
    return registration;
  }

  private findMatch(matchId: string) {
    for (const tournament of this.tournaments) {
      for (const round of tournament.rounds) {
        const match = round.matches.find((candidate) => candidate.id === matchId);
        if (match) return { tournament, round, match };
      }
    }
    throw new Error(`Unknown match ${matchId}`);
  }
}

describe("seeded simulation helpers", () => {
  it("selects Draft/Cube participants deterministically within the 6-12 pod range", () => {
    const rngA = createSeededRandom("alpha-seed");
    const rngB = createSeededRandom("alpha-seed");

    const selectionsA = Array.from({ length: 5 }, () =>
      pickTournamentParticipants(SIMULATION_PLAYER_POOL, rngA, "Draft").map((player) => player.dciNumber)
    );
    const selectionsB = Array.from({ length: 5 }, () =>
      pickTournamentParticipants(SIMULATION_PLAYER_POOL, rngB, "Draft").map((player) => player.dciNumber)
    );

    expect(selectionsA).toEqual(selectionsB);
    for (const selection of selectionsA) {
      expect(selection.length).toBeGreaterThanOrEqual(6);
      expect(selection.length).toBeLessThanOrEqual(MAX_DRAFT_POD_PLAYERS);
      expect(new Set(selection).size).toBe(selection.length);
    }
  });

  it("can fill non-pod formats up to full room capacity", () => {
    const rng = createSeededRandom("full-room-seed");
    const randomField = pickTournamentParticipants(SIMULATION_PLAYER_POOL, rng, "Modern");
    const fullRoom = pickTournamentParticipants(SIMULATION_PLAYER_POOL, rng, "Modern", true);

    expect(randomField.length).toBeGreaterThanOrEqual(6);
    expect(randomField.length).toBeLessThanOrEqual(MAX_TOURNAMENT_PLAYERS);
    expect(fullRoom).toHaveLength(MAX_TOURNAMENT_PLAYERS);
  });

  it("generates only legal random results for each format", () => {
    const rng = createSeededRandom("results-seed");
    const formats: BestOfFormat[] = ["BO1", "BO3", "BO5"];

    for (const format of formats) {
      for (let index = 0; index < 100; index += 1) {
        const result = generateRandomResult(format, rng);
        expect(isValidRandomResult(format, result)).toBe(true);
        expect(typeof describeResult(result)).toBe("string");
      }
    }
  });

  it("selects best-of formats deterministically from the seeded rng", () => {
    const rngA = createSeededRandom("format-seed");
    const rngB = createSeededRandom("format-seed");
    const sequenceA = Array.from({ length: 12 }, () => pickBestOfFormat(rngA));
    const sequenceB = Array.from({ length: 12 }, () => pickBestOfFormat(rngB));
    expect(sequenceA).toEqual(sequenceB);
  });

  it("selects tournament formats deterministically from the seeded rng", () => {
    const rngA = createSeededRandom("tournament-format-seed");
    const rngB = createSeededRandom("tournament-format-seed");
    const sequenceA = Array.from({ length: 16 }, () => pickTournamentFormat(rngA));
    const sequenceB = Array.from({ length: 16 }, () => pickTournamentFormat(rngB));
    const validFormats: TournamentFormat[] = [
      "Draft",
      "Sealed",
      "Cube",
      "Standard",
      "Pioneer",
      "Modern",
      "Legacy",
      "Vintage",
      "Pauper",
      "Commander",
    ];

    expect(sequenceA).toEqual(sequenceB);
    expect(new Set(sequenceA).size).toBeGreaterThan(1);
    expect(sequenceA.every((format) => validFormats.includes(format))).toBe(true);
  });
});

describe("validatePersistedTournamentRatings", () => {
  it("accepts a matching replay and persisted player ratings", () => {
    const tournaments: PersistedTournamentHistory[] = [
      {
        tournamentId: "t1",
        tournamentName: "T1",
        createdAt: "2026-01-01T00:00:00.000Z",
        registrations: [
          { tournamentPlayerId: "tp1", playerId: "p1", playerName: "Alice", startingElo: 1500, currentElo: 1516 },
          { tournamentPlayerId: "tp2", playerId: "p2", playerName: "Bob", startingElo: 1500, currentElo: 1484 },
        ],
        matches: [
          { roundNumber: 1, tableNumber: 1, player1Id: "tp1", player2Id: "tp2", result: "P1_WIN" },
        ],
      },
    ];

    const actualPlayers: ActualPlayerRating[] = [
      { playerId: "p1", name: "Alice", rating: 1516 },
      { playerId: "p2", name: "Bob", rating: 1484 },
    ];

    const validation = validatePersistedTournamentRatings(tournaments, actualPlayers);
    expect(validation.ok).toBe(true);
    expect(validation.playerRatingMismatches).toHaveLength(0);
    expect(validation.currentEloMismatches).toHaveLength(0);
    expect(validation.startingEloMismatches).toHaveLength(0);
  });

  it("reports mismatches when persisted ratings diverge from the replay", () => {
    const tournaments: PersistedTournamentHistory[] = [
      {
        tournamentId: "t1",
        tournamentName: "T1",
        createdAt: "2026-01-01T00:00:00.000Z",
        registrations: [
          { tournamentPlayerId: "tp1", playerId: "p1", playerName: "Alice", startingElo: 1500, currentElo: 1516 },
          { tournamentPlayerId: "tp2", playerId: "p2", playerName: "Bob", startingElo: 1500, currentElo: 1484 },
        ],
        matches: [
          { roundNumber: 1, tableNumber: 1, player1Id: "tp1", player2Id: "tp2", result: "P1_WIN" },
        ],
      },
      {
        tournamentId: "t2",
        tournamentName: "T2",
        createdAt: "2026-01-02T00:00:00.000Z",
        registrations: [
          { tournamentPlayerId: "tp3", playerId: "p1", playerName: "Alice", startingElo: 1500, currentElo: 1500 },
          { tournamentPlayerId: "tp4", playerId: "p2", playerName: "Bob", startingElo: 1484, currentElo: 1484 },
        ],
        matches: [
          { roundNumber: 1, tableNumber: 1, player1Id: "tp3", player2Id: "tp4", result: "DRAW" },
        ],
      },
    ];

    const actualPlayers: ActualPlayerRating[] = [
      { playerId: "p1", name: "Alice", rating: 1510 },
      { playerId: "p2", name: "Bob", rating: 1484 },
    ];

    const validation = validatePersistedTournamentRatings(tournaments, actualPlayers);
    expect(validation.ok).toBe(false);
    expect(validation.playerRatingMismatches.length).toBeGreaterThan(0);
    expect(validation.startingEloMismatches.length).toBeGreaterThan(0);
    expect(buildValidationFailureMessage(validation)).toContain("mismatch");
  });
});

describe("runSeededTournamentSimulation", () => {
  it("runs ten tournaments against a persistent pool and finishes with valid replayed ratings", async () => {
    const runtime = new FakeSimulationRuntime();

    const summary = await runSeededTournamentSimulation({
      seed: "integration-seed",
      runtime,
    });

    expect(summary.tournaments).toHaveLength(10);
    expect(summary.tournaments.some((tournament) => tournament.format === "Draft" || tournament.format === "Cube")).toBe(true);
    expect(summary.tournaments.some((tournament) => tournament.format === "Modern" || tournament.format === "Standard" || tournament.format === "Commander")).toBe(true);
    expect(summary.tournaments.some((tournament) => tournament.participants.length === MAX_TOURNAMENT_PLAYERS && tournament.format !== "Draft" && tournament.format !== "Cube")).toBe(true);
    expect(summary.finalValidation.ok).toBe(true);
    expect(summary.finalRatings).toHaveLength(SIMULATION_PLAYER_POOL.length);
    expect(summary.finalRatings.some((player) => player.rating !== 1500)).toBe(true);
    expect(summary.tournaments.every((tournament) => tournament.validation.ok)).toBe(true);
  });
});
