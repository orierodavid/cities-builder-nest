import pg from "pg";

const { Pool } = pg;

function positiveIntegerFromEnv(name: string, fallback: number, maximum: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
}

export const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: positiveIntegerFromEnv("DB_POOL_MAX", 10, 50),
      min: 0,
      idleTimeoutMillis: positiveIntegerFromEnv("DB_POOL_IDLE_TIMEOUT_MS", 30_000, 300_000),
      connectionTimeoutMillis: positiveIntegerFromEnv("DB_POOL_CONNECTION_TIMEOUT_MS", 5_000, 60_000),
      statement_timeout: positiveIntegerFromEnv("DB_STATEMENT_TIMEOUT_MS", 15_000, 120_000),
      query_timeout: positiveIntegerFromEnv("DB_QUERY_TIMEOUT_MS", 20_000, 120_000),
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      application_name: "cities-builder-nest-api",
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    })
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
