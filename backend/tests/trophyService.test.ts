import { describe, expect, it } from 'vitest';
import { evaluateTrophyOutcome, getTeamRankFromMembership } from '../src/trophyService';

describe('evaluateTrophyOutcome', () => {
  it('awards a regular trophy to the first-place finisher in non-team tournaments', () => {
    expect(
      evaluateTrophyOutcome({
        tournamentStatus: 'FINISHED',
        teamMode: 'NONE',
        individualRank: 1,
        teamRank: null,
      }),
    ).toEqual({
      regularTrophy: true,
      teamDraftTrophy: false,
    });
  });

  it('awards a team draft trophy to every player on the winning team', () => {
    expect(
      evaluateTrophyOutcome({
        tournamentStatus: 'FINISHED',
        teamMode: 'TEAM_DRAFT_3V3',
        individualRank: 3,
        teamRank: 1,
      }),
    ).toEqual({
      regularTrophy: false,
      teamDraftTrophy: true,
    });
  });

  it('does not leak individual first-place finishes into team draft trophies', () => {
    expect(
      evaluateTrophyOutcome({
        tournamentStatus: 'FINISHED',
        teamMode: 'TEAM_DRAFT_3V3',
        individualRank: 1,
        teamRank: 2,
      }),
    ).toEqual({
      regularTrophy: false,
      teamDraftTrophy: false,
    });
  });

  it('does not award trophies before the tournament finishes', () => {
    expect(
      evaluateTrophyOutcome({
        tournamentStatus: 'ACTIVE',
        teamMode: 'TEAM_DRAFT_3V3',
        individualRank: 1,
        teamRank: 1,
      }),
    ).toEqual({
      regularTrophy: false,
      teamDraftTrophy: false,
    });
  });
});

describe('getTeamRankFromMembership', () => {
  it('returns the related team standing rank when present', () => {
    expect(
      getTeamRankFromMembership({
        team: {
          standings: [{ rank: 1 }],
        },
      }),
    ).toBe(1);
  });

  it('returns null when no team standing is loaded', () => {
    expect(getTeamRankFromMembership(null)).toBeNull();
    expect(getTeamRankFromMembership({ team: { standings: [] } })).toBeNull();
  });
});
