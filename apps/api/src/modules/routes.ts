import { Router } from "express";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import {
  createPracticeSessionRequestSchema,
  createRoundRequestSchema,
  calculateSessionTotals,
  DEFAULT_SCORING_RULE,
  INVITE_TTL_DAYS,
  roundTotals,
  type ScoringRule,
} from "@fairwaylog/shared";
import { prisma } from "../lib/prisma.js";
import { listAccessibleProfiles, requireProfileAccess, toPlayerDto } from "../lib/access.js";
import {
  ApiError,
  authRequired,
  optionalAuth,
  sendError,
  toUserDto,
  type AuthedRequest,
} from "../lib/http.js";
import { issueTokenPair, login, logout, refresh, signup } from "./auth.service.js";
import { hashToken, newId, parseDateOnly, toDateOnly } from "../lib/crypto.js";

export const apiRouter = Router();

function isZodError(err: unknown): err is { issues: Array<{ message: string }> } {
  return Boolean(
    err &&
      typeof err === "object" &&
      (err as { name?: string }).name === "ZodError" &&
      Array.isArray((err as { issues?: unknown }).issues),
  );
}

function catchAsync(fn: (req: AuthedRequest, res: import("express").Response) => Promise<void>) {
  return (req: AuthedRequest, res: import("express").Response, next: import("express").NextFunction) => {
    fn(req, res).catch((err) => {
      if (isZodError(err)) {
        sendError(res, 400, "VALIDATION_ERROR", err.issues[0]?.message ?? "Invalid body");
        return;
      }
      next(err);
    });
  };
}

// Lazy Supabase admin client — only created when sync endpoint is called
let _supabaseAdmin: ReturnType<typeof createClient> | null = null;
function getSupabaseAdmin() {
  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    throw new ApiError(500, "CONFIG_ERROR", "Supabase is not configured on the server");
  }
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _supabaseAdmin;
}

apiRouter.post("/auth/signup", catchAsync(async (req, res) => {
  const result = await signup(req.body);
  res.status(201).json(result);
}));

apiRouter.post("/auth/login", catchAsync(async (req, res) => {
  res.json(await login(req.body));
}));

apiRouter.post("/auth/refresh", catchAsync(async (req, res) => {
  res.json(await refresh(req.body));
}));

// Supabase auth sync — called after Supabase login/signup to exchange
// Supabase JWT for our internal JWT + user record.
// Uses the Admin SDK so it works with any JWT algorithm (ECC P-256, HS256, etc.)
apiRouter.post("/auth/sync", catchAsync(async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    sendError(res, 401, "UNAUTHORIZED", "Missing bearer token");
    return;
  }
  const supabaseToken = header.slice(7);

  // Verify the Supabase JWT via Admin SDK (algorithm-agnostic)
  const { data: { user: sbUser }, error: sbError } = await getSupabaseAdmin().auth.getUser(supabaseToken);
  if (sbError || !sbUser) {
    sendError(res, 401, "UNAUTHORIZED", "Invalid or expired Supabase token");
    return;
  }

  const { accountType, fullName } = req.body as { accountType?: string; fullName?: string };
  const resolvedType = (accountType === "COACH" ? "COACH" : "INDIVIDUAL_PLAYER") as import("@prisma/client").AccountType;
  const resolvedName =
    fullName ??
    (sbUser.user_metadata as Record<string, string> | undefined)?.full_name ??
    sbUser.email?.split("@")[0] ??
    "Player";

  const email = (sbUser.email ?? "").toLowerCase() || `${sbUser.id}@users.noreply`;

  let foundUser = await prisma.user.findFirst({
    where: { OR: [{ supabaseId: sbUser.id }, { email }] },
  });

  if (!foundUser) {
    foundUser = await prisma.user.create({
      data: {
        id: newId(),
        supabaseId: sbUser.id,
        email,
        fullName: resolvedName,
        accountType: resolvedType,
        // Empty string satisfies older DBs where password_hash is still NOT NULL
        passwordHash: "",
      },
    });
  } else if (!foundUser.supabaseId) {
    foundUser = await prisma.user.update({
      where: { id: foundUser.id },
      data: { supabaseId: sbUser.id, fullName: foundUser.fullName || resolvedName },
    });
  }

  if (foundUser.accountType === "INDIVIDUAL_PLAYER") {
    const existingProfile = await prisma.playerProfile.findFirst({
      where: { ownerUserId: foundUser.id },
    });
    if (!existingProfile) {
      await prisma.playerProfile.create({
        data: {
          id: newId(),
          ownerUserId: foundUser.id,
          ownerType: "SELF",
          claimedByUserId: foundUser.id,
          name: foundUser.fullName || resolvedName,
        },
      });
    }
  }

  const tokenPair = await issueTokenPair(foundUser);
  res.json(tokenPair);
}));

