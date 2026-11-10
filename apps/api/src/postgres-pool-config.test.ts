import assert from "node:assert/strict";
import test from "node:test";
import { postgresPoolConfig } from "./postgres-pool-config.js";

test("production PostgreSQL connections validate TLS certificates by default", () => {
  const config = postgresPoolConfig({ NODE_ENV: "production", DATABASE_URL: "postgres://db" } as NodeJS.ProcessEnv);
  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
});

test("production PostgreSQL connections accept an explicitly supplied trusted CA", () => {
  const ca = "-----BEGIN CERTIFICATE-----\ntrusted-ca\n-----END CERTIFICATE-----";
  const config = postgresPoolConfig({ NODE_ENV: "production", DATABASE_URL: "postgres://db", DB_SSL_CA: ca } as NodeJS.ProcessEnv);
  assert.deepEqual(config.ssl, { rejectUnauthorized: true, ca });
});

test("pool limits and timeouts use safe defaults and clamp excessive values", () => {
  const defaults = postgresPoolConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv);
  assert.equal(defaults.max, 10);
  assert.equal(defaults.min, 0);
  assert.equal(defaults.idleTimeoutMillis, 30_000);
  assert.equal(defaults.connectionTimeoutMillis, 5_000);
  assert.equal(defaults.statement_timeout, 15_000);
  assert.equal(defaults.query_timeout, 20_000);
  const configured = postgresPoolConfig({
    NODE_ENV: "test", DB_POOL_MAX: "1000", DB_POOL_IDLE_TIMEOUT_MS: "999999",
    DB_POOL_CONNECTION_TIMEOUT_MS: "70000", DB_STATEMENT_TIMEOUT_MS: "200000",
    DB_QUERY_TIMEOUT_MS: "200000",
  } as NodeJS.ProcessEnv);
  assert.equal(configured.max, 50);
  assert.equal(configured.idleTimeoutMillis, 300_000);
  assert.equal(configured.connectionTimeoutMillis, 60_000);
  assert.equal(configured.statement_timeout, 120_000);
  assert.equal(configured.query_timeout, 120_000);
});

test("invalid or non-positive pool settings fall back safely", () => {
  const config = postgresPoolConfig({ NODE_ENV: "test", DB_POOL_MAX: "-1", DB_STATEMENT_TIMEOUT_MS: "nope" } as NodeJS.ProcessEnv);
  assert.equal(config.max, 10);
  assert.equal(config.statement_timeout, 15_000);
});
