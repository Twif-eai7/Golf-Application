import type { PlayerProfile } from "@prisma/client";
import type { JwtPayload } from "@fairwaylog/shared";
import { prisma } from "./prisma.js";
import { ApiError } from "./http.js";
import { toDateOnly } from "./crypto.js";

export function toPlayerDto(p: PlayerProfile) {
  return {
    id: p.id,
    ownerUserId: p.ownerUserId,
    ownerType: p.ownerType,
    claimedByUserId: p.claimedByUserId,
    name: p.name,
    dateOfBirth: p.dateOfBirth ? toDateOnly(p.dateOfBirth) : null,
    handicap: p.handicap != null ? Number(p.handicap) : null,
    photoUrl: p.photoUrl,
    createdAt: p.createdAt.toISOString(),
  };
}

export async function listAccessibleProfiles(user: JwtPayload) {
  if (user.accountType === "COACH") {
    const links = await prisma.coachPlayerLink.findMany({
      where: { coachUserId: user.sub },
      include: { profile: true },
    });
    return links.map((l) => l.profile);
  }
  return prisma.playerProfile.findMany({
    where: { claimedByUserId: user.sub },
  });
}

export async function requireProfileAccess(user: JwtPayload, playerId: string) {
  const profile = await prisma.playerProfile.findUnique({ where: { id: playerId } });
  if (!profile) throw new ApiError(404, "NOT_FOUND", "Player not found");
  if (user.accountType === "COACH") {
    const link = await prisma.coachPlayerLink.findUnique({
      where: {
        coachUserId_playerProfileId: {
          coachUserId: user.sub,
          playerProfileId: playerId,
        },
      },
    });
    if (!link) throw new ApiError(403, "FORBIDDEN", "No access to this player");
  } else if (profile.claimedByUserId !== user.sub) {
    throw new ApiError(403, "FORBIDDEN", "No access to this player");
  }
  return profile;
}
