-- Supabase-only users have no local password.
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

-- Safe if an earlier migration already added this column.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "supabase_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_supabase_id_key" ON "users"("supabase_id");
