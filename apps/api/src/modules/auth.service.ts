import bcrypt from "bcryptjs";
import {
  REFRESH_TOKEN_TTL_SECONDS,
  signupRequestSchema,
  loginRequestSchema,
  refreshRequestSchema,
} from "@fairwaylog/shared";
import { prisma } from "../lib/prisma.js";
import { hashToken, newRefreshToken, parseDateOnly } from "../lib/crypto.js";
import { ApiError, signAccessToken, toUserDto } from "../lib/http.js";
import type { User } from "@prisma/client";

export async function issueTokenPair(user: User) {
  const refreshToken = newRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  });
  return { token: signAccessToken(user), refreshToken, user: toUserDto(user) };
}

export async function rotateRefresh(oldToken: string) {
  const hashed = hashToken(oldToken);
  const stored = await prisma.refreshToken.findFirst({
    where: { tokenHash: hashed, revokedAt: null },
    include: { user: true },
  });
  if (!stored || stored.expiresAt < new Date()) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid refresh token");
  }
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });
  return issueTokenPair(stored.user);
}

export async function signup(body: unknown) {
  const parsed = signupRequestSchema.parse(body);
  const existing = await prisma.user.findUnique({
    where: { email: parsed.email.toLowerCase() },
  });
  if (existing) throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists");
  const user = await prisma.user.create({
    data: {
      email: parsed.email.toLowerCase(),
      passwordHash: await bcrypt.hash(parsed.password, 12),
      fullName: parsed.fullName,
      accountType: parsed.accountType,
    },
  });
  if (parsed.accountType === "INDIVIDUAL_PLAYER") {
    await prisma.playerProfile.create({
      data: {
        ownerUserId: user.id,
        ownerType: "SELF",
        claimedByUserId: user.id,
        name: parsed.fullName,
      },
    });
  }
  return issueTokenPair(user);
}

export async function login(body: unknown) {
  const parsed = loginRequestSchema.parse(body);
  const user = await prisma.user.findUnique({
    where: { email: parsed.email.toLowerCase() },
  });
  if (!user || !user.passwordHash || !(await bcrypt.compare(parsed.password, user.passwordHash))) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }
  return issueTokenPair(user);
}

export async function refresh(body: unknown) {
  const parsed = refreshRequestSchema.parse(body);
  return rotateRefresh(parsed.refreshToken);
}

export async function logout(userId: string, refreshToken?: string) {
  if (refreshToken) {
    await prisma.refreshToken.updateMany({
      where: { userId, tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } else {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

export { parseDateOnly };
