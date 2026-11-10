import type { PoolConfig } from "pg";

function positiveIntegerFromEnv(env: NodeJS.ProcessEnv, name: string, fallback: number, maximum: number): number {
  const raw = env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
}

export function postgresPoolConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  const production = env.NODE_ENV === "production";
  return {
    connectionString: env.DATABASE_URL,
    max: positiveIntegerFromEnv(env, "DB_POOL_MAX", 10, 50),
    min: 0,
    idleTimeoutMillis: positiveIntegerFromEnv(env, "DB_POOL_IDLE_TIMEOUT_MS", 30_000, 300_000),
    connectionTimeoutMillis: positiveIntegerFromEnv(env, "DB_POOL_CONNECTION_TIMEOUT_MS", 5_000, 60_000),
    statement_timeout: positiveIntegerFromEnv(env, "DB_STATEMENT_TIMEOUT_MS", 15_000, 120_000),
    query_timeout: positiveIntegerFromEnv(env, "DB_QUERY_TIMEOUT_MS", 20_000, 120_000),
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    application_name: "cities-builder-nest-api",
    // Never disable certificate validation. Supply a trusted PEM CA when the
    // database uses a private CA (for example, a self-managed VPS deployment).
    ssl: production
      ? { rejectUnauthorized: true, ...(env.DB_SSL_CA ? { ca: env.DB_SSL_CA } : {}) }
      : undefined,
  };
}
