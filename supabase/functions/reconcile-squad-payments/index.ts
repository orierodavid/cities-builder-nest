import { createClient } from "npm:@supabase/supabase-js@2";

type PaymentRow = {
  id: string;
  amount_kobo: number | string;
  currency: string;
  status: string;
  resident_user_id: string;
  provider_reference: string;
  created_at: string;
  last_reconciled_at: string | null;
};

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function verifyPayment(base: string, secret: string, reference: string) {
  const response = await fetch(
    `${base}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error("provider_verification_unavailable");
  const payload = await response.json();
  if (!payload?.success || !payload?.data) throw new Error("provider_verification_invalid");
  return payload.data as Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const expectedSecret = Deno.env.get("PAYMENT_RECONCILIATION_SECRET") ?? "";
  const suppliedSecret = req.headers.get("x-reconciliation-secret") ?? "";
  if (!expectedSecret) return reply(503, { error: "reconciliation_not_configured" });
  if (!safeEqual(suppliedSecret, expectedSecret)) return reply(401, { error: "unauthorized" });

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const squadSecret = Deno.env.get("SQUAD_SECRET_KEY");
  const mode = Deno.env.get("SQUAD_ENVIRONMENT") ?? "sandbox";
  if (!url || !service || !squadSecret || !["sandbox", "live"].includes(mode)) {
    return reply(503, { error: "payment_reconciliation_not_configured" });
  }

  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const base = mode === "live" ? "https://api-d.squadco.com" : "https://sandbox-api-d.squadco.com";
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 5 * 60_000).toISOString();
  const retryBefore = new Date(now.getTime() - 15 * 60_000).toISOString();
  const attemptedAt = now.toISOString();

  const tables = ["service_charge_payments", "rent_savings_contributions"] as const;
  const totals = { scanned: 0, successful: 0, failed: 0, stillPending: 0, mismatched: 0, unavailable: 0 };

  for (const table of tables) {
    const { data, error } = await admin
      .from(table)
      .select("id,amount_kobo,currency,status,resident_user_id,provider_reference,created_at,last_reconciled_at")
      .eq("status", "pending")
      .lt("created_at", staleBefore)
      .or(`last_reconciled_at.is.null,last_reconciled_at.lt.${retryBefore}`)
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) return reply(503, { error: "pending_payment_lookup_failed" });

    for (const row of (data ?? []) as PaymentRow[]) {
      totals.scanned += 1;
      let verified: Record<string, unknown>;
      try {
        verified = await verifyPayment(base, squadSecret, row.provider_reference);
      } catch {
        totals.unavailable += 1;
        await admin.from(table).update({ last_reconciled_at: attemptedAt }).eq("id", row.id).eq("status", "pending");
        continue;
      }

      const status = String(verified.transaction_status ?? "").toLowerCase();
      const amount = Number(verified.transaction_amount ?? verified.amount);
      const currency = String(verified.transaction_currency_id ?? verified.currency ?? "").toUpperCase();
      const reference = String(verified.transaction_ref ?? "");
      const ledgerAmount = Number(row.amount_kobo);

      const { data: authUser, error: userError } = await admin.auth.admin.getUserById(row.resident_user_id);
      const emailMatches = !userError && Boolean(authUser.user?.email) &&
        String(verified.email ?? "").toLowerCase() === authUser.user!.email!.toLowerCase();

      if (!Number.isSafeInteger(amount) || amount <= 0 ||
          !Number.isSafeInteger(ledgerAmount) || ledgerAmount <= 0 ||
          amount !== ledgerAmount || currency !== "NGN" ||
          reference !== row.provider_reference || !emailMatches ||
          !["success", "failed", "abandoned", "pending"].includes(status)) {
        totals.mismatched += 1;
        await admin.from(table).update({ last_reconciled_at: attemptedAt }).eq("id", row.id).eq("status", "pending");
        continue;
      }

      if (status === "success") {
        const { data: updated, error: updateError } = await admin
          .from(table)
          .update({ status: "successful", provider: "squad", verified_at: attemptedAt, last_reconciled_at: attemptedAt })
          .eq("id", row.id)
          .eq("status", "pending")
          .select("id")
          .maybeSingle();
        if (updateError) return reply(500, { error: "payment_ledger_update_failed" });
        if (updated) totals.successful += 1;
      } else if (status === "failed" || status === "abandoned") {
        const { data: updated, error: updateError } = await admin
          .from(table)
          .update({ status: "failed", last_reconciled_at: attemptedAt })
          .eq("id", row.id)
          .eq("status", "pending")
          .select("id")
          .maybeSingle();
        if (updateError) return reply(500, { error: "payment_ledger_update_failed" });
        if (updated) totals.failed += 1;
      } else {
        const { error: updateError } = await admin
          .from(table)
          .update({ last_reconciled_at: attemptedAt })
          .eq("id", row.id)
          .eq("status", "pending");
        if (updateError) return reply(500, { error: "payment_ledger_update_failed" });
        totals.stillPending += 1;
      }
    }
  }

  return reply(200, { received: true, ...totals });
});
