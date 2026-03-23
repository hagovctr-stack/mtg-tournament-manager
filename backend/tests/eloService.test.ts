import { describe, expect, it } from "vitest";
import { ELO_K_FACTOR, replayTournamentElo, type EloReplayMatch, type EloReplayPlayer } from "../src/eloService";

function ratingsObject(ratings: Map<string, number>) {
  return Object.fromEntries([...ratings.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

describe("replayTournamentElo", () => {
  it("applies a standard K=32 win delta for equally rated players", () => {
    const players: EloReplayPlayer[] = [
      { id: "p1", startingElo: 1500 },
      { id: "p2", startingElo: 1500 },
    ];
    const matches: EloReplayMatch[] = [
      { roundNumber: 1, tableNumber: 1, player1Id: "p1", player2Id: "p2", result: "P1_WIN" },
    ];

    expect(ELO_K_FACTOR).toBe(32);
    expect(ratingsObject(replayTournamentElo(players, matches))).toEqual({ p1: 1516, p2: 1484 });
  });

  it("updates both players correctly for draws", () => {
    const players: EloReplayPlayer[] = [
      { id: "p1", startingElo: 1516 },
      { id: "p2", startingElo: 1484 },
    ];
    const matches: EloReplayMatch[] = [
      { roundNumber: 1, tableNumber: 1, player1Id: "p1", player2Id: "p2", result: "DRAW" },
    ];

    expect(ratingsObject(replayTournamentElo(players, matches))).toEqual({ p1: 1515, p2: 1485 });
  });

  it("ignores byes and pending matches", () => {
    const players: EloReplayPlayer[] = [
      { id: "p1", startingElo: 1500 },
      { id: "p2", startingElo: 1500 },
      { id: "p3", startingElo: 1500 },
    ];
    const matches: EloReplayMatch[] = [
      { roundNumber: 1, tableNumber: 1, player1Id: "p1", player2Id: null, result: "BYE" },
      { roundNumber: 1, tableNumber: 2, player1Id: "p2", player2Id: "p3", result: "PENDING" },
    ];

    expect(ratingsObject(replayTournamentElo(players, matches))).toEqual({ p1: 1500, p2: 1500, p3: 1500 });
  });

  it("replays matches in deterministic round and table order", () => {
    const players: EloReplayPlayer[] = [
      { id: "p1", startingElo: 1500 },
      { id: "p2", startingElo: 1500 },
      { id: "p3", startingElo: 1500 },
    ];
    const matches: EloReplayMatch[] = [
      { roundNumber: 2, tableNumber: 1, player1Id: "p1", player2Id: "p3", result: "P1_WIN" },
      { roundNumber: 1, tableNumber: 1, player1Id: "p1", player2Id: "p2", result: "P2_WIN" },
    ];

    expect(ratingsObject(replayTournamentElo(players, matches))).toEqual({ p1: 1501, p2: 1516, p3: 1483 });
  });
});