apiRouter.post("/auth/logout", authRequired, catchAsync(async (req, res) => {
  await logout(req.user!.sub, req.body?.refreshToken);
  res.status(204).send();
}));

apiRouter.get("/auth/me", authRequired, catchAsync(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) throw new ApiError(404, "NOT_FOUND", "User not found");
  res.json(toUserDto(user));
}));

apiRouter.get("/players", authRequired, catchAsync(async (req, res) => {
  const profiles = await listAccessibleProfiles(req.user!);
  res.json(profiles.map(toPlayerDto));
}));

apiRouter.post("/players", authRequired, catchAsync(async (req, res) => {
  if (req.user!.accountType !== "COACH") {
    throw new ApiError(403, "FORBIDDEN", "Only coaches can create additional profiles");
  }
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) throw new ApiError(400, "VALIDATION_ERROR", "name is required");
  const inviteEmail =
    typeof req.body?.inviteEmail === "string" ? req.body.inviteEmail.toLowerCase() : undefined;

  const result = await prisma.$transaction(async (tx) => {
    const profile = await tx.playerProfile.create({
      data: {
        ownerUserId: req.user!.sub,
        ownerType: "COACH",
        name,
        dateOfBirth: req.body.dateOfBirth ? parseDateOnly(req.body.dateOfBirth) : null,
        handicap: req.body.handicap ?? null,
      },
    });
    await tx.coachPlayerLink.create({
      data: { coachUserId: req.user!.sub, playerProfileId: profile.id },
    });
    let inviteToken: string | null = null;
    if (inviteEmail) {
      inviteToken = newId();
      await tx.profileInvite.create({
        data: {
          playerProfileId: profile.id,
          coachUserId: req.user!.sub,
          email: inviteEmail,
          tokenHash: hashToken(inviteToken),
          expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86400000),
        },
      });
    }
    return { profile, inviteToken };
  });
  res.status(201).json({ ...toPlayerDto(result.profile), inviteToken: result.inviteToken });
}));

apiRouter.get("/players/:id", authRequired, catchAsync(async (req, res) => {
  const profile = await requireProfileAccess(req.user!, req.params.id);
  res.json(toPlayerDto(profile));
}));

apiRouter.put("/players/:id", authRequired, catchAsync(async (req, res) => {
  await requireProfileAccess(req.user!, req.params.id);
  const profile = await prisma.playerProfile.update({
    where: { id: req.params.id },
    data: {
      name: req.body.name,
      dateOfBirth:
        req.body.dateOfBirth === undefined
          ? undefined
          : req.body.dateOfBirth
            ? parseDateOnly(req.body.dateOfBirth)
            : null,
      handicap: req.body.handicap === undefined ? undefined : req.body.handicap,
      photoUrl: req.body.photoUrl === undefined ? undefined : req.body.photoUrl,
    },
  });
  res.json(toPlayerDto(profile));
}));

