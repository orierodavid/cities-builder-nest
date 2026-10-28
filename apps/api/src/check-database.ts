import dotenv from "dotenv";
import pg from "pg";
import { resolve } from "node:path";

dotenv.config({ path: resolve(process.cwd(), ".env") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is missing. Run this from apps/api and verify its .env file.");
  process.exitCode = 1;
} else {
  const pool = new pg.Pool({
    connectionString,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10000,
  });

  try {
    await pool.query("SELECT 1");
    console.log("Database connection successful.");
  } catch (error) {
    const e = error as NodeJS.ErrnoException & { code?: string };
    console.error("Database connection failed:", {
      code: e.code ?? "UNKNOWN",
      message: e.message,
    });
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
