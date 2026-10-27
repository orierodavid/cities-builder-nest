export const MAINTENANCE_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type MaintenancePriority = (typeof MAINTENANCE_PRIORITIES)[number];

export type MaintenanceInput = {
  title: string;
  description: string;
  priority: MaintenancePriority;
  unitId: string | null;
};

export type MaintenanceValidation =
  | { ok: true; value: MaintenanceInput }
  | { ok: false; error: "invalid_maintenance_request" | "invalid_maintenance_priority" };

export function validateMaintenanceInput(body: unknown): MaintenanceValidation {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const priority = typeof input.priority === "string" ? input.priority : "normal";
  const unitId = typeof input.unitId === "string" && input.unitId.trim() ? input.unitId.trim() : null;

  if (title.length < 3 || title.length > 120 || description.length < 5 || description.length > 3000) {
    return { ok: false, error: "invalid_maintenance_request" };
  }
  if (!MAINTENANCE_PRIORITIES.includes(priority as MaintenancePriority)) {
    return { ok: false, error: "invalid_maintenance_priority" };
  }

  return {
    ok: true,
    value: { title, description, priority: priority as MaintenancePriority, unitId },
  };
}
