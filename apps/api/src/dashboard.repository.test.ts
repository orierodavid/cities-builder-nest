import { describe, expect, it, vi } from "vitest";
import { getEstateDashboard } from "./dashboard.repository.js";
import type { PoolClient } from "pg";

function clientWith(results: unknown[][]): PoolClient {
  let index = 0;
  return {
    query: vi.fn(async () => ({ rows: results[index++] ?? [] })),
  } as unknown as PoolClient;
}

describe("getEstateDashboard", () => {
  it("returns scoped dashboard data and membership role", async () => {
    const db = clientWith([
      [{ role: "facility_manager" }],
      [{ membership_role: "facility_manager" }],
      [{ id: "e1", name: "Estate", address: "Road", city: "Lagos", state: "Lagos", timezone: "Africa/Lagos", is_enabled: true, disabled_at: null, disabled_reason: null }],
      [{ id: "a1", title: "Notice", body: "Body", published_at: "2026-01-01", created_at: "2026-01-01" }],
      [{ count: "4" }],
      [{ id: "m1", title: "Leak", status: "open", priority: "high", created_at: "2026-01-02" }],
      [{ count: "2" }],
      [{ count: "20" }],
      [{ count: "12" }],
    ]);
    const result = await getEstateDashboard(db, "u1", "e1");
    expect(result.estate?.membershipRole).toBe("facility_manager");
    expect(result.summary).toEqual({ units: 20, occupiedUnits: 12, openMaintenanceRequests: 2, publishedAnnouncements: 4 });
    expect(result.announcements).toHaveLength(1);
    expect(result.maintenanceRequests).toHaveLength(1);
  });

  it("allows a platform administrator without an estate membership", async () => {
    const db = clientWith([
      [{ role: "platform_admin" }], [], 
      [{ id: "e1", name: "Estate", address: "Road", city: "Lagos", state: "Lagos", timezone: "Africa/Lagos", is_enabled: true, disabled_at: null, disabled_reason: null }],
      [], [{ count: "0" }], [], [{ count: "0" }], [{ count: "0" }], [{ count: "0" }],
    ]);
    const result = await getEstateDashboard(db, "admin", "e1");
    expect(result.estate?.membershipRole).toBe("platform_admin");
  });

  it("does not return dashboard data without membership or platform role", async () => {
    const db = clientWith([
      [], [], 
      [{ id: "e1", name: "Estate", address: "Road", city: "Lagos", state: "Lagos", timezone: "Africa/Lagos", is_enabled: true, disabled_at: null, disabled_reason: null }],
      [], [{ count: "0" }], [], [{ count: "0" }], [{ count: "0" }], [{ count: "0" }],
    ]);
    const result = await getEstateDashboard(db, "outsider", "e1");
    expect(result.estate).toBeNull();
    expect(result.membershipFound).toBe(false);
  });
});