apiRouter.post("/players/:id/invites", authRequired, catchAsync(async (req, res) => {
  if (req.user!.accountType !== "COACH") {
    throw new ApiError(403, "FORBIDDEN", "Only coaches can invite players");
  }
  const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase() : "";
  if (!email) throw new ApiError(400, "VALIDATION_ERROR", "email is required");
  const profile = await requireProfileAccess(req.user!, req.params.id);
  if (profile.claimedByUserId) {
    throw new ApiError(409, "ALREADY_CLAIMED", "This profile is already claimed");
  }
  await prisma.profileInvite.updateMany({
    where: { playerProfileId: profile.id, status: "PENDING" },
    data: { status: "REVOKED" },
  });
  const token = newId();
  const invite = await prisma.profileInvite.create({
    data: {
      playerProfileId: profile.id,
      coachUserId: req.user!.sub,
      email,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86400000),
    },
  });
  const coach = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  res.status(201).json({
    token,
    playerName: profile.name,
    coachName: coach?.fullName ?? "",
    email: invite.email,
    expiresAt: invite.expiresAt.toISOString(),
    status: invite.status,
  });
}));

apiRouter.get("/invites/:token", catchAsync(async (req, res) => {
  const invite = await prisma.profileInvite.findFirst({
    where: { tokenHash: hashToken(req.params.token) },
    include: { profile: true, coach: true },
  });
  if (!invite) throw new ApiError(404, "NOT_FOUND", "Invite not found");
  let status = invite.status;
  if (status === "PENDING" && invite.expiresAt < new Date()) {
    status = "EXPIRED";
    await prisma.profileInvite.update({
      where: { id: invite.id },
      data: { status: "EXPIRED" },
    });
  }
  res.json({
    token: req.params.token,
    playerName: invite.profile.name,
    coachName: invite.coach.fullName,
    email: invite.email,
    expiresAt: invite.expiresAt.toISOString(),
    status,
  });
}));

apiRouter.post("/invites/claim", optionalAuth, catchAsync(async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  if (!token) throw new ApiError(400, "VALIDATION_ERROR", "token is required");
  const invite = await prisma.profileInvite.findFirst({
    where: { tokenHash: hashToken(token) },
    include: { profile: true },
  });
  if (!invite) throw new ApiError(404, "NOT_FOUND", "Invite not found");
  if (invite.status !== "PENDING" || invite.expiresAt < new Date()) {
    throw new ApiError(409, "INVITE_INVALID", "Invite is no longer valid");
  }
  if (invite.profile.claimedByUserId) {
    throw new ApiError(409, "ALREADY_CLAIMED", "Profile already claimed");
  }

  let user = req.user
    ? await prisma.user.findUnique({ where: { id: req.user.sub } })
    : null;
  if (!user) {
    const email = typeof req.body.email === "string" ? req.body.email.toLowerCase() : "";
    const password = req.body.password as string | undefined;
    const fullName = req.body.fullName as string | undefined;
    if (!email || !password || !fullName) {
      throw new ApiError(400, "VALIDATION_ERROR", "email, password, and fullName are required to claim");
    }
    const taken = await prisma.user.findUnique({ where: { email } });
    if (taken) throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists");
    user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 12),
        fullName,
        accountType: "INDIVIDUAL_PLAYER",
      },
    });
  }
  if (user.accountType !== "INDIVIDUAL_PLAYER") {
    throw new ApiError(403, "FORBIDDEN", "Only player accounts can claim a profile");
  }

  await prisma.$transaction([
    prisma.playerProfile.update({
      where: { id: invite.playerProfileId },
      data: { claimedByUserId: user.id },
    }),
    prisma.profileInvite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    }),
  ]);
  res.json(await issueTokenPair(user));
}));

apiRouter.get("/drills/templates", authRequired, catchAsync(async (_req, res) => {
  const templates = await prisma.drillTemplate.findMany({ orderBy: { createdAt: "asc" } });
  res.json(
    templates.map((t) => ({
      id: t.id,
      createdByUserId: t.createdByUserId,
      name: t.name,
      holesCount: t.holesCount,
      shotTypes: t.shotTypes,
      scoringRule: t.scoringRule,
      isSystemDefault: t.isSystemDefault,
      createdAt: t.createdAt.toISOString(),
    })),
  );
}));

