import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || "").trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "").trim();

function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !!url.hostname &&
      !["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname.toLowerCase()) &&
      !url.hostname.toLowerCase().endsWith(".local");
  } catch {
    return false;
  }
}

export const supabaseConfigurationError = !supabaseUrl
  ? "EXPO_PUBLIC_SUPABASE_URL is missing from apps/mobile/.env."
  : !isPublicHttpsUrl(supabaseUrl)
    ? "EXPO_PUBLIC_SUPABASE_URL must be a public HTTPS URL."
    : !supabaseAnonKey
      ? "EXPO_PUBLIC_SUPABASE_ANON_KEY is missing from apps/mobile/.env."
      : "";

export const supabaseConfigured = !supabaseConfigurationError;

// A placeholder client prevents module-import crashes, but the root layout
// blocks app startup and shows a clear configuration message when invalid.
export const supabase = createClient(
  isPublicHttpsUrl(supabaseUrl) ? supabaseUrl : "https://example.supabase.co",
  supabaseAnonKey || "missing-public-key",
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
