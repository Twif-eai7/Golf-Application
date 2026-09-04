import "dotenv/config";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./lib/prisma.js";

async function ensureAuthSchema() {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "supabase_id" TEXT`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "users_supabase_id_key" ON "users"("supabase_id")`,
  );
}

async function main() {
  try {
    await ensureAuthSchema();
    console.log("Auth schema ready");
  } catch (err) {
    console.error("ensureAuthSchema failed (auth sync may 500 until DB is updated):", err);
  }

  const app = createApp();
  const server = app.listen(config.port, "0.0.0.0", () => {
    console.log(`Fairway Log API listening on http://localhost:${config.port}`);
  });

  async function shutdown() {
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main();