function serializeRound(
  round: {
    id: string;
    playerProfileId: string;
    courseName: string | null;
    teesPlayed: string | null;
    roundDate: Date;
    totalScore: number | null;
    totalPutts: number | null;
    fairwaysHit: number | null;
    greensInReg: number | null;
    createdAt: Date;
    holes?: Array<{
      id: string;
      roundId: string;
      holeNumber: number;
      par: number | null;
      score: number;
      putts: number | null;
      fairwayHit: boolean | null;
      greenInReg: boolean | null;
      clubUsed: string | null;
      penaltyStrokes: number;
    }>;
  },
) {
  return {
    ...round,
    roundDate: toDateOnly(round.roundDate),
    createdAt: round.createdAt.toISOString(),
  };
}

apiRouter.post("/rounds", authRequired, catchAsync(async (req, res) => {
  const parsed = createRoundRequestSchema.parse(req.body);
  await requireProfileAccess(req.user!, parsed.playerProfileId);
  const totals = roundTotals(parsed.holes);
  const round = await prisma.round.create({
    data: {
      playerProfileId: parsed.playerProfileId,
      courseName: parsed.courseName ?? null,
      teesPlayed: parsed.teesPlayed ?? null,
      roundDate: parseDateOnly(parsed.roundDate),
      ...totals,
      holes: {
        create: parsed.holes.map((h) => ({
          holeNumber: h.holeNumber,
          par: h.par ?? null,
          score: h.score,
          putts: h.putts ?? null,
          fairwayHit: h.fairwayHit ?? null,
          greenInReg: h.greenInReg ?? null,
          clubUsed: h.clubUsed ?? null,
          penaltyStrokes: h.penaltyStrokes ?? 0,
        })),
      },
    },
    include: { holes: { orderBy: { holeNumber: "asc" } } },
  });
  res.status(201).json(serializeRound(round));
}));

apiRouter.get("/rounds", authRequired, catchAsync(async (req, res) => {
  const playerId = String(req.query.playerId ?? "");
  if (!playerId) throw new ApiError(400, "VALIDATION_ERROR", "playerId is required");
  await requireProfileAccess(req.user!, playerId);
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  const rounds = await prisma.round.findMany({
    where: {
      playerProfileId: playerId,
      ...(from || to
        ? {
            roundDate: {
              ...(from ? { gte: parseDateOnly(from) } : {}),
              ...(to ? { lte: parseDateOnly(to) } : {}),
            },
          }
        : {}),
    },
    orderBy: { roundDate: "desc" },
  });
  res.json(rounds.map(serializeRound));
}));

apiRouter.get("/rounds/:id", authRequired, catchAsync(async (req, res) => {
  const round = await prisma.round.findUnique({
    where: { id: req.params.id },
    include: { holes: { orderBy: { holeNumber: "asc" } } },
  });
  if (!round) throw new ApiError(404, "NOT_FOUND", "Round not found");
  await requireProfileAccess(req.user!, round.playerProfileId);
  res.json(serializeRound(round));
}));

function serializeSession(session: {
  id: string;
  playerProfileId: string;
  drillTemplateId: string | null;
  sessionDate: Date;
  durationMinutes: number | null;
  category: string | null;
  notes: string | null;
  sessionTotal: { toString(): string } | number;
  createdAt: Date;
  holes?: Array<{
    id: string;
    practiceSessionId: string;
    holeNumber: number;
    holeTotal: { toString(): string } | number;
    shots?: Array<{
      id: string;
      sessionHoleEntryId: string;
      shotType: string;
      shotsTaken: string;
      proximity: string | null;
      pointsEarned: { toString(): string } | number;
    }>;
  }>;
}) {
  return {
    id: session.id,
    playerProfileId: session.playerProfileId,
    drillTemplateId: session.drillTemplateId,
    sessionDate: toDateOnly(session.sessionDate),
    durationMinutes: session.durationMinutes,
    category: session.category,
    notes: session.notes,
    sessionTotal: Number(session.sessionTotal),
    createdAt: session.createdAt.toISOString(),
    holes: session.holes?.map((h) => ({
      id: h.id,
      practiceSessionId: h.practiceSessionId,
      holeNumber: h.holeNumber,
      holeTotal: Number(h.holeTotal),
      shotResults: (h.shots ?? []).map((s) => ({
        id: s.id,
        sessionHoleEntryId: s.sessionHoleEntryId,
        shotType: s.shotType,
        shotsTaken: s.shotsTaken,
        proximity: s.proximity,
        pointsEarned: Number(s.pointsEarned),
      })),
    })),
  };
}

