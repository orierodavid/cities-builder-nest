import type { Metadata } from "next";
import { redirect } from "next/navigation";
import HomeClient from "../HomeClient";
import { getManagementAccess } from "@/lib/supabase/management";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Management Login",
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  const access = await getManagementAccess();
  if (access) redirect("/dashboard");
  return <HomeClient serverAuthorized={false} />;
}
