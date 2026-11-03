export const APP_ROLES = {
  resident: "resident",
  security: "security",
  organiser: "event_organiser",
  estateAdmin: "estate_admin",
  facilityManager: "facility_manager",
  platformAdmin: "platform_admin",
} as const;

export type MobileRole = typeof APP_ROLES.resident | typeof APP_ROLES.security | typeof APP_ROLES.organiser;
export type AppRole = typeof APP_ROLES[keyof typeof APP_ROLES];

export function isMobileRole(role: string | null | undefined): role is MobileRole {
  return role === APP_ROLES.resident || role === APP_ROLES.security || role === APP_ROLES.organiser;
}
