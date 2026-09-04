-- AlterTable: add supabase_id to users for Supabase Auth integration
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "supabase_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_supabase_id_key" ON "users"("supabase_id");
