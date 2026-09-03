import { z } from "zod";
import {
  ACCOUNT_TYPES,
  INVITE_STATUSES,
  OWNER_TYPES,
  PRACTICE_CATEGORIES,
  PROGRESS_METRICS,
  PROXIMITY_BANDS,
  SHOT_TYPES,
  SHOTS_TAKEN,
} from "./constants";

export const scoringRuleSchema = z.object({
  shots_to_points: z.record(z.string(), z.number()),
  proximity_adjustment: z.record(z.string(), z.number()),
});
export type ScoringRule = z.infer<typeof scoringRuleSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

export const userDtoSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  accountType: z.enum(ACCOUNT_TYPES),
  createdAt: z.string(),
});
export type UserDto = z.infer<typeof userDtoSchema>;

export const signupRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1).max(255),
  accountType: z.enum(ACCOUNT_TYPES),
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const authResponseSchema = z.object({
  token: z.string(),
  refreshToken: z.string(),
  user: userDtoSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const playerProfileDtoSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  ownerType: z.enum(OWNER_TYPES),
  claimedByUserId: z.string().uuid().nullable(),
  name: z.string(),
  dateOfBirth: z.string().nullable(),
  handicap: z.number().nullable(),
  photoUrl: z.string().nullable(),
  createdAt: z.string(),
});
export type PlayerProfileDto = z.infer<typeof playerProfileDtoSchema>;

export const createPlayerRequestSchema = z.object({
  name: z.string().min(1).max(255),
  dateOfBirth: z.string().nullable().optional(),
  handicap: z.number().min(-10).max(54).nullable().optional(),
  inviteEmail: z.string().email().optional(),
});
export type CreatePlayerRequest = z.infer<typeof createPlayerRequestSchema>;

export const updatePlayerRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  dateOfBirth: z.string().nullable().optional(),
  handicap: z.number().min(-10).max(54).nullable().optional(),
  photoUrl: z.string().url().nullable().optional(),
});
export type UpdatePlayerRequest = z.infer<typeof updatePlayerRequestSchema>;

export const createInviteRequestSchema = z.object({
  email: z.string().email(),
});
export type CreateInviteRequest = z.infer<typeof createInviteRequestSchema>;

export const invitePreviewDtoSchema = z.object({
  token: z.string(),
  playerName: z.string(),
  coachName: z.string(),
  email: z.string().email(),
  expiresAt: z.string(),
  status: z.enum(INVITE_STATUSES),
});
export type InvitePreviewDto = z.infer<typeof invitePreviewDtoSchema>;

export const claimInviteRequestSchema = z
  .object({
    token: z.string().min(1),
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
    fullName: z.string().min(1).max(255).optional(),
  })
  .refine(
    (v) =>
      Boolean(v.email && v.password && v.fullName) ||
      (!v.email && !v.password && !v.fullName),
    {
      message:
        "Provide email, password, and fullName to sign up, or omit them to claim while logged in",
    },
  );
export type ClaimInviteRequest = z.infer<typeof claimInviteRequestSchema>;

export const roundHoleInputSchema = z.object({
  holeNumber: z.number().int().min(1).max(18),
  par: z.number().int().min(3).max(6).optional(),
  score: z.number().int().min(1).max(20),
  putts: z.number().int().min(0).max(10).nullable().optional(),
  fairwayHit: z.boolean().nullable().optional(),
  greenInReg: z.boolean().nullable().optional(),
  clubUsed: z.string().max(50).nullable().optional(),
  penaltyStrokes: z.number().int().min(0).max(10).optional(),
});
export type RoundHoleInput = z.infer<typeof roundHoleInputSchema>;

export const createRoundRequestSchema = z.object({
  playerProfileId: z.string().uuid(),
  courseName: z.string().max(255).optional(),
  teesPlayed: z.string().max(50).optional(),
  roundDate: z.string(),
  holes: z.array(roundHoleInputSchema).min(1).max(18),
});
export type CreateRoundRequest = z.infer<typeof createRoundRequestSchema>;

export const roundHoleDtoSchema = roundHoleInputSchema.extend({
  id: z.string().uuid(),
  roundId: z.string().uuid(),
  par: z.number().int().nullable().optional(),
  putts: z.number().int().nullable().optional(),
  fairwayHit: z.boolean().nullable().optional(),
  greenInReg: z.boolean().nullable().optional(),
  clubUsed: z.string().nullable().optional(),
  penaltyStrokes: z.number().int().optional(),
});
export type RoundHoleDto = z.infer<typeof roundHoleDtoSchema>;

