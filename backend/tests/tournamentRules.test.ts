import { describe, expect, it } from 'vitest';
import {
  MAX_TOURNAMENT_PLAYERS,
  ensureTournamentHasCapacity,
  validateTournamentPlayerCount,
} from '../src/tournamentRules';

describe('tournamentRules', () => {
  it('applies the room cap uniformly to real tournaments', () => {
    expect(() => validateTournamentPlayerCount('Draft', 2)).not.toThrow();
    expect(() => validateTournamentPlayerCount('Cube', 5)).not.toThrow();
    expect(() => validateTournamentPlayerCount('Commander', MAX_TOURNAMENT_PLAYERS)).not.toThrow();
    expect(() => validateTournamentPlayerCount('Modern', 500)).toThrow(/Tournament capacity is/);
  });

  it('blocks additional registrations once room capacity is reached', () => {
    expect(() => ensureTournamentHasCapacity('Draft', MAX_TOURNAMENT_PLAYERS)).toThrow(
      /capacity is/,
    );
    expect(() => ensureTournamentHasCapacity('Modern', MAX_TOURNAMENT_PLAYERS)).toThrow(
      /capacity is/,
    );
  });
});
