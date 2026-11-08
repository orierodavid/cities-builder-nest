import HomeClient from "./HomeClient";
import LandingPage from "@/components/LandingPage";
import { getManagementAccess } from "@/lib/supabase/management";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "CB Nest | Estate & Community Management",
  description: "CB Nest connects residents, security teams, event organisers and estate managers through one estate-management platform.",
};

export default async function Home() {
  const access = await getManagementAccess();
  if (access) return <HomeClient serverAuthorized />;
  return <LandingPage />;
}
