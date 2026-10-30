"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type State = "checking" | "accepted" | "invalid";

export default function InvitationAcceptedPage() {
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState("Verifying your invitation…");

  useEffect(() => {
    let active = true;
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = async () => {
      const params = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const authError = params.get("error_description") || hash.get("error_description");
      if (authError) throw new Error(authError.replace(/\+/g, " "));

      let session = null;
      const tokenHash = params.get("token_hash");
      const code = params.get("code");
      const callbackType = params.get("type") || hash.get("type");

      if (tokenHash) {
        if (callbackType !== "invite") throw new Error("This is not a valid invitation link.");
        const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "invite" });
        if (error) throw error;
        session = data.session;
      } else if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        session = data.session;
      } else if (hash.get("access_token") && hash.get("refresh_token") && callbackType === "invite") {
        // Supabase's implicit-flow callback is consumed by detectSessionInUrl.
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        session = data.session;
      } else {
        throw new Error("This invitation link is missing its verification token. Ask your administrator to send a fresh invitation.");
      }

      if (!session?.user?.email || !session.user.email_confirmed_at) {
        throw new Error("Supabase did not confirm this email address. Ask your administrator to resend the invitation.");
      }

      if (!active) return;
      setState("accepted");
      setMessage("Your invitation has been verified. Redirecting you to sign in…");
      // Do not leave the temporary invitation session active. The user signs in
      // normally with the password supplied by the administrator.
      await supabase.auth.signOut();
      redirectTimer = setTimeout(() => {
        if (active) window.location.replace(new URL("/?invitation=accepted", window.location.origin).toString());
      }, 1400);
    };

    void finish().catch((error: unknown) => {
      if (!active) return;
      setMessage(error instanceof Error ? error.message : "We could not verify this invitation. Ask your administrator to send a fresh link.");
      setState("invalid");
    });

    return () => {
      active = false;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, []);

  return (
    <main className="invite-page">
      <section className="invite-card">
        <div className="invite-brand"><span>⌂</span><div><strong>CITIES BUILDER NEST</strong><small>COMMUNITY MANAGEMENT</small></div></div>
        <div className="invite-content">
          <div className={state === "accepted" ? "invite-mark" : state === "invalid" ? "invite-mark invite-mark-error" : "invite-mark invite-mark-loading"}>
            {state === "accepted" ? "✓" : state === "invalid" ? "!" : "…"}
          </div>
          <p className="invite-eyebrow">ACCOUNT INVITATION</p>
          <h1>{state === "accepted" ? "Invitation accepted" : state === "invalid" ? "Invitation not verified" : "Confirming your invitation"}</h1>
          <p className="invite-copy">{message}</p>
          {state === "invalid" && <a className="invite-login-link" href="/">Return to sign in</a>}
        </div>
        <footer className="invite-footer">© {new Date().getFullYear()} Cities Builder Nest</footer>
      </section>
    </main>
  );
}
