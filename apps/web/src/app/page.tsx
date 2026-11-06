import HomeClient from "./HomeClient";
import { getManagementAccess } from "@/lib/supabase/management";

export const dynamic = "force-dynamic";

export default async function Home() {
  const access = await getManagementAccess();
  return <HomeClient serverAuthorized={Boolean(access)} />;
}
