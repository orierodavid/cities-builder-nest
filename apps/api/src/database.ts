import type { PoolClient } from "pg";
import { pool } from "./storage.js";

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is required for native PostgreSQL data access.");
    this.name = "DatabaseNotConfiguredError";
  }
}

/**
 * Runs a user-scoped operation under PostgreSQL's authenticated role.
 *
 * The caller must supply an identity that has already been validated by the
 * API authentication middleware. Role and JWT claims are transaction-local,
 * so they are reset automatically when the transaction ends and the pooled
 * connection is returned.
 *
 * This deliberately does not provide a service-role/BYPASSRLS execution path.
 */
export async function withAuthenticatedTransaction<T>(
  userId: string,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!pool) throw new DatabaseNotConfiguredError();
  if (!userId) throw new TypeError("A validated user ID is required.");

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    // RLS policies evaluate auth.uid() and current_user as they do through
    // Supabase's authenticated PostgREST role.
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(
      "SELECT " +
        "set_config('request.jwt.claim.sub', $1, true), " +
        "set_config('request.jwt.claim.role', 'authenticated', true), " +
        "set_config('request.jwt.claims', $2, true)",
      [userId, JSON.stringify({ sub: userId, role: "authenticated" })],
    );

    const result = await operation(client);
    await client.query("COMMIT");
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    throw error;
  } finally {
    client.release();
  }
}
