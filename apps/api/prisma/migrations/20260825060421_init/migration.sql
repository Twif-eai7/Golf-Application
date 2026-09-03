-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('INDIVIDUAL_PLAYER', 'COACH');

-- CreateEnum
CREATE TYPE "OwnerType" AS ENUM ('SELF', 'COACH');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "account_type" "AccountType" NOT NULL,
    "full_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_profiles" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "owner_type" "OwnerType" NOT NULL,
    "claimed_by_user_id" UUID,
    "name" TEXT NOT NULL,
    "date_of_birth" DATE,
    "handicap" DECIMAL(4,1),
    "photo_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_player_links" (
    "id" UUID NOT NULL,
    "coach_user_id" UUID NOT NULL,
    "player_profile_id" UUID NOT NULL,

    CONSTRAINT "coach_player_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_invites" (
    "id" UUID NOT NULL,
    "player_profile_id" UUID NOT NULL,
    "coach_user_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "profile_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drill_templates" (
    "id" UUID NOT NULL,
    "created_by_user_id" UUID,
    "name" TEXT NOT NULL,
    "holes_count" INTEGER NOT NULL DEFAULT 9,
    "shot_types" TEXT[],
    "scoring_rule" JSONB NOT NULL,
    "is_system_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drill_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rounds" (
    "id" UUID NOT NULL,
    "player_profile_id" UUID NOT NULL,
    "course_name" TEXT,
    "tees_played" TEXT,
    "round_date" DATE NOT NULL,
    "total_score" INTEGER,
    "total_putts" INTEGER,
    "fairways_hit" INTEGER,
    "greens_in_reg" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round_holes" (
    "id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "hole_number" INTEGER NOT NULL,
    "par" INTEGER,
    "score" INTEGER NOT NULL,
    "putts" INTEGER,
    "fairway_hit" BOOLEAN,
    "green_in_reg" BOOLEAN,
    "club_used" TEXT,
    "penalty_strokes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "round_holes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_sessions" (
    "id" UUID NOT NULL,
    "player_profile_id" UUID NOT NULL,
    "drill_template_id" UUID,
    "session_date" DATE NOT NULL,
    "duration_minutes" INTEGER,
    "category" TEXT,
    "notes" TEXT,
    "session_total" DECIMAL(6,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_hole_entries" (
    "id" UUID NOT NULL,
    "practice_session_id" UUID NOT NULL,
    "hole_number" INTEGER NOT NULL,
    "hole_total" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "session_hole_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_shot_results" (
    "id" UUID NOT NULL,
    "session_hole_entry_id" UUID NOT NULL,
    "shot_type" TEXT NOT NULL,
    "shots_taken" TEXT NOT NULL,
    "proximity" TEXT,
    "points_earned" DECIMAL(4,1) NOT NULL,

    CONSTRAINT "session_shot_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_profiles_owner" ON "player_profiles"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "coach_player_links_coach_user_id_player_profile_id_key" ON "coach_player_links"("coach_user_id", "player_profile_id");

-- CreateIndex
CREATE INDEX "profile_invites_token_hash_idx" ON "profile_invites"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_hash_idx" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "idx_rounds_profile_date" ON "rounds"("player_profile_id", "round_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "round_holes_round_id_hole_number_key" ON "round_holes"("round_id", "hole_number");

-- CreateIndex
CREATE INDEX "idx_sessions_profile_date" ON "practice_sessions"("player_profile_id", "session_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "session_hole_entries_practice_session_id_hole_number_key" ON "session_hole_entries"("practice_session_id", "hole_number");

-- AddForeignKey
ALTER TABLE "player_profiles" ADD CONSTRAINT "player_profiles_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_profiles" ADD CONSTRAINT "player_profiles_claimed_by_user_id_fkey" FOREIGN KEY ("claimed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_player_links" ADD CONSTRAINT "coach_player_links_coach_user_id_fkey" FOREIGN KEY ("coach_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_player_links" ADD CONSTRAINT "coach_player_links_player_profile_id_fkey" FOREIGN KEY ("player_profile_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_invites" ADD CONSTRAINT "profile_invites_player_profile_id_fkey" FOREIGN KEY ("player_profile_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_invites" ADD CONSTRAINT "profile_invites_coach_user_id_fkey" FOREIGN KEY ("coach_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drill_templates" ADD CONSTRAINT "drill_templates_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_player_profile_id_fkey" FOREIGN KEY ("player_profile_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_holes" ADD CONSTRAINT "round_holes_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_player_profile_id_fkey" FOREIGN KEY ("player_profile_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_drill_template_id_fkey" FOREIGN KEY ("drill_template_id") REFERENCES "drill_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_hole_entries" ADD CONSTRAINT "session_hole_entries_practice_session_id_fkey" FOREIGN KEY ("practice_session_id") REFERENCES "practice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_shot_results" ADD CONSTRAINT "session_shot_results_session_hole_entry_id_fkey" FOREIGN KEY ("session_hole_entry_id") REFERENCES "session_hole_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
