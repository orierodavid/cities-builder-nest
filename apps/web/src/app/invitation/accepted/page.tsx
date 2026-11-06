"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type State = "checking" | "accepted" | "invalid" | "setup" | "saving" | "complete";

export default function InvitationAcceptedPage() {
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState("Verifying your invitation…");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setupFlow, setSetupFlow] = useState(false);

  useEffect(() => {
    let active = true;
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = async () => {
      const params = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const isPasswordSetup = params.get("flow") === "password_setup" || hash.get("flow") === "password_setup";
      const authError = params.get("error_description") || hash.get("error_description");
      if (authError) throw new Error(authError.replace(/\+/g, " "));

      let session = null;
      const tokenHash = params.get("token_hash");
      const code = params.get("code");
      const callbackType = params.get("type") || hash.get("type");

      if (tokenHash) {
        const type = callbackType === "recovery" ? "recovery" : "invite";
        const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (error) throw error;
        session = data.session;
      } else if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        session = data.session;
      } else if (hash.get("access_token") && hash.get("refresh_token")) {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        session = data.session;
      } else {
        throw new Error("This link is missing its verification token. Ask your administrator to send a fresh email.");
      }

      if (!session?.user?.email) throw new Error("We could not establish a valid account session. Ask your administrator to send a fresh link.");

      if (isPasswordSetup || callbackType === "recovery") {
        if (!active) return;
        setSetupFlow(true);
        setState("setup");
        setMessage("Choose a new password to activate or secure your account.");
        return;
      }

      if (!session.user.email_confirmed_at) {
        throw new Error("Your email address could not be verified. Ask your administrator to send a new invitation.");
      }

      if (!active) return;
      setState("accepted");
      setMessage("Your invitation has been verified. Redirecting you to sign in…");
      await supabase.auth.signOut();
      redirectTimer = setTimeout(() => {
        if (active) window.location.replace(new URL("/?invitation=accepted", window.location.origin).toString());
      }, 1400);
    };

    void finish().catch((error: unknown) => {
      if (!active) return;
      setMessage(error instanceof Error && /missing its verification token|could not establish a valid account session|could not be verified/i.test(error.message) ? error.message : "We could not verify this link. Ask your administrator to send a new invitation.");
      setState("invalid");
    });

    return () => {
      active = false;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, []);

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < 8) {
      setMessage("Use a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }
    setState("saving");
    setMessage("Updating your password…");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setState("setup");
      setMessage("Your password could not be updated. Please try again.");
      return;
    }
    setState("complete");
    setMessage("Your password has been set successfully. You can now sign in.");
    await supabase.auth.signOut();
  };

  return (
    <main className="invite-page">
      <section className="invite-card">
        <div className="invite-brand"><span>⌂</span><div><strong>CITIES BUILDER NEST</strong><small>COMMUNITY MANAGEMENT</small></div></div>
        <div className="invite-content">
          <div className={state === "accepted" || state === "complete" ? "invite-mark" : state === "invalid" ? "invite-mark invite-mark-error" : "invite-mark invite-mark-loading"}>
            {state === "accepted" || state === "complete" ? "✓" : state === "invalid" ? "!" : "…"}
          </div>
          <p className="invite-eyebrow">{setupFlow ? "SECURE ACCOUNT SETUP" : "ACCOUNT INVITATION"}</p>
          <h1>{state === "accepted" ? "Invitation accepted" : state === "invalid" ? "Link not verified" : state === "complete" ? "Password updated" : state === "setup" || state === "saving" ? "Set your password" : "Confirming your invitation"}</h1>
          <p className="invite-copy">{message}</p>
          {(state === "setup" || state === "saving") && (
            <form onSubmit={submitPassword} className="invite-password-form">
              <label htmlFor="new-password">New password</label>
              <input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
              <label htmlFor="confirm-password">Confirm password</label>
              <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              <button type="submit" className="invite-login-link" disabled={state === "saving"}>Save password</button>
            </form>
          )}
          {(state === "invalid" || state === "complete") && <a className="invite-login-link" href="/">Return to sign in</a>}
        </div>
        <footer className="invite-footer">© {new Date().getFullYear()} Cities Builder Nest</footer>
      </section>
    </main>
  );
}
