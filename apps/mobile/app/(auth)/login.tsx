// Authentication remains handled by the existing, verified sign-in flow at the app entry point.
import { Redirect } from "expo-router";
export default function LoginRoute() { return <Redirect href="/" />; }
