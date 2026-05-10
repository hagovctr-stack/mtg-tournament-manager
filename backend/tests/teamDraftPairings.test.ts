import { describe, expect, it } from 'vitest';
import { buildTeamRoundPairingsForRound } from '../src/teamService';

describe('buildTeamRoundPairingsForRound', () => {
  const left = [
    { tournamentPlayerId: 'a1' },
    { tournamentPlayerId: 'a2' },
    { tournamentPlayerId: 'a3' },
  ];
  const right = [
    { tournamentPlayerId: 'b1' },
    { tournamentPlayerId: 'b2' },
    { tournamentPlayerId: 'b3' },
  ];

  it('uses straight board pairings in round 1', () => {
    expect(buildTeamRoundPairingsForRound(left, right, 1)).toEqual([
      { player1Id: 'a1', player2Id: 'b1', tableNumber: 1, isBye: false },
      { player1Id: 'a2', player2Id: 'b2', tableNumber: 2, isBye: false },
      { player1Id: 'a3', player2Id: 'b3', tableNumber: 3, isBye: false },
    ]);
  });

  it('rotates opponents in round 2', () => {
    expect(buildTeamRoundPairingsForRound(left, right, 2)).toEqual([
      { player1Id: 'a1', player2Id: 'b2', tableNumber: 1, isBye: false },
      { player1Id: 'a2', player2Id: 'b3', tableNumber: 2, isBye: false },
      { player1Id: 'a3', player2Id: 'b1', tableNumber: 3, isBye: false },
    ]);
  });

  it('rotates opponents in round 3', () => {
    expect(buildTeamRoundPairingsForRound(left, right, 3)).toEqual([
      { player1Id: 'a1', player2Id: 'b3', tableNumber: 1, isBye: false },
      { player1Id: 'a2', player2Id: 'b1', tableNumber: 2, isBye: false },
      { player1Id: 'a3', player2Id: 'b2', tableNumber: 3, isBye: false },
    ]);
  });
});
