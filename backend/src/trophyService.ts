import { usesTeamDraftMode } from './teamService';

type TrophyEvaluationInput = {
  tournamentStatus: string;
  teamMode?: string | null;
  individualRank?: number | null;
  teamRank?: number | null;
};

export function getTeamRankFromMembership(teamMembership: any): number | null {
  const standing = teamMembership?.team?.standings?.[0];
  return typeof standing?.rank === 'number' ? standing.rank : null;
}

export function evaluateTrophyOutcome({
  tournamentStatus,
  teamMode,
  individualRank,
  teamRank,
}: TrophyEvaluationInput) {
  if (tournamentStatus !== 'FINISHED') {
    return { regularTrophy: false, teamDraftTrophy: false };
  }

  if (usesTeamDraftMode(teamMode ?? 'NONE')) {
    return {
      regularTrophy: false,
      teamDraftTrophy: teamRank === 1,
    };
  }

  return {
    regularTrophy: individualRank === 1,
    teamDraftTrophy: false,
  };
}
