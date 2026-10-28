export type GateMembership = {
  estate_id: string;
  membership_role: string;
  status: string;
} | null | undefined;

/** Gate operations require an active security membership in the exact requested estate. */
export function canUseGateWorkflow(
  membership: GateMembership,
  requestedEstateId: string,
): boolean {
  return Boolean(
    membership &&
    membership.estate_id === requestedEstateId &&
    membership.membership_role === "security" &&
    membership.status === "active",
  );
}
