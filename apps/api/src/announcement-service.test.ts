import assert from "node:assert/strict";
import test from "node:test";
import { createAnnouncementDraft } from "./announcement-service.js";

const validBody = { title: "Water shutdown", body: "Water service will be interrupted on Saturday." };
function repository(role: string | null = "estate_manager") {
  const calls: unknown[][] = [];
  return {
    calls,
    repo: {
      async getActiveMembershipRole(estateId: string, userId: string) {
        calls.push(["membership", estateId, userId]);
        return { role };
      },
      async insertDraft(estateId: string, userId: string, input: { title: string; body: string }) {
        calls.push(["insert", estateId, userId, input]);
        return { data: { id: "announcement-1", estate_id: estateId, created_by: userId, ...input, published_at: null } };
      },
    },
  };
}

test("rejects invalid input before membership lookup", async () => {
  const r = repository();
  const result = await createAnnouncementDraft("estate-a", "user-a", { title: "x", body: "tiny" }, r.repo);
  assert.equal(result.status, 400);
  assert.equal(r.calls.length, 0);
});
test("rejects non-object input", async () => {
  const r = repository();
  const result = await createAnnouncementDraft("estate-a", "user-a", null, r.repo);
  assert.equal(result.status, 400);
  assert.equal(r.calls.length, 0);
});
test("requires active membership", async () => {
  const r = repository(null);
  const result = await createAnnouncementDraft("estate-a", "user-a", validBody, r.repo);
  assert.deepEqual(result, { status: 403, body: { error: "active_estate_membership_required" } });
});
test("fails closed on membership lookup errors", async () => {
  const result = await createAnnouncementDraft("estate-a", "user-a", validBody, {
    async getActiveMembershipRole() { return { role: null, error: true }; },
    async insertDraft() { assert.fail("must not insert after membership lookup error"); },
  });
  assert.deepEqual(result, { status: 403, body: { error: "estate_membership_check_failed" } });
});
test("denies non-manager roles", async () => {
  for (const role of ["resident", "facility_manager", "security", "finance_admin"]) {
    const r = repository(role);
    const result = await createAnnouncementDraft("estate-a", "user-a", validBody, r.repo);
    assert.deepEqual(result, { status: 403, body: { error: "announcement_management_role_required" } });
    assert.equal(r.calls.length, 1);
  }
});
test("manager creates draft using authenticated identity and ignores forged fields", async () => {
  const r = repository("estate_manager");
  const result = await createAnnouncementDraft("estate-a", "verified-user", {
    ...validBody, created_by: "attacker", published_at: "2026-01-01T00:00:00Z",
  }, r.repo);
  assert.equal(result.status, 201);
  assert.deepEqual(r.calls, [
    ["membership", "estate-a", "verified-user"],
    ["insert", "estate-a", "verified-user", validBody],
  ]);
});
test("estate admin can create draft", async () => {
  const r = repository("estate_admin");
  const result = await createAnnouncementDraft("estate-a", "admin-user", validBody, r.repo);
  assert.equal(result.status, 201);
});
test("fails when database insert fails", async () => {
  const result = await createAnnouncementDraft("estate-a", "user-a", validBody, {
    async getActiveMembershipRole() { return { role: "estate_admin" }; },
    async insertDraft() { return { data: null, error: true }; },
  });
  assert.deepEqual(result, { status: 400, body: { error: "announcement_create_failed" } });
});
test("rejects blank estate id", async () => {
  const r = repository();
  const result = await createAnnouncementDraft(" ", "user-a", validBody, r.repo);
  assert.deepEqual(result, { status: 400, body: { error: "invalid_estate_id" } });
  assert.equal(r.calls.length, 0);
});
