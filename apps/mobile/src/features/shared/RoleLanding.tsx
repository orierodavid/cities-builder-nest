import { Redirect } from "expo-router";

// Route groups are introduced without replacing the current authenticated
// application entry point. The existing auth/role gate remains authoritative
// until each feature screen is migrated into its dedicated route module.
export function RoleLanding() {
  return <Redirect href="/" />;
}
