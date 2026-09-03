import { describe, expect, it } from "vitest";
import {
  calculateSessionTotals,
  DEFAULT_SCORING_RULE,
  signupRequestSchema,
} from "@fairwaylog/shared";

describe("API contract helpers", () => {
  it("rejects short passwords on signup schema", () => {
    expect(() =>
      signupRequestSchema.parse({
        email: "a@b.co",
        password: "short",
        fullName: "A",
        accountType: "COACH",
      }),
    ).toThrow(/at least 8/);
  });

  it("server-side scoring matches the short-game key", () => {
    const { sessionTotal, holes } = calculateSessionTotals(DEFAULT_SCORING_RULE, [
      {
        holeNumber: 1,
        shotResults: [
          { shotType: "EASY", shotsTaken: "2", proximity: "<3ft" },
          { shotType: "MEDIUM", shotsTaken: "3", proximity: "3-10ft" },
          { shotType: "HARD", shotsTaken: "4", proximity: ">10ft" },
          { shotType: "BUNKER", shotsTaken: "3", proximity: "3-10ft" },
        ],
      },
    ]);
    expect(holes[0]?.holeTotal).toBe(8);
    expect(sessionTotal).toBe(8);
  });
});
