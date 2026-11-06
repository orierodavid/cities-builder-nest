import { requireManagementAccess } from "@/lib/supabase/management";

export const dynamic = "force-dynamic";

export default async function ManagementLayout({ children }: { children: React.ReactNode }) {
  await requireManagementAccess();
  return children;
}
