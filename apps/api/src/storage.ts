import pg from "pg";
import { postgresPoolConfig } from "./postgres-pool-config.js";

const { Pool } = pg;

export const pool = process.env.DATABASE_URL
  ? new Pool(postgresPoolConfig())
  : null;

// A pool-level error can occur on an idle client. Handle it so transient
// network/database failures do not become unhandled EventEmitter errors.
pool?.on("error", (error: Error & { code?: string }) => {
  console.error("Database pool idle-client error", {
    name: error.name,
    code: error.code ?? "unknown",
  });
});

export async function checkDatabase(): Promise<boolean> {
  if (!pool) return false;
  await pool.query("SELECT 1");
  return true;
}

export async function closeDatabase(): Promise<void> {
  if (pool) await pool.end();
}