apiRouter.post("/practice-sessions", authRequired, catchAsync(async (req, res) => {
  const parsed = createPracticeSessionRequestSchema.parse(req.body);
  await requireProfileAccess(req.user!, parsed.playerProfileId);
  const template = parsed.drillTemplateId
    ? await prisma.drillTemplate.findUnique({ where: { id: parsed.drillTemplateId } })
    : await prisma.drillTemplate.findFirst({ where: { isSystemDefault: true } });
  const rule = (template?.scoringRule as ScoringRule | undefined) ?? DEFAULT_SCORING_RULE;
  const scored = calculateSessionTotals(rule, parsed.holes);
  const session = await prisma.practiceSession.create({
    data: {
      playerProfileId: parsed.playerProfileId,
      drillTemplateId: template?.id ?? parsed.drillTemplateId ?? null,
      sessionDate: parseDateOnly(parsed.sessionDate),
      durationMinutes: parsed.durationMinutes ?? null,
      category: parsed.category ?? "SHORT_GAME",
      notes: parsed.notes ?? null,
      sessionTotal: scored.sessionTotal,
      holes: {
        create: scored.holes.map((h) => ({
          holeNumber: h.holeNumber,
          holeTotal: h.holeTotal,
          shots: {
            create: h.shotResults.map((s) => ({
              shotType: s.shotType,
              shotsTaken: s.shotsTaken,
              proximity: s.proximity ?? null,
              pointsEarned: s.pointsEarned,
            })),
          },
        })),
      },
    },
    include: { holes: { include: { shots: true }, orderBy: { holeNumber: "asc" } } },
  });
  res.status(201).json(serializeSession(session));
}));

apiRouter.get("/practice-sessions", authRequired, catchAsync(async (req, res) => {
  const playerId = String(req.query.playerId ?? "");
  if (!playerId) throw new ApiError(400, "VALIDATION_ERROR", "playerId is required");
  await requireProfileAccess(req.user!, playerId);
  const drillId =
    typeof req.query.drillTemplateId === "string" ? req.query.drillTemplateId : undefined;
  const sessions = await prisma.practiceSession.findMany({
    where: {
      playerProfileId: playerId,
      ...(drillId ? { drillTemplateId: drillId } : {}),
    },
    orderBy: { sessionDate: "desc" },
  });
  res.json(sessions.map((s) => serializeSession(s)));
}));

apiRouter.get("/practice-sessions/:id", authRequired, catchAsync(async (req, res) => {
  const session = await prisma.practiceSession.findUnique({
    where: { id: req.params.id },
    include: { holes: { include: { shots: true }, orderBy: { holeNumber: "asc" } } },
  });
  if (!session) throw new ApiError(404, "NOT_FOUND", "Session not found");
  await requireProfileAccess(req.user!, session.playerProfileId);
  res.json(serializeSession(session));
}));

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}
function delta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return Math.round((current - previous) * 10) / 10;
}

