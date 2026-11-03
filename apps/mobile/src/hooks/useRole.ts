import { isMobileRole, type MobileRole } from "../types/roles";

export function useRole(role: string | null | undefined) {
  const allowed = isMobileRole(role);
  return { role: allowed ? role as MobileRole : null, allowed, isResident: role === "resident", isSecurity: role === "security", isOrganiser: role === "event_organiser" };
}
