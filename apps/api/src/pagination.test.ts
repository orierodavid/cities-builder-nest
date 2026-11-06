import assert from "node:assert/strict";
import test from "node:test";
import { getPageWindow, pageResult } from "./pagination.js";

test("uses a bounded default page window", () => {
  assert.deepEqual(getPageWindow({ query: {} } as never), {
    page: 1, pageSize: 50, from: 0, to: 50,
  });
});

test("parses page and pageSize while capping page size", () => {
  assert.deepEqual(getPageWindow({ query: { page: "3", pageSize: "500" } } as never), {
    page: 3, pageSize: 100, from: 200, to: 300,
  });
});

test("falls back safely for malformed query values", () => {
  assert.deepEqual(getPageWindow({ query: { page: "-1", pageSize: "all" } } as never), {
    page: 1, pageSize: 50, from: 0, to: 50,
  });
});

test("returns hasMore and the next page without leaking the lookahead row", () => {
  const window = getPageWindow({ query: { page: "2", pageSize: "2" } } as never);
  assert.deepEqual(pageResult(["a", "b", "c"], window), {
    items: ["a", "b"],
    pagination: { page: 2, pageSize: 2, hasMore: true, nextPage: 3 },
  });
});
