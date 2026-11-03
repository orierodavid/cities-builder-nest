export const Roles = {
  platformAdmin: "platform_admin",
  estateAdmin: "estate_admin",
  facilityManager: "facility_manager",
  resident: "resident",
  security: "security",
  eventOrganiser: "event_organiser",
} as const;

export type Role = typeof Roles[keyof typeof Roles];
export type MobileRole = typeof Roles.resident | typeof Roles.security | typeof Roles.eventOrganiser;
export const MOBILE_ROLES: readonly MobileRole[] = [Roles.resident, Roles.security, Roles.eventOrganiser];
export const isMobileRole = (role: string): role is MobileRole => MOBILE_ROLES.includes(role as MobileRole);
