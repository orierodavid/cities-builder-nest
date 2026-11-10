import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import {
  createRequireAuth,
  type AuthMiddlewareDependencies,
  type AuthenticatedRequest,
} from "./auth.js";
import type { AuthIdentity, AuthProvider } from "./auth-provider.js";

const identity: AuthIdentity = {
  id: "user-1",
  email: "resident@example.test",
  email_confirmed_at: "2026-01-01T00:00:00.000Z",
};

function responseRecorder() {
  const result: { statusCode?: number; body?: unknown; headers: Record<string, string> } = {
    headers: {},
  };
  const response = {
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      result.headers[name.toLowerCase()] = value;
      return this;
    },
    json(body: unknown) {
      result.body = body;
      return this;
    },
  };
  return { response: response as unknown as Response, result };
}

function request(authorization?: string): Request {
  return { header: (name: string) => name.toLowerCase() === "authorization" ? authorization : undefined } as unknown as Request;
}

function fakeDataClient(options: {
  profile?: { is_active: boolean } | null;
  profileError?: unknown;
  legalStatus?: { requiresAcceptance?: boolean };
  legalError?: unknown;
} = {}) {
  const client = {
    from(table: string) {
      assert.equal(table, "users");
      const query = {
        select() { return query; },
        eq() { return query; },
        maybeSingle: async () => ({
          data: options.profile === undefined ? { is_active: true } : options.profile,
          error: options.profileError ?? null,
        }),
      };
      return query;
    },
    rpc: async (name: string) => {
      assert.equal(name, "get_legal_consent_status");
      return {
        data: options.legalStatus ?? { requiresAcceptance: false },
        error: options.legalError ?? null,
      };
    },
  };
  return client;
}

function dependencies(
  result: { user: AuthIdentity | null; errorStatus?: number } = { user: identity },
  dataClient: ReturnType<typeof fakeDataClient> = fakeDataClient(),
  configured = true,
) {
  let verifiedToken: string | undefined;
  let createdToken: string | undefined;
  const authProvider: AuthProvider = {
    isConfigured: () => configured,
    verifyAccessToken: async (token) => {
      verifiedToken = token;
      return result;
    },
  };
  const deps: AuthMiddlewareDependencies = {
    authProvider,
    createUserClient: (token) => {
      createdToken = token;
      return dataClient as never;
    },
  };
  return { deps, getVerifiedToken: () => verifiedToken, getCreatedToken: () => createdToken };
}

test("rejects requests without a bearer token", async () => {
  const { deps } = dependencies();
  const middleware = createRequireAuth(deps);
  const { response, result } = responseRecorder();
  let nextCalled = false;

  await middleware(request(), response, (() => { nextCalled = true; }) as NextFunction);

  assert.equal(result.statusCode, 401);
  assert.deepEqual(result.body, { error: "missing_bearer_token" });
  assert.equal(nextCalled, false);
});

test("fails closed when the configured auth provider is unavailable", async () => {
  const { deps } = dependencies({ user: identity }, fakeDataClient(), false);
  const middleware = createRequireAuth(deps);
  const { response, result } = responseRecorder();
  let nextCalled = false;

  await middleware(request("Bearer any-token"), response, (() => { nextCalled = true; }) as NextFunction);

  assert.equal(result.statusCode, 503);
  assert.deepEqual(result.body, { error: "authentication_not_configured" });
  assert.equal(nextCalled, false);
});

test("rejects invalid or expired credentials", async () => {
  const { deps } = dependencies({ user: null, errorStatus: 401 });
  const middleware = createRequireAuth(deps);
  const { response, result } = responseRecorder();
  let nextCalled = false;

  await middleware(request("Bearer invalid-token"), response, (() => { nextCalled = true; }) as NextFunction);

  assert.equal(result.statusCode, 401);
  assert.deepEqual(result.body, { error: "invalid_or_expired_token" });
  assert.equal(nextCalled, false);
});

test("treats Auth upstream throttling and timeouts as temporary unavailability", async () => {
  for (const status of [408, 429, 503]) {
    const { deps } = dependencies({ user: null, errorStatus: status });
    const middleware = createRequireAuth(deps);
    const { response, result } = responseRecorder();
    let nextCalled = false;

    await middleware(request("Bearer test-token"), response, (() => { nextCalled = true; }) as NextFunction);

    assert.equal(result.statusCode, 503);
    assert.equal(result.headers["retry-after"], "5");
    assert.deepEqual(result.body, { error: "authentication_service_unavailable" });
    assert.equal(nextCalled, false);
  }
});

test("blocks accounts that have not been activated", async () => {
  const { deps } = dependencies({ user: identity }, fakeDataClient({ profile: { is_active: false } }));
  const middleware = createRequireAuth(deps);
  const { response, result } = responseRecorder();
  let nextCalled = false;

  await middleware(request("Bearer valid-token"), response, (() => { nextCalled = true; }) as NextFunction);

  assert.equal(result.statusCode, 403);
  assert.deepEqual(result.body, {
    error: "account_pending_approval",
    message: "Your account is awaiting administrator approval. We will email you when it becomes active.",
  });
  assert.equal(nextCalled, false);
});

test("fails closed when account status cannot be checked", async () => {
  const { deps } = dependencies({ user: identity }, fakeDataClient({ profileError: new Error("database unavailable") }));
  const middleware = createRequireAuth(deps);
  const { response, result } = responseRecorder();
  let nextCalled = false;

  await middleware(request("Bearer valid-token"), response, (() => { nextCalled = true; }) as NextFunction);

  assert.equal(result.statusCode, 503);
  assert.deepEqual(result.body, { error: "account_status_check_unavailable" });
  assert.equal(nextCalled, false);
});

test("requires current legal consent before continuing", async () => {
  const legalStatus = { requiresAcceptance: true, version: "2026-01" };
  const { deps } = dependencies({ user: identity }, fakeDataClient({ legalStatus }));
  const middleware = createRequireAuth(deps);
  const { response, result } = responseRecorder();
  let nextCalled = false;

  await middleware(request("Bearer valid-token"), response, (() => { nextCalled = true; }) as NextFunction);

  assert.equal(result.statusCode, 403);
  assert.deepEqual(result.body, { error: "legal_consent_required", legalStatus });
  assert.equal(nextCalled, false);
});

test("passes only verified identity and a user-scoped data client to the next handler", async () => {
  const dataClient = fakeDataClient();
  const { deps, getVerifiedToken, getCreatedToken } = dependencies({ user: identity }, dataClient);
  const middleware = createRequireAuth(deps);
  const { response, result } = responseRecorder();
  let nextCalled = false;
  const req = request("Bearer valid-token") as AuthenticatedRequest;

  await middleware(req, response, (() => { nextCalled = true; }) as NextFunction);

  assert.equal(result.statusCode, undefined);
  assert.equal(nextCalled, true);
  assert.equal(getVerifiedToken(), "valid-token");
  assert.equal(getCreatedToken(), "valid-token");
  assert.deepEqual(req.authUser, identity);
  assert.equal(req.userSupabase, dataClient as never);
});
