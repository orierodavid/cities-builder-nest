import HomeClient from "./HomeClient";
import LandingPage from "@/components/LandingPage";
import { getManagementAccess } from "@/lib/supabase/management";

export const dynamic = "force-dynamic";

export default async function Home() {
  const access = await getManagementAccess();
  if (access) return <HomeClient serverAuthorized />;
  return <LandingPage />;
}
