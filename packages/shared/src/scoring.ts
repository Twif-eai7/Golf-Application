import type { ScoringRule } from "./schemas";
import type { ProximityBand, ShotsTaken } from "./constants";

export type RawShotInput = {
  shotType: string;
  shotsTaken: string;
  proximity?: string | null;
};

export type ScoredShot = RawShotInput & {
  pointsEarned: number;
};

export type ScoredHole = {
  holeNumber: number;
  holeTotal: number;
  shotResults: ScoredShot[];
};

export function pointsForShot(
  rule: ScoringRule,
  shotsTaken: string,
  proximity?: string | null,
): number {
  const base = rule.shots_to_points[shotsTaken] ?? 0;
  const adj =
    proximity && proximity in rule.proximity_adjustment
      ? (rule.proximity_adjustment[proximity] ?? 0)
      : 0;
  return Math.max(0, base + adj);
}

export function scoreHole(
  rule: ScoringRule,
  holeNumber: number,
  shots: RawShotInput[],
): ScoredHole {
  const shotResults = shots.map((shot) => ({
    ...shot,
    pointsEarned: pointsForShot(rule, shot.shotsTaken, shot.proximity),
  }));
  const holeTotal = shotResults.reduce((sum, s) => sum + s.pointsEarned, 0);
  return { holeNumber, holeTotal, shotResults };
}

export function calculateSessionTotals(
  rule: ScoringRule,
  holes: Array<{ holeNumber: number; shotResults: RawShotInput[] }>,
): { holes: ScoredHole[]; sessionTotal: number } {
  const scoredHoles = holes.map((h) =>
    scoreHole(rule, h.holeNumber, h.shotResults),
  );
  const sessionTotal = scoredHoles.reduce((sum, h) => sum + h.holeTotal, 0);
  return { holes: scoredHoles, sessionTotal };
}

export function roundTotals(
  holes: Array<{
    score: number;
    putts?: number | null;
    fairwayHit?: boolean | null;
    greenInReg?: boolean | null;
  }>,
): {
  totalScore: number;
  totalPutts: number;
  fairwaysHit: number;
  greensInReg: number;
} {
  return {
    totalScore: holes.reduce((s, h) => s + h.score, 0),
    totalPutts: holes.reduce((s, h) => s + (h.putts ?? 0), 0),
    fairwaysHit: holes.filter((h) => h.fairwayHit === true).length,
    greensInReg: holes.filter((h) => h.greenInReg === true).length,
  };
}

export type { ShotsTaken, ProximityBand };
