export type TournamentFormat =
  | 'Draft'
  | 'Sealed'
  | 'Cube'
  | 'Standard'
  | 'Pioneer'
  | 'Modern'
  | 'Legacy'
  | 'Vintage'
  | 'Pauper'
  | 'Commander';

export const MIN_TOURNAMENT_PLAYERS = 2;
export const MAX_TOURNAMENT_PLAYERS = 64;

export function usesDraftPodSeating(format: string) {
  return format === 'Cube' || format === 'Draft';
}

export function validateTournamentPlayerCount(_format: string, playerCount: number) {
  if (!Number.isInteger(playerCount) || playerCount < 0) {
    throw new Error('Player count must be a non-negative integer');
  }

  if (playerCount < MIN_TOURNAMENT_PLAYERS) {
    throw new Error(`Need at least ${MIN_TOURNAMENT_PLAYERS} players`);
  }

  if (playerCount > MAX_TOURNAMENT_PLAYERS) {
    throw new Error(`Tournament capacity is ${MAX_TOURNAMENT_PLAYERS} players`);
  }
}

export function ensureTournamentHasCapacity(_format: string, activePlayerCount: number) {
  if (activePlayerCount >= MAX_TOURNAMENT_PLAYERS) {
    throw new Error(`Tournament capacity is ${MAX_TOURNAMENT_PLAYERS} players`);
  }
}
