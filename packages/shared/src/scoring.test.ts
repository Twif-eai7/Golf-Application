import { describe, expect, it } from "vitest";
import { DEFAULT_SCORING_RULE } from "./constants";
import {
  calculateSessionTotals,
  pointsForShot,
  roundTotals,
  scoreHole,
} from "./scoring";

describe("pointsForShot", () => {
  it("awards base points for shots taken", () => {
    expect(pointsForShot(DEFAULT_SCORING_RULE, "2")).toBe(3);
    expect(pointsForShot(DEFAULT_SCORING_RULE, "3")).toBe(2);
    expect(pointsForShot(DEFAULT_SCORING_RULE, "4")).toBe(1);
    expect(pointsForShot(DEFAULT_SCORING_RULE, "5+")).toBe(0);
  });

  it("adds proximity adjustment", () => {
    expect(pointsForShot(DEFAULT_SCORING_RULE, "2", "<3ft")).toBe(4);
    expect(pointsForShot(DEFAULT_SCORING_RULE, "3", "3-10ft")).toBe(2);
    expect(pointsForShot(DEFAULT_SCORING_RULE, "4", ">10ft")).toBe(0);
  });

  it("clamps at zero when proximity penalty would go negative", () => {
    expect(pointsForShot(DEFAULT_SCORING_RULE, "5+", ">10ft")).toBe(0);
  });

  it("treats unknown shot keys as zero base", () => {
    expect(pointsForShot(DEFAULT_SCORING_RULE, "1")).toBe(0);
  });
});

describe("scoreHole", () => {
  it("sums four shot types for a short-game hole", () => {
    const hole = scoreHole(DEFAULT_SCORING_RULE, 1, [
      { shotType: "EASY", shotsTaken: "2", proximity: "<3ft" },
      { shotType: "MEDIUM", shotsTaken: "3", proximity: "3-10ft" },
      { shotType: "HARD", shotsTaken: "4", proximity: ">10ft" },
      { shotType: "BUNKER", shotsTaken: "3", proximity: "3-10ft" },
    ]);
    expect(hole.holeTotal).toBe(4 + 2 + 0 + 2);
    expect(hole.shotResults).toHaveLength(4);
  });
});

describe("calculateSessionTotals", () => {
  it("aggregates hole totals into session total", () => {
    const holes = Array.from({ length: 9 }, (_, i) => ({
      holeNumber: i + 1,
      shotResults: [
        { shotType: "EASY", shotsTaken: "2" as const, proximity: "<3ft" as const },
        { shotType: "MEDIUM", shotsTaken: "2" as const, proximity: "<3ft" as const },
        { shotType: "HARD", shotsTaken: "2" as const, proximity: "<3ft" as const },
        { shotType: "BUNKER", shotsTaken: "2" as const, proximity: "<3ft" as const },
      ],
    }));
    const result = calculateSessionTotals(DEFAULT_SCORING_RULE, holes);
    expect(result.sessionTotal).toBe(9 * 16);
    expect(result.holes).toHaveLength(9);
  });
});

describe("roundTotals", () => {
  it("sums score, putts, FIR and GIR", () => {
    const totals = roundTotals([
      { score: 4, putts: 2, fairwayHit: true, greenInReg: true },
      { score: 5, putts: 2, fairwayHit: false, greenInReg: false },
      { score: 3, putts: 1, fairwayHit: true, greenInReg: true },
    ]);
    expect(totals).toEqual({
      totalScore: 12,
      totalPutts: 5,
      fairwaysHit: 2,
      greensInReg: 2,
    });
  });
});
