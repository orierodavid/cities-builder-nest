"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type FeeMode = "fixed" | "percentage";
type FeeKey = "electricity" | "service_charge" | "rent_savings";
type FeeConfig = { enabled: boolean; mode: FeeMode; value: string };
type SettingsRow = {
  electricity_enabled: boolean; electricity_fee_mode: FeeMode; electricity_fee_value: number;
  service_charge_enabled: boolean; service_charge_fee_mode: FeeMode; service_charge_fee_value: number;
  rent_savings_enabled: boolean; rent_savings_fee_mode: FeeMode; rent_savings_fee_value: number;
};

const categories: { key: FeeKey; title: string; description: string; configurable: boolean }[] = [
  { key: "electricity", title: "Electricity vending", description: "Will apply to electricity purchases across every estate after electricity is moved to central payment checkout.", configurable: false },
  { key: "service_charge", title: "Service charges", description: "Applied to service-charge payments across every estate.", configurable: true },
  { key: "rent_savings", title: "Save for Rent", description: "Applied to every rent-savings contribution across every estate.", configurable: true },
];

function fromRow(row: SettingsRow): Record<FeeKey, FeeConfig> {
  return {
    electricity: { enabled: row.electricity_enabled, mode: row.electricity_fee_mode, value: row.electricity_fee_mode === "fixed" ? (Number(row.electricity_fee_value) / 100).toFixed(2) : (Number(row.electricity_fee_value) / 100).toFixed(2) },
    service_charge: { enabled: row.service_charge_enabled, mode: row.service_charge_fee_mode, value: row.service_charge_fee_mode === "fixed" ? (Number(row.service_charge_fee_value) / 100).toFixed(2) : (Number(row.service_charge_fee_value) / 100).toFixed(2) },
    rent_savings: { enabled: row.rent_savings_enabled, mode: row.rent_savings_fee_mode, value: row.rent_savings_fee_mode === "fixed" ? (Number(row.rent_savings_fee_value) / 100).toFixed(2) : (Number(row.rent_savings_fee_value) / 100).toFixed(2) },
  };
}

export default function PaymentFeeSettingsPanel() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [ready, setReady] = useState(false);
  const [fees, setFees] = useState<Record<FeeKey, FeeConfig>>({
    electricity: { enabled: false, mode: "fixed", value: "0" },
    service_charge: { enabled: false, mode: "fixed", value: "0" },
    rent_savings: { enabled: false, mode: "fixed", value: "0" },
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (active) { setError("Sign in again to manage platform settings."); setReady(true); } return; }
      const { data: roles, error: roleError } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      if (roleError) { if (active) { setError("Your administrator permissions could not be verified."); setReady(true); } return; }
      const admin = (roles || []).some((item) => item.role === "platform_admin");
      if (!active) return;
      setIsAdmin(admin);
      if (!admin) { setReady(true); return; }
      const { data, error: settingsError } = await supabase.from("platform_payment_fee_settings").select("*").eq("id", 1).single();
      if (settingsError || !data) setError("Global payment fee settings could not be loaded.");
      else setFees(fromRow(data as SettingsRow));
      setReady(true);
    })();
    return () => { active = false; };
  }, []);

  function change(key: FeeKey, patch: Partial<FeeConfig>) {
    setFees((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  }

  async function save() {
    setError(""); setSuccess("");
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const item of categories) {
      const fee = fees[item.key];
      const numeric = Number(fee.value);
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > (fee.mode === "fixed" ? 100000000 : 100)) {
        setError("Enter a valid non-negative fee for " + item.title + ". Percentage rates cannot exceed 100%.");
        return;
      }
      payload[item.key + "_enabled"] = fee.enabled;
      payload[item.key + "_fee_mode"] = fee.mode;
      payload[item.key + "_fee_value"] = Math.round(numeric * 100);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Your session has expired. Sign in again."); return; }
    payload.updated_by = user.id;
    setSaving(true);
    const { error: updateError } = await supabase.from("platform_payment_fee_settings").update(payload).eq("id", 1);
    if (updateError) setError("The global payment fees could not be saved. Check your Super Admin access and try again.");
    else setSuccess("Global payment fees saved. The same configuration applies to every estate for new eligible transactions.");
    setSaving(false);
  }

  if (!ready || !isAdmin) return null;

  return (
    <section className="panel module-panel" style={{ marginTop: 20 }}>
      <div className="module-toolbar">
        <div><h3>Global payment fees</h3><p>One configuration applies to every estate. Only Super Admins can change these rates.</p></div>
      </div>
      <div className="user-alert" style={{ marginBottom: 14 }}>
        Fees are stored separately from the payment principal. Residents must see the fee and total before confirming payment. Changes apply to new transactions only.
      </div>
      {error && <div className="user-alert user-alert-error" role="alert">{error}</div>}
      {success && <div className="user-alert user-alert-success" role="status">{success}</div>}
      <div style={{ display: "grid", gap: 14 }}>
        {categories.map((item) => {
          const fee = fees[item.key];
          return (
            <div key={item.key} style={{ border: "1px solid var(--border, #3A2E12)", borderRadius: 12, padding: 16, display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div><strong>{item.title}</strong><p style={{ margin: "4px 0 0", color: "var(--muted, #9A9A9A)", fontSize: 13 }}>{item.description}</p></div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
                  <input type="checkbox" checked={fee.enabled} disabled={!item.configurable} onChange={(event) => change(item.key, { enabled: event.target.checked })} />
                  Enabled
                </label>
              </div>
              <div className="user-form-grid">
                <label>Fee type
                  <select value={fee.mode} disabled={!item.configurable} onChange={(event) => change(item.key, { mode: event.target.value as FeeMode })}>
                    <option value="fixed">Fixed amount (NGN)</option>
                    <option value="percentage">Percentage (%)</option>
                  </select>
                </label>
                <label>{fee.mode === "fixed" ? "Fee amount (NGN)" : "Fee rate (%)"}
                  <input type="number" min="0" max={fee.mode === "fixed" ? "100000000" : "100"} step="0.01" value={fee.value} disabled={!item.configurable} onChange={(event) => change(item.key, { value: event.target.value })} />
                </label>
              </div>
              <small style={{ color: "var(--muted, #9A9A9A)" }}>{item.configurable ? "Applies identically to all estates. Set to zero or disable to collect no fee." : "Not active yet. Electricity currently uses direct vending, so no electricity fee can be collected safely until its checkout flow is converted."}</small>
            </div>
          );
        })}
      </div>
      <div className="user-form-actions"><button type="button" className="primary-action" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save global payment fees"}</button></div>
    </section>
  );
}
