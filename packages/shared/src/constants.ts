export const ACCOUNT_TYPES = ["INDIVIDUAL_PLAYER", "COACH"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const OWNER_TYPES = ["SELF", "COACH"] as const;
export type OwnerType = (typeof OWNER_TYPES)[number];

export const SHOT_TYPES = ["EASY", "MEDIUM", "HARD", "BUNKER"] as const;
export type ShotType = (typeof SHOT_TYPES)[number];

export const SHOTS_TAKEN = ["2", "3", "4", "5+"] as const;
export type ShotsTaken = (typeof SHOTS_TAKEN)[number];

export const PROXIMITY_BANDS = ["<3ft", "3-10ft", ">10ft"] as const;
export type ProximityBand = (typeof PROXIMITY_BANDS)[number];

export const PRACTICE_CATEGORIES = [
  "DRIVING",
  "IRONS",
  "SHORT_GAME",
  "PUTTING",
  "BUNKER",
] as const;
export type PracticeCategory = (typeof PRACTICE_CATEGORIES)[number];

export const INVITE_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "EXPIRED",
  "REVOKED",
] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

export const PROGRESS_METRICS = [
  "SCORING_AVG",
  "SHORT_GAME_DRILL",
  "PUTTS_AVG",
  "FIR",
  "GIR",
] as const;
export type ProgressMetric = (typeof PROGRESS_METRICS)[number];

export const DEFAULT_SCORING_RULE = {
  shots_to_points: { "2": 3, "3": 2, "4": 1, "5+": 0 },
  proximity_adjustment: { "<3ft": 1, "3-10ft": 0, ">10ft": -1 },
} as const;

export const SHORT_GAME_DRILL_NAME = "9-Hole Short Game Practice";
export const DEFAULT_DRILL_HOLES = 9;
export const DEFAULT_DRILL_TEMPLATE_ID =
  "a0000000-0000-4000-8000-000000000001";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const INVITE_TTL_DAYS = 14;
