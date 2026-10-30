"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type State = "checking" | "accepted" | "invalid";

export default function InvitationAcceptedPage() {
  const [state, setState] = useState<State>("checking");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("Verifying your invitation…");

  useEffect(() => {
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const finish = async () => {
      const params = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const authError = params.get("error_description") || hash.get("error_description");

      if (authError) {
        if (active) {
          setMessage(decodeURIComponent(authError.replace(/\+/g, " ")));
          setState("invalid");
        }
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session?.user?.email) {
        setEmail(data.session.user.email);
        setState("accepted");
        return;
      }
      if (error) {
        setMessage("We could not verify this invitation. Please ask your estate administrator to send a new link.");
        setState("invalid");
        return;
      }
      timeout = setTimeout(() => {
        if (active) {
          setMessage("This invitation link may have expired or already been used. Please ask your estate administrator to send a new link.");
          setState("invalid");
        }
      }, 1800);
    };

    void finish();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active || !session?.user?.email) return;
      setEmail(session.user.email);
      setState("accepted");
    });

    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
      listener.subscription.unsubscribe();
    };
  }, []);

  const androidUrl = process.env.NEXT_PUBLIC_ANDROID_APP_URL;
  const iosUrl = process.env.NEXT_PUBLIC_IOS_APP_URL;

  return (
    <main className="invite-page">
      <section className="invite-card">
        <div className="invite-brand"><span>⌂</span><div><strong>CITIES BUILDER NEST</strong><small>COMMUNITY MANAGEMENT</small></div></div>
        {state === "checking" ? (
          <div className="invite-content">
            <div className="invite-mark invite-mark-loading">…</div>
            <p className="invite-eyebrow">ACCOUNT INVITATION</p>
            <h1>Confirming your invitation</h1>
            <p className="invite-copy">{message}</p>
          </div>
        ) : state === "accepted" ? (
          <div className="invite-content">
            <div className="invite-mark">✓</div>
            <p className="invite-eyebrow">INVITATION ACCEPTED</p>
            <h1>Your account is ready.</h1>
            <p className="invite-copy">Your Cities Builder Nest invitation has been accepted successfully. Download the mobile app and sign in using the email address and password provided by your administrator.</p>
            <div className="invite-account"><small>YOUR ACCOUNT EMAIL</small><strong>{email}</strong></div>
            <div className="invite-downloads">
              {androidUrl ? <a href={androidUrl} target="_blank" rel="noreferrer">Download for Android <span>↗</span></a> : <div className="invite-download-disabled">Android app download link will be available here.</div>}
              {iosUrl ? <a href={iosUrl} target="_blank" rel="noreferrer">Download for iPhone <span>↗</span></a> : <div className="invite-download-disabled">iPhone app download link will be available here.</div>}
            </div>
            <p className="invite-footnote">Keep your password private. If you have not received your login password, contact your estate administrator.</p>
          </div>
        ) : (
          <div className="invite-content">
            <div className="invite-mark invite-mark-error">!</div>
            <p className="invite-eyebrow">INVITATION NOT VERIFIED</p>
            <h1>This link could not be accepted.</h1>
            <p className="invite-copy">{message}</p>
            <p className="invite-footnote">For your security, invitation links can only be used once and may expire.</p>
          </div>
        )}
        <footer className="invite-footer">© {new Date().getFullYear()} Cities Builder Nest</footer>
      </section>
    </main>
  );
}
