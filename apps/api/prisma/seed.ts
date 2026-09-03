import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_DRILL_TEMPLATE_ID,
  DEFAULT_SCORING_RULE,
  SHORT_GAME_DRILL_NAME,
} from "@fairwaylog/shared";
import { prisma } from "../src/lib/prisma.js";
import { hashToken } from "../src/lib/crypto.js";

const PASSWORD = "Password123!";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const SEED = {
  coach: "b0000000-0000-4000-8000-000000000001",
  player: "b0000000-0000-4000-8000-000000000002",
  playerProfile: "c0000000-0000-4000-8000-000000000001",
  alexProfile: "c0000000-0000-4000-8000-000000000002",
  invite: "d0000000-0000-4000-8000-000000000001",
};

export const DEMO_INVITE_TOKEN = "invite-alex-kim";

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  // Create / ensure seed users exist in Supabase Auth
  async function upsertSupabaseUser(email: string, fullName: string, accountType: string) {
    const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
    const found = existing.users.find((u) => u.email === email);
    if (found) return found.id;
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName, accountType },
    });
    if (error) throw error;
    return data.user!.id;
  }

  const coachSupabaseId = await upsertSupabaseUser("coach@fairwaylog.test", "Morgan Ellis", "COACH");
  const playerSupabaseId = await upsertSupabaseUser("vihaan@fairwaylog.test", "Vihaan", "INDIVIDUAL_PLAYER");

  await prisma.user.upsert({
    where: { email: "coach@fairwaylog.test" },
    update: { supabaseId: coachSupabaseId },
    create: {
      id: SEED.coach,
      email: "coach@fairwaylog.test",
      passwordHash,
      accountType: "COACH",
      fullName: "Morgan Ellis",
      supabaseId: coachSupabaseId,
    },
  });

  await prisma.user.upsert({
    where: { id: SEED.player },
    update: { email: "vihaan@fairwaylog.test", fullName: "Vihaan", supabaseId: playerSupabaseId },
    create: {
      id: SEED.player,
      email: "vihaan@fairwaylog.test",
      passwordHash,
      accountType: "INDIVIDUAL_PLAYER",
      fullName: "Vihaan",
      supabaseId: playerSupabaseId,
    },
  });

  await prisma.playerProfile.upsert({
    where: { id: SEED.playerProfile },
    update: { name: "Vihaan" },
    create: {
      id: SEED.playerProfile,
      ownerUserId: SEED.player,
      ownerType: "SELF",
      claimedByUserId: SEED.player,
      name: "Vihaan",
      dateOfBirth: new Date("1994-04-12"),
      handicap: 12.4,
    },
  });

  await prisma.playerProfile.upsert({
    where: { id: SEED.alexProfile },
    update: {},
    create: {
      id: SEED.alexProfile,
      ownerUserId: SEED.coach,
      ownerType: "COACH",
      claimedByUserId: null,
      name: "Alex Kim",
      dateOfBirth: new Date("2008-06-02"),
      handicap: 18.0,
    },
  });

  await prisma.coachPlayerLink.upsert({
    where: {
      coachUserId_playerProfileId: {
        coachUserId: SEED.coach,
        playerProfileId: SEED.alexProfile,
      },
    },
    update: {},
    create: { coachUserId: SEED.coach, playerProfileId: SEED.alexProfile },
  });

  await prisma.profileInvite.upsert({
    where: { id: SEED.invite },
    update: {},
    create: {
      id: SEED.invite,
      playerProfileId: SEED.alexProfile,
      coachUserId: SEED.coach,
      email: "alex@fairwaylog.test",
      tokenHash: hashToken(DEMO_INVITE_TOKEN),
      expiresAt: daysAgo(-14),
      status: "PENDING",
    },
  });

  await prisma.drillTemplate.upsert({
    where: { id: DEFAULT_DRILL_TEMPLATE_ID },
    update: {},
    create: {
      id: DEFAULT_DRILL_TEMPLATE_ID,
      name: SHORT_GAME_DRILL_NAME,
      holesCount: 9,
      shotTypes: ["EASY", "MEDIUM", "HARD", "BUNKER"],
      scoringRule: DEFAULT_SCORING_RULE,
      isSystemDefault: true,
    },
  });

  const existingRounds = await prisma.round.count({
    where: { playerProfileId: SEED.playerProfile },
  });
  if (existingRounds === 0) {
    const scores = [82, 80, 85, 78, 81, 79, 77, 76];
    const putts = [32, 31, 34, 30, 31, 29, 28, 28];
    const fir = [8, 9, 7, 10, 9, 10, 11, 11];
    const gir = [7, 8, 6, 9, 8, 9, 10, 10];
    for (let i = 0; i < 8; i++) {
      await prisma.round.create({
        data: {
          playerProfileId: SEED.playerProfile,
          courseName: i % 2 === 0 ? "Pebble Creek" : "Oakmont Municipal",
          teesPlayed: "White",
          roundDate: daysAgo(50 - i * 6),
          totalScore: scores[i],
          totalPutts: putts[i],
          fairwaysHit: fir[i],
          greensInReg: gir[i],
          holes: {
            create: Array.from({ length: 18 }, (_, h) => ({
              holeNumber: h + 1,
              par: h % 9 === 0 ? 5 : h % 3 === 0 ? 3 : 4,
              score: Math.round((scores[i] ?? 72) / 18),
              putts: h % 2 === 0 ? 2 : 1,
              fairwayHit: h % 3 !== 0,
              greenInReg: h % 2 === 0,
            })),
          },
        },
      });
    }

    const totals = [38, 41, 40, 44, 43, 46, 47, 49];
    for (let i = 0; i < 8; i++) {
      await prisma.practiceSession.create({
        data: {
          playerProfileId: SEED.playerProfile,
          drillTemplateId: DEFAULT_DRILL_TEMPLATE_ID,
          sessionDate: daysAgo(45 - i * 5),
          durationMinutes: 45,
          category: "SHORT_GAME",
          sessionTotal: totals[i]!,
          holes: {
            create: Array.from({ length: 9 }, (_, h) => ({
              holeNumber: h + 1,
              holeTotal: Math.round((totals[i] ?? 40) / 9),
              shots: {
                create: [
                  { shotType: "EASY", shotsTaken: "2", proximity: "<3ft", pointsEarned: 4 },
                  { shotType: "MEDIUM", shotsTaken: "3", proximity: "3-10ft", pointsEarned: 2 },
                  { shotType: "HARD", shotsTaken: "4", proximity: ">10ft", pointsEarned: 0 },
                  { shotType: "BUNKER", shotsTaken: "3", proximity: "3-10ft", pointsEarned: 2 },
                ],
              },
            })),
          },
        },
      });
    }
  }

  console.log("Seed complete. vihaan@ / coach@ fairwaylog.test · Password123!");
  console.log("Invite token:", DEMO_INVITE_TOKEN);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
