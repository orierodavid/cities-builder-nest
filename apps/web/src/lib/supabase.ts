import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const supabaseConfigured = Boolean(url && key);
export const supabase = createClient(url || "https://example.supabase.co", key || "missing-public-key", { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } });
