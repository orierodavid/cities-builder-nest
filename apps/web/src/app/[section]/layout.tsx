import type { Metadata } from "next";
import { requireManagementAccess } from "@/lib/supabase/management";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default async function ManagementLayout({ children }: { children: React.ReactNode }) {
  await requireManagementAccess();
  return children;
}
