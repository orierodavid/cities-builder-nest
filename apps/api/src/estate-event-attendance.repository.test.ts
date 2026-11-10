import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { getEstateEventAttendanceSummaries } from "./estate-event-attendance.repository.js";

test("attendance summaries use caller-scoped event access and isolated aggregate subqueries", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      return { rows: [{ event_id: "event-1", total_guests: 4, checked_in: 1, active_invitations: 3 }], rowCount: 1 } as unknown as QueryResult;
    },
  } as unknown as PoolClient;
  assert.deepEqual(await getEstateEventAttendanceSummaries(client, "estate-1", "creator-1", 20, 0), [{
    eventId: "event-1", totalGuests: 4, checkedIn: 1, activeInvitations: 3,
    outstanding: 3, attendancePercentage: 25,
  }]);
  assert.match(calls[0].sql, /e\.estate_id = \$1 AND e\.created_by = \$2/);
  assert.match(calls[0].sql, /FROM public\.estate_event_guests/);
  assert.match(calls[0].sql, /FROM public\.estate_event_checkins/);
  assert.match(calls[0].sql, /FROM public\.estate_event_invitations/);
  assert.deepEqual(calls[0].values, ["estate-1", "creator-1", 20, 0]);
});
