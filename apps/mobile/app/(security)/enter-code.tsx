import { Redirect } from "expo-router";
export default function SecurityEnterCodeRedirect() { return <Redirect href={"/(security)/verify" as never} />; }
