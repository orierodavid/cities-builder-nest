import pg from "pg";

const { Pool } = pg;

export const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    })
  : null;

export async function checkDatabase(): Promise<boolean> {
  if (!pool) return false;
  await pool.query("SELECT 1");
  return true;
}
