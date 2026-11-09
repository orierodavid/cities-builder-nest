import { redirect } from "next/navigation";
import HomeClient from "../HomeClient";
import { getManagementAccess } from "@/lib/supabase/management";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const access = await getManagementAccess();
  if (access) redirect("/dashboard");
  return <HomeClient serverAuthorized={false} />;
}
