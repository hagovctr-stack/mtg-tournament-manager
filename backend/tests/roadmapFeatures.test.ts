import { describe, expect, it } from 'vitest';
import { normalizeLeagueWindow } from '../src/leagueService';
import { canEditTournamentResults, validateTournamentPlanUpdate } from '../src/tournamentService';


describe('validateTournamentPlanUpdate', () => {
  it('allows increasing the total rounds while a tournament is active', () => {
    expect(() =>
      validateTournamentPlanUpdate({ status: 'ACTIVE', totalRounds: 3, currentRound: 3 }, 3, 4),
    ).not.toThrow();
  });

  it('rejects decreasing below already created rounds', () => {
    expect(() =>
      validateTournamentPlanUpdate({ status: 'ACTIVE', totalRounds: 4, currentRound: 3 }, 3, 2),
    ).toThrow(/Cannot reduce rounds below the rounds already created/);
  });

  it('rejects editing rounds after tournament finalization', () => {
    expect(() =>
      validateTournamentPlanUpdate({ status: 'FINISHED', totalRounds: 4, currentRound: 4 }, 4, 5),
    ).toThrow(/Cannot edit rounds after tournament finalization/);
  });
});

describe('normalizeLeagueWindow', () => {
  it('normalizes the date range to start and end of day boundaries', () => {
    const window = normalizeLeagueWindow('2026-01-10', '2026-03-31');

    expect(window.startsAt.getHours()).toBe(0);
    expect(window.startsAt.getMinutes()).toBe(0);
    expect(window.startsAt.getSeconds()).toBe(0);
    expect(window.endsAt.getHours()).toBe(23);
    expect(window.endsAt.getMinutes()).toBe(59);
    expect(window.endsAt.getSeconds()).toBe(59);
  });

  it('rejects an inverted date window', () => {
    expect(() => normalizeLeagueWindow('2026-04-10', '2026-04-01')).toThrow(
      /League start date must be on or before the end date/,
    );
  });
});


describe('canEditTournamentResults', () => {
  it('allows corrections while a tournament is active or finished', () => {
    expect(canEditTournamentResults('ACTIVE')).toBe(true);
    expect(canEditTournamentResults('FINISHED')).toBe(true);
  });

  it('rejects result edits before the tournament starts', () => {
    expect(canEditTournamentResults('REGISTRATION')).toBe(false);
  });
});
