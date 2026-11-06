import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import { requireAuth } from "./auth.js";

function responseRecorder() {
  const result: { statusCode?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    json(body: unknown) {
      result.body = body;
      return this;
    },
  };
  return { response: response as unknown as Response, result };
}

test("rejects requests without a bearer token", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "test-public-key";
  const req = { header: () => undefined } as unknown as Request;
  const { response, result } = responseRecorder();
  let nextCalled = false;

  await requireAuth(req, response, (() => { nextCalled = true; }) as NextFunction);

  assert.equal(result.statusCode, 401);
  assert.deepEqual(result.body, { error: "missing_bearer_token" });
  assert.equal(nextCalled, false);
});

test("fails closed when Supabase Auth is not configured", async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  const req = { header: () => "Bearer any-token" } as unknown as Request;
  const { response, result } = responseRecorder();
  let nextCalled = false;

  await requireAuth(req, response, (() => { nextCalled = true; }) as NextFunction);

  assert.equal(result.statusCode, 503);
  assert.deepEqual(result.body, { error: "authentication_not_configured" });
  assert.equal(nextCalled, false);
});


test("treats an Auth upstream timeout as temporary unavailability", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "test-public-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({ message: "upstream timeout" }),
    { status: 408, headers: { "Content-Type": "application/json" } },
  );
  const req = { header: () => "Bearer test-token" } as unknown as Request;
  const { response, result } = responseRecorder();
  let nextCalled = false;

  try {
    await requireAuth(req, response, (() => { nextCalled = true; }) as NextFunction);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(result.statusCode, 503);
  assert.deepEqual(result.body, { error: "authentication_service_unavailable" });
  assert.equal(nextCalled, false);
});
