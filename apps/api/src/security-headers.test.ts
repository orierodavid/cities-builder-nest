import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import { apiSecurityHeaders } from "./security-headers.js";

function responseRecorder() {
  const headers = new Map<string, string>([
    ["x-powered-by", "Express"],
    ["server", "test-server"],
  ]);
  const response = {
    setHeader(name: string, value: string) { headers.set(name.toLowerCase(), value); return this; },
    removeHeader(name: string) { headers.delete(name.toLowerCase()); return this; },
  };
  return { response: response as unknown as Response, headers };
}

test("sets defensive API response headers, removes identifying headers and disables caching", () => {
  const { response, headers } = responseRecorder();
  let nextCalled = false;
  apiSecurityHeaders({} as Request, response, (() => { nextCalled = true; }) as NextFunction);
  assert.equal(headers.has("x-powered-by"), false);
  assert.equal(headers.has("server"), false);
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.equal(headers.get("x-permitted-cross-domain-policies"), "none");
  assert.equal(headers.get("referrer-policy"), "no-referrer");
  assert.match(headers.get("content-security-policy") ?? "", /default-src 'none'/);
  assert.equal(headers.get("cache-control"), "no-store");
  assert.equal(nextCalled, true);
});

test("sets HSTS only for production API responses", () => {
  const original = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    const production = responseRecorder();
    apiSecurityHeaders({} as Request, production.response, (() => undefined) as NextFunction);
    assert.equal(production.headers.get("strict-transport-security"), "max-age=31536000");

    process.env.NODE_ENV = "test";
    const testResponse = responseRecorder();
    apiSecurityHeaders({} as Request, testResponse.response, (() => undefined) as NextFunction);
    assert.equal(testResponse.headers.has("strict-transport-security"), false);
  } finally {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  }
});
