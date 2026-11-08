import { Redirect } from "expo-router";
export default function SecurityScanRedirect() { return <Redirect href={"/(security)/verify" as never} />; }
