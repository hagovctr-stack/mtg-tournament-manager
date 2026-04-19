import { describe, it, expect } from 'vitest';
import {
  calculateTiebreakers,
  generatePairings,
  generateSeatPairings,
  recommendedRounds,
  type PlayerState,
} from '../src/pairingAlgorithm';

function makePlayer(
  id: string,
  matchPoints = 0,
  opponents: string[] = [],
  hadBye = false,
): PlayerState {
  return {
    id,
    name: `Player ${id}`,
    matchPoints,
    matchWins: Math.floor(matchPoints / 3),
    matchLosses: 0,
    matchDraws: matchPoints % 3 === 1 ? 1 : 0,
    opponents,
    floatHistory: [],
    hadBye,
    tiebreaker1: 0,
    tiebreaker2: 0,
    tiebreaker3: 0,
  };
}

function makePlayers(count: number, points = 0): PlayerState[] {
  return Array.from({ length: count }, (_, i) => makePlayer(String(i + 1), points));
}

describe('generateSeatPairings', () => {
  it('pairs opposite seats for 8-player pods', () => {
    const { pairings, byePlayerId } = generateSeatPairings([
      { id: '1', seatNumber: 1 },
      { id: '2', seatNumber: 2 },
      { id: '3', seatNumber: 3 },
      { id: '4', seatNumber: 4 },
      { id: '5', seatNumber: 5 },
      { id: '6', seatNumber: 6 },
      { id: '7', seatNumber: 7 },
      { id: '8', seatNumber: 8 },
    ]);

    expect(byePlayerId).toBeNull();
    expect(pairings).toEqual([
      { player1Id: '1', player2Id: '5', tableNumber: 1, isBye: false },
      { player1Id: '2', player2Id: '6', tableNumber: 2, isBye: false },
      { player1Id: '3', player2Id: '7', tableNumber: 3, isBye: false },
      { player1Id: '4', player2Id: '8', tableNumber: 4, isBye: false },
    ]);
  });

  it('gives the highest seat a bye for odd pods', () => {
    const { pairings, byePlayerId } = generateSeatPairings([
      { id: '1', seatNumber: 1 },
      { id: '2', seatNumber: 2 },
      { id: '3', seatNumber: 3 },
      { id: '4', seatNumber: 4 },
      { id: '5', seatNumber: 5 },
      { id: '6', seatNumber: 6 },
      { id: '7', seatNumber: 7 },
    ]);

    expect(byePlayerId).toBe('7');
    expect(pairings).toEqual([
      { player1Id: '1', player2Id: '4', tableNumber: 1, isBye: false },
      { player1Id: '2', player2Id: '5', tableNumber: 2, isBye: false },
      { player1Id: '3', player2Id: '6', tableNumber: 3, isBye: false },
      { player1Id: '7', player2Id: null, tableNumber: 4, isBye: true },
    ]);
  });
});