export const roundDtoSchema = z.object({
  id: z.string().uuid(),
  playerProfileId: z.string().uuid(),
  courseName: z.string().nullable(),
  teesPlayed: z.string().nullable(),
  roundDate: z.string(),
  totalScore: z.number().int().nullable(),
  totalPutts: z.number().int().nullable(),
  fairwaysHit: z.number().int().nullable(),
  greensInReg: z.number().int().nullable(),
  createdAt: z.string(),
  holes: z.array(roundHoleDtoSchema).optional(),
});
export type RoundDto = z.infer<typeof roundDtoSchema>;

export const shotResultInputSchema = z.object({
  shotType: z.enum(SHOT_TYPES),
  shotsTaken: z.enum(SHOTS_TAKEN),
  proximity: z.enum(PROXIMITY_BANDS).optional(),
});
export type ShotResultInput = z.infer<typeof shotResultInputSchema>;

export const sessionHoleInputSchema = z.object({
  holeNumber: z.number().int().min(1).max(18),
  shotResults: z.array(shotResultInputSchema).min(1),
});
export type SessionHoleInput = z.infer<typeof sessionHoleInputSchema>;

export const createPracticeSessionRequestSchema = z.object({
  playerProfileId: z.string().uuid(),
  drillTemplateId: z.string().uuid().nullable().optional(),
  sessionDate: z.string(),
  durationMinutes: z.number().int().positive().optional(),
  category: z.enum(PRACTICE_CATEGORIES).optional(),
  notes: z.string().max(2000).optional(),
  holes: z.array(sessionHoleInputSchema).min(1),
});
export type CreatePracticeSessionRequest = z.infer<
  typeof createPracticeSessionRequestSchema
>;

export const sessionShotResultDtoSchema = z.object({
  id: z.string().uuid(),
  sessionHoleEntryId: z.string().uuid(),
  shotType: z.enum(SHOT_TYPES),
  shotsTaken: z.enum(SHOTS_TAKEN),
  proximity: z.enum(PROXIMITY_BANDS).nullable(),
  pointsEarned: z.number(),
});
export type SessionShotResultDto = z.infer<typeof sessionShotResultDtoSchema>;

export const sessionHoleEntryDtoSchema = z.object({
  id: z.string().uuid(),
  practiceSessionId: z.string().uuid(),
  holeNumber: z.number().int(),
  holeTotal: z.number(),
  shotResults: z.array(sessionShotResultDtoSchema),
});
export type SessionHoleEntryDto = z.infer<typeof sessionHoleEntryDtoSchema>;

export const practiceSessionDtoSchema = z.object({
  id: z.string().uuid(),
  playerProfileId: z.string().uuid(),
  drillTemplateId: z.string().uuid().nullable(),
  sessionDate: z.string(),
  durationMinutes: z.number().int().nullable(),
  category: z.enum(PRACTICE_CATEGORIES).nullable(),
  notes: z.string().nullable(),
  sessionTotal: z.number(),
  createdAt: z.string(),
  holes: z.array(sessionHoleEntryDtoSchema).optional(),
});
export type PracticeSessionDto = z.infer<typeof practiceSessionDtoSchema>;

export const drillTemplateDtoSchema = z.object({
  id: z.string().uuid(),
  createdByUserId: z.string().uuid().nullable(),
  name: z.string(),
  holesCount: z.number().int(),
  shotTypes: z.array(z.enum(SHOT_TYPES)),
  scoringRule: scoringRuleSchema,
  isSystemDefault: z.boolean(),
  createdAt: z.string(),
});
export type DrillTemplateDto = z.infer<typeof drillTemplateDtoSchema>;

export const progressSummaryDtoSchema = z.object({
  scoringAvg: z.number().nullable(),
  scoringAvgDelta: z.number().nullable(),
  drillAvg: z.number().nullable(),
  drillAvgDelta: z.number().nullable(),
  puttsAvg: z.number().nullable(),
  puttsAvgDelta: z.number().nullable().optional(),
  firPct: z.number().nullable(),
  girPct: z.number().nullable(),
  streak: z.number().optional(),
  lastRound: roundDtoSchema.nullable(),
  lastSession: practiceSessionDtoSchema.nullable(),
  recentRounds: z.array(roundDtoSchema).optional(),
  recentSessions: z.array(practiceSessionDtoSchema).optional(),
});
export type ProgressSummaryDto = z.infer<typeof progressSummaryDtoSchema>;

export const trendPointSchema = z.object({
  label: z.string(),
  value: z.number(),
});
export type TrendPoint = z.infer<typeof trendPointSchema>;

export const progressTrendDtoSchema = z.object({
  metric: z.enum(PROGRESS_METRICS),
  range: z.string(),
  points: z.array(trendPointSchema),
});
export type ProgressTrendDto = z.infer<typeof progressTrendDtoSchema>;

export const jwtPayloadSchema = z.object({
  sub: z.string().uuid(),
  accountType: z.enum(ACCOUNT_TYPES),
  email: z.string().email(),
});
export type JwtPayload = z.infer<typeof jwtPayloadSchema>;