apiRouter.get("/progress/:playerId/summary", authRequired, catchAsync(async (req, res) => {
  await requireProfileAccess(req.user!, req.params.playerId);
  const rounds = await prisma.round.findMany({
    where: { playerProfileId: req.params.playerId },
    orderBy: { roundDate: "desc" },
  });
  const sessions = await prisma.practiceSession.findMany({
    where: { playerProfileId: req.params.playerId },
    orderBy: { sessionDate: "desc" },
  });
  const recentScores = rounds.slice(0, 8).map((r) => r.totalScore ?? 0);
  const prevScores = rounds.slice(8, 16).map((r) => r.totalScore ?? 0);
  const recentDrills = sessions.slice(0, 8).map((s) => Number(s.sessionTotal));
  const prevDrills = sessions.slice(8, 16).map((s) => Number(s.sessionTotal));
  const scoringAvg = avg(recentScores);
  const drillAvg = avg(recentDrills);
  const recentPutts = rounds.slice(0, 8).map((r) => r.totalPutts ?? 0);
  const prevPutts = rounds.slice(8, 16).map((r) => r.totalPutts ?? 0);
  const firHits = rounds.slice(0, 8).reduce((s, r) => s + (r.fairwaysHit ?? 0), 0);
  const girHits = rounds.slice(0, 8).reduce((s, r) => s + (r.greensInReg ?? 0), 0);
  const holeCount = Math.min(rounds.length, 8) * 18;
  const puttsAvg = avg(recentPutts);

  // Activity streak: consecutive calendar days with a round OR session, ending today
  const activityDates = new Set<string>([
    ...rounds.map((r) => toDateOnly(r.roundDate)),
    ...sessions.map((s) => toDateOnly(s.sessionDate)),
  ]);
  let streak = 0;
  const cur = new Date();
  cur.setUTCHours(0, 0, 0, 0);
  while (true) {
    const key = cur.toISOString().slice(0, 10);
    if (!activityDates.has(key)) break;
    streak++;
    cur.setUTCDate(cur.getUTCDate() - 1);
  }

  res.json({
    scoringAvg,
    scoringAvgDelta: delta(scoringAvg, avg(prevScores)),
    drillAvg,
    drillAvgDelta: delta(drillAvg, avg(prevDrills)),
    puttsAvg,
    puttsAvgDelta: delta(puttsAvg, avg(prevPutts)),
    firPct: holeCount ? Math.round((firHits / holeCount) * 1000) / 10 : null,
    girPct: holeCount ? Math.round((girHits / holeCount) * 1000) / 10 : null,
    streak,
    lastRound: rounds[0] ? serializeRound(rounds[0]) : null,
    lastSession: sessions[0] ? serializeSession(sessions[0]) : null,
    recentRounds: rounds.slice(0, 5).map(serializeRound),
    recentSessions: sessions.slice(0, 5).map((s) => serializeSession(s)),
  });
}));

apiRouter.get("/progress/:playerId/trend", authRequired, catchAsync(async (req, res) => {
  await requireProfileAccess(req.user!, req.params.playerId);
  const metric = String(req.query.metric ?? "SHORT_GAME_DRILL");
  const range = String(req.query.range ?? "8sessions");
  const take = Number.parseInt(range, 10) || 8;
  const isScoring = metric === "SCORING_AVG" || metric === "scoring" || metric === "PUTTS_AVG" || metric === "FIR" || metric === "GIR";
  if (isScoring) {
    const rounds = await prisma.round.findMany({
      where: { playerProfileId: req.params.playerId },
      orderBy: { roundDate: "desc" },
      take,
    });
    const chronological = [...rounds].reverse();
    res.json({
      metric,
      range,
      points: chronological.map((r) => ({
        label: toDateOnly(r.roundDate).slice(5),
        value:
          metric === "SCORING_AVG" || metric === "scoring"
            ? (r.totalScore ?? 0)
            : metric === "PUTTS_AVG"
              ? (r.totalPutts ?? 0)
              : metric === "FIR"
                ? Math.round(((r.fairwaysHit ?? 0) / 18) * 1000) / 10
                : Math.round(((r.greensInReg ?? 0) / 18) * 1000) / 10,
      })),
    });
    return;
  }
  const sessions = await prisma.practiceSession.findMany({
    where: { playerProfileId: req.params.playerId },
    orderBy: { sessionDate: "asc" },
  });
  const last = sessions.slice(-take);
  res.json({
    metric,
    range,
    points: last.map((s) => ({
      label: toDateOnly(s.sessionDate).slice(5),
      value: Number(s.sessionTotal),
    })),
  });
}));