describe('generatePairings', () => {
  it('produces correct number of pairings for even player count', () => {
    const { pairings } = generatePairings(makePlayers(8));
    expect(pairings).toHaveLength(4);
  });

  it('produces correct number of pairings for odd player count', () => {
    const { pairings, byePlayerId } = generatePairings(makePlayers(7));
    expect(pairings).toHaveLength(4);
    expect(byePlayerId).not.toBeNull();
  });

  it('assigns BYE only to player who has not had one', () => {
    const players = [makePlayer('1', 3, [], true), makePlayer('2', 0, []), makePlayer('3', 0, [])];
    const { byePlayerId } = generatePairings(players);
    expect(byePlayerId).not.toBe('1');
  });

  it('avoids rematches when possible', () => {
    const players = [
      makePlayer('1', 3, ['2']),
      makePlayer('2', 3, ['1']),
      makePlayer('3', 3, []),
      makePlayer('4', 3, []),
    ];
    const { pairings } = generatePairings(players);
    for (const p of pairings.filter((p) => !p.isBye)) {
      const p1 = players.find((pl) => pl.id === p.player1Id)!;
      expect(p1.opponents.includes(p.player2Id!)).toBe(false);
    }
  });
  it('does not rematch round-1 draw pairs in round 2 for a 6-player event', () => {
    const players: PlayerState[] = [
      makePlayer('a', 3, ['b']),
      makePlayer('b', 3, ['a']),
      makePlayer('c', 1, ['d']),
      makePlayer('d', 1, ['c']),
      makePlayer('e', 0, ['f']),
      makePlayer('f', 0, ['e']),
    ];

    const forbiddenPairs = new Set(['a-b', 'b-a', 'c-d', 'd-c', 'e-f', 'f-e']);
    const { pairings } = generatePairings(players);

    expect(pairings).toHaveLength(3);
    for (const pairing of pairings) {
      if (pairing.isBye) continue;
      expect(forbiddenPairs.has(`${pairing.player1Id}-${pairing.player2Id}`)).toBe(false);
    }
  });

  it('no player appears twice in pairings', () => {
    const players = makePlayers(32, 3);
    const { pairings } = generatePairings(players);
    const ids = pairings.flatMap((p) => (p.isBye ? [p.player1Id] : [p.player1Id, p.player2Id!]));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('generates deterministic output', () => {
    const players = makePlayers(16, 6);
    const r1 = generatePairings(players);
    const r2 = generatePairings(players);
    expect(r1.pairings.map((p) => p.player1Id)).toEqual(r2.pairings.map((p) => p.player1Id));
  });

  it('scales to 256 players within 2 seconds', () => {
    const players = makePlayers(256, 0);
    const start = Date.now();
    generatePairings(players);
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('handles complex late-round opponent history', () => {
    const players: PlayerState[] = [
      makePlayer('1', 12, ['2', '3', '4', '5']),
      makePlayer('2', 12, ['1', '3', '4', '5']),
      makePlayer('3', 9, ['1', '2', '4']),
      makePlayer('4', 9, ['1', '2', '3']),
      makePlayer('5', 6, ['1', '2']),
      makePlayer('6', 6, []),
      makePlayer('7', 3, []),
      makePlayer('8', 3, []),
    ];
    const { pairings } = generatePairings(players);
    expect(pairings).toHaveLength(4);
    const ids = pairings.flatMap((p) => (p.isBye ? [p.player1Id] : [p.player1Id, p.player2Id!]));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('recommendedRounds', () => {
  it.each([
    [8, 3],
    [16, 4],
    [32, 5],
    [64, 6],
    [128, 7],
    [256, 9],
  ])('%i players → %i rounds', (players, rounds) => {
    expect(recommendedRounds(players)).toBe(rounds);
  });
});

describe('calculateTiebreakers', () => {
  it('uses exact one-third floors for opponents percentages', () => {
    const players: PlayerState[] = [makePlayer('1', 0, ['2']), makePlayer('2', 0, ['1'])];
    const matches = [
      { playerId: '1', opponentId: '2', playerWins: 0, opponentWins: 2, draws: 0, isBye: false },
      { playerId: '2', opponentId: '1', playerWins: 2, opponentWins: 0, draws: 0, isBye: false },
    ];

    const tb = calculateTiebreakers(players, matches);

    expect(tb.get('1')!.omw).toBe(1);
    expect(tb.get('1')!.ogw).toBe(1);
    expect(tb.get('2')!.omw).toBe(1 / 3);
    expect(tb.get('1')!.gw).toBe(1 / 3);
    expect(tb.get('2')!.gw).toBe(1);
    expect(tb.get('2')!.ogw).toBe(1 / 3);
  });

  it('computes game-win percentage from game points, not raw game wins', () => {
    const players: PlayerState[] = [makePlayer('1', 1, ['2']), makePlayer('2', 1, ['1'])];
    const matches = [
      { playerId: '1', opponentId: '2', playerWins: 1, opponentWins: 1, draws: 0, isBye: false },
      { playerId: '2', opponentId: '1', playerWins: 1, opponentWins: 1, draws: 0, isBye: false },
    ];

    const tb = calculateTiebreakers(players, matches);

    expect(tb.get('1')!.gw).toBe(0.5);
    expect(tb.get('2')!.gw).toBe(0.5);
  });

  it("includes byes in a player's own percentages but excludes them from opponents averages", () => {
    const players: PlayerState[] = [makePlayer('1', 3, ['BYE']), makePlayer('2', 0, [])];
    const matches = [
      { playerId: '1', opponentId: null, playerWins: 2, opponentWins: 0, draws: 0, isBye: true },
    ];

    const tb = calculateTiebreakers(players, matches);

    expect(tb.get('1')!.gw).toBe(1);
    expect(tb.get('1')!.omw).toBe(0);
    expect(tb.get('1')!.ogw).toBe(0);
  });

  it('calculates official-style OMW and OGW for a 3-player round robin', () => {
    const players: PlayerState[] = [
      makePlayer('1', 9, ['2', '3']),
      makePlayer('2', 6, ['1', '3']),
      makePlayer('3', 3, ['1', '2']),
    ];
    const matches = [
      { playerId: '1', opponentId: '2', playerWins: 2, opponentWins: 0, draws: 0, isBye: false },
      { playerId: '2', opponentId: '1', playerWins: 0, opponentWins: 2, draws: 0, isBye: false },
      { playerId: '1', opponentId: '3', playerWins: 2, opponentWins: 1, draws: 0, isBye: false },
      { playerId: '3', opponentId: '1', playerWins: 1, opponentWins: 2, draws: 0, isBye: false },
      { playerId: '2', opponentId: '3', playerWins: 2, opponentWins: 0, draws: 0, isBye: false },
      { playerId: '3', opponentId: '2', playerWins: 0, opponentWins: 2, draws: 0, isBye: false },
    ];

    const tb = calculateTiebreakers(players, matches);

    expect(tb.get('1')!.omw).toBeCloseTo((1 / 2 + 1 / 3) / 2, 10);
    expect(tb.get('1')!.gw).toBeCloseTo(12 / 15, 10);
    expect(tb.get('1')!.ogw).toBeCloseTo((1 / 2 + 1 / 3) / 2, 10);
    expect(tb.get('3')!.omw).toBeCloseTo((1 + 1 / 2) / 2, 10);
  });
});
