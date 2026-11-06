import { redirect } from "next/navigation";
import { createClient } from "./server";

export type ManagementAccess = {
  userId: string;
  email: string;
  role: "platform_admin" | "facility_manager";
};

export async function getManagementAccess(): Promise<ManagementAccess | null> {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return null;
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const [roleResult, membershipResult] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase.from("estate_memberships").select("membership_role")
      .eq("user_id", user.id).eq("status", "active"),
  ]);

  if (roleResult.error || membershipResult.error) return null;

  const isPlatformAdmin = (roleResult.data ?? []).some((row) => row.role === "platform_admin");
  const isEstateManager = (membershipResult.data ?? []).some((row) =>
    ["facility_manager", "estate_manager", "estate_admin"].includes(row.membership_role)
  );

  if (!isPlatformAdmin && !isEstateManager) return null;

  return {
    userId: user.id,
    email: user.email ?? "",
    role: isPlatformAdmin ? "platform_admin" : "facility_manager",
  };
}

export async function requireManagementAccess(): Promise<ManagementAccess> {
  const access = await getManagementAccess();
  if (!access) redirect("/");
  return access;
}
