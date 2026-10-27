import { validateMaintenanceInput, type MaintenanceInput } from "./maintenance-validation.js";

export type MaintenanceRepository<T> = {
  hasActiveMembership(estateId: string, userId: string): Promise<{ active: boolean; error?: boolean }>;
  insertRequest(estateId: string, userId: string, input: MaintenanceInput): Promise<{ data: T | null; error?: boolean }>;
};

export type MaintenanceSubmission<T> =
  | { status: 400; body: { error: string; message?: string } }
  | { status: 403; body: { error: string } }
  | { status: 201; body: { maintenanceRequest: T } };

export async function submitMaintenanceRequest<T>(
  estateId: string,
  userId: string,
  body: unknown,
  repository: MaintenanceRepository<T>,
): Promise<MaintenanceSubmission<T>> {
  const validation = validateMaintenanceInput(body);
  if (!validation.ok) {
    const message = validation.error === "invalid_maintenance_request"
      ? "Title must be 3–120 characters and description 5–3000 characters."
      : undefined;
    return { status: 400, body: { error: validation.error, ...(message ? { message } : {}) } };
  }

  const membership = await repository.hasActiveMembership(estateId, userId);
  if (membership.error) {
    return { status: 403, body: { error: "estate_membership_check_failed" } };
  }
  if (!membership.active) {
    return { status: 403, body: { error: "active_estate_membership_required" } };
  }

  const result = await repository.insertRequest(estateId, userId, validation.value);
  if (result.error || !result.data) {
    return { status: 400, body: { error: "maintenance_request_create_failed" } };
  }
  return { status: 201, body: { maintenanceRequest: result.data } };
}
