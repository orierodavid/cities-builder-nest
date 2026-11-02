"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Preferences = { essential: true; analytics: boolean; marketing: boolean; policy_version: string };
const KEY = "cbnest-cookie-preferences-v1";
const DEFAULTS: Preferences = { essential: true, analytics: false, marketing: false, policy_version: "1" };

function readPreferences(): Preferences | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    if (parsed.policy_version !== "1" || typeof parsed.analytics !== "boolean" || typeof parsed.marketing !== "boolean") return null;
    return { essential: true, analytics: parsed.analytics, marketing: parsed.marketing, policy_version: "1" };
  } catch { return null; }
}

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [manage, setManage] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const saved = readPreferences();
    if (saved) {
      setAnalytics(saved.analytics);
      setMarketing(saved.marketing);
    } else setVisible(true);

    const syncForSignedInUser = async () => {
      const preferences = readPreferences();
      if (!preferences) return;
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      await supabase.from("cookie_preferences").upsert({
        user_id: userData.user.id,
        essential: true,
        analytics: preferences.analytics,
        marketing: preferences.marketing,
        policy_version: preferences.policy_version,
        updated_at: new Date().toISOString(),
      });
    };
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => { void syncForSignedInUser(); }, 0);
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  async function save(next: Preferences) {
    localStorage.setItem(KEY, JSON.stringify(next));
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = "cbnest_cookie_preferences=" + encodeURIComponent(JSON.stringify(next)) + "; Path=/; Max-Age=15552000; SameSite=Lax" + secure;
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      await supabase.from("cookie_preferences").upsert({
        user_id: userData.user.id,
        essential: true,
        analytics: next.analytics,
        marketing: next.marketing,
        policy_version: next.policy_version,
        updated_at: new Date().toISOString(),
      });
    }
    setAnalytics(next.analytics);
    setMarketing(next.marketing);
    setVisible(false);
    setManage(false);
  }

  if (!visible) return null;
  return <aside className="cookie-banner" aria-label="Cookie preferences">
    <div className="cookie-copy"><strong>Privacy and cookie choices</strong><p>Essential storage keeps sign-in and security features working. Optional analytics and marketing cookies stay off unless you choose to allow them. No optional tracking is enabled by this banner alone.</p></div>
    {manage ? <div className="cookie-preferences">
      <label><input type="checkbox" checked readOnly disabled/> Essential (always active)</label>
      <label><input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)}/> Optional analytics</label>
      <label><input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)}/> Optional marketing</label>
      <button onClick={() => void save({ essential: true, analytics, marketing, policy_version: "1" })}>Save preferences</button>
    </div> : <div className="cookie-actions">
      <button onClick={() => void save({ ...DEFAULTS, analytics: true, marketing: true })}>Accept All</button>
      <button className="cookie-secondary" onClick={() => void save(DEFAULTS)}>Reject Optional</button>
      <button className="cookie-text" onClick={() => setManage(true)}>Manage Preferences</button>
    </div>}
  </aside>;
}
