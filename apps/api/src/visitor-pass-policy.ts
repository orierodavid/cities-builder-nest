export type VisitorPassMembership = {
  estate_id: string;
  membership_role: string;
  status: string;
} | null | undefined;

/** Only an active resident membership belonging to the requested estate may create a pass. */
export function canCreateVisitorPass(
  membership: VisitorPassMembership,
  requestedEstateId: string,
): boolean {
  return Boolean(
    membership &&
    membership.estate_id === requestedEstateId &&
    membership.membership_role === "resident" &&
    membership.status === "active",
  );
}
