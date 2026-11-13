import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { supabase } from "../lib/supabase";

type Provider = { code: string; name: string };
type Bouquet = { code: string; name: string; kobo_amount?: number; amount_kobo?: number; amount?: number; price?: number; currency?: string };
type Validation = { validationId: string; customerName?: string | null; customerIdentifier: string; expiresAt: string };
type Tx = { id: string; service?: string; provider: string; customer_identifier: string; merchant_reference: string; product_code?: string | null; amount_kobo: number; status: string; receipt?: unknown; created_at: string };
const card = { backgroundColor: "#171717", borderColor: "#3A3020", borderWidth: 1, borderRadius: 15, padding: 15 } as const;
const field = { minHeight: 47, borderWidth: 1, borderColor: "#494133", borderRadius: 10, paddingHorizontal: 12, color: "#FFFFFF", backgroundColor: "#101010", fontSize: 13 } as const;
const money = (n: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(n);

export default function ResidentCableTV({ estateId, onBack }: { estateId: string; onBack: () => void }) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [provider, setProvider] = useState("");
  const [bouquets, setBouquets] = useState<Bouquet[]>([]);
  const [bouquet, setBouquet] = useState("");
  const [smartcard, setSmartcard] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [validation, setValidation] = useState<Validation | null>(null);
  const [history, setHistory] = useState<Tx[]>([]);
  const [tab, setTab] = useState<"buy" | "history">("buy");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    const { data, error: requestError } = await supabase.functions.invoke("squad-utilities", { body: { service: "cable_tv", ...body } });
    if (requestError) {
      const context = (requestError as typeof requestError & { context?: Response }).context;
      const payload = context ? await context.clone().json().catch(() => null) as Record<string, unknown> | null : null;
      throw new Error(typeof payload?.message === "string" ? payload.message : requestError.message);
    }
    if (!data) throw new Error("Cable TV service returned an empty response.");
    if (data.error) throw new Error(typeof data.message === "string" ? data.message : String(data.error).replace(/_/g, " "));
    return data;
  }, []);

  const loadProviders = useCallback(async () => {
    setLoading(true); setMessage("");
    try {
      const data = await invoke({ action: "billers" });
      const rows = Array.isArray(data.billers) ? data.billers as Provider[] : [];
      setProviders(rows);
      if (rows.length) setProvider(current => rows.some(x => x.code === current) ? current : rows[0].code);
      else setMessage("No cable providers are currently available. Please retry.");
    } catch (e) {
      setProviders([]);
      setMessage(e instanceof Error ? e.message : "Cable providers could not be loaded.");
    } finally { setLoading(false); }
  }, [invoke]);

  const loadBouquets = useCallback(async (code: string) => {
    if (!code) { setBouquets([]); return; }
    setLoading(true); setBouquets([]); setBouquet("");
    try {
      const data = await invoke({ action: "products", provider: code });
      const rows = Array.isArray(data.products) ? data.products as Bouquet[] : [];
      setBouquets(rows.filter(x => x.code && x.name));
      if (!rows.length) setMessage("No subscription packages are available for this provider.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Subscription packages could not be loaded.");
    } finally { setLoading(false); }
  }, [invoke]);

  const loadHistory = useCallback(async () => {
    try {
      const data = await invoke({ action: "history" });
      setHistory((Array.isArray(data.transactions) ? data.transactions as Tx[] : []).filter(x => x.service === "cable_tv"));
    } catch (e) { setError(true); setMessage(e instanceof Error ? e.message : "Transaction history could not be loaded."); }
  }, [invoke]);

  useEffect(() => { void loadProviders(); }, [loadProviders]);
  useEffect(() => { if (provider) void loadBouquets(provider); }, [provider, loadBouquets]);

  const selectedBouquet = useMemo(() => bouquets.find(x => x.code === bouquet), [bouquets, bouquet]);
  const rawSelectedAmount = selectedBouquet ? Number(selectedBouquet.kobo_amount ?? selectedBouquet.amount_kobo ?? selectedBouquet.amount ?? selectedBouquet.price ?? 0) : 0;
  const amount = selectedBouquet ? rawSelectedAmount / (selectedBouquet.kobo_amount != null || selectedBouquet.amount_kobo != null ? 100 : 1) : 0;
  const label = { color: "#F1D28A", fontSize: 11, fontWeight: "800" as const, marginTop: 12, marginBottom: 6 };
  const button = { minHeight: 47, borderRadius: 10, backgroundColor: "#D4A84B", alignItems: "center" as const, justifyContent: "center" as const, marginTop: 14, paddingHorizontal: 12 };

  const verify = async () => {
    if (!estateId || !provider || !/^\d{8,12}$/.test(smartcard.trim())) { setError(true); setMessage("Enter a valid smartcard or IUC number."); return; }
    setBusy(true); setValidation(null); setMessage("");
    try {
      const data = await invoke({ action: "lookup", estateId, provider, customerIdentifier: smartcard.trim() });
      setValidation(data as Validation); setError(false); setMessage("Decoder verified. Confirm the customer name before subscribing.");
    } catch (e) { setError(true); setMessage(e instanceof Error ? e.message : "Smartcard verification failed."); }
    finally { setBusy(false); }
  };

  const purchase = async () => {
    if (!validation || !selectedBouquet || !amount) return;
    if (!/^\+?[0-9]{8,15}$/.test(phone.trim())) { setError(true); setMessage("Enter a valid phone number."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError(true); setMessage("Enter a valid email address."); return; }
    setBusy(true); setMessage(""); setError(false);
    try {
      const result = await invoke({ action: "vend", validationId: validation.validationId, productCode: selectedBouquet.code, phone: phone.trim(), email: email.trim() });
      const tx = result.transaction as { merchantReference?: string; status?: string };
      let status = String(tx?.status ?? "pending").toLowerCase();
      for (let i = 0; i < 5 && status === "pending" && tx?.merchantReference; i++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const checked = await invoke({ action: "status", merchantReference: tx.merchantReference });
        status = String(checked.transaction?.status ?? "pending").toLowerCase();
      }
      setValidation(null); setSmartcard(""); setTab("history"); await loadHistory();
      setError(status === "failed");
      setMessage(status === "successful" ? "Cable TV subscription successful." : status === "failed" ? "The subscription failed. Check transaction history before retrying." : "Subscription is processing. Do not submit it again; check transaction history.");
    } catch (e) {
      setError(true); setMessage(e instanceof Error ? e.message : "The result is not confirmed. Check history before retrying.");
    } finally { setBusy(false); }
  };

  return (
    <View style={{ gap: 13, paddingBottom: 28, backgroundColor: "#080808" }}>
      <TouchableOpacity onPress={onBack}><Text style={{ color: "#D4A84B", fontSize: 11, fontWeight: "900", paddingVertical: 5 }}>‹  BACK TO UTILITIES</Text></TouchableOpacity>
      <View style={card}>
        <Text style={{ color: "#D4A84B", fontSize: 10, fontWeight: "900", letterSpacing: 1.7 }}>RESIDENT UTILITIES</Text>
        <Text style={{ color: "#FFFFFF", fontSize: 25, fontWeight: "900", marginTop: 7 }}>Cable TV</Text>
        <Text style={{ color: "#B9B9B9", fontSize: 12, lineHeight: 19, marginTop: 5 }}>Verify your decoder, choose a subscription and keep your receipts.</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["buy", "history"] as const).map(item => <TouchableOpacity key={item} onPress={() => { setTab(item); if (item === "history") void loadHistory(); }} style={{ flex: 1, minHeight: 42, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: tab === item ? "#D4A84B" : "#171717" }}>
          <Text style={{ color: tab === item ? "#17130B" : "#D4A84B", fontSize: 11, fontWeight: "900" }}>{item === "buy" ? "SUBSCRIBE" : "TRANSACTION HISTORY"}</Text>
        </TouchableOpacity>)}
      </View>
      {tab === "buy" ? <View style={card}>
        <Text style={{ color: "#D4A84B", fontSize: 11, fontWeight: "900" }}>1 · PROVIDER AND DECODER</Text>
        <Text style={label}>Cable provider</Text>
        {loading && !providers.length ? <ActivityIndicator color="#D4A84B" /> : providers.length ? providers.map(item => <TouchableOpacity key={item.code} onPress={() => { setProvider(item.code); setValidation(null); }} style={{ minHeight: 43, justifyContent: "center", paddingHorizontal: 12, marginBottom: 7, borderRadius: 9, borderWidth: 1, borderColor: provider === item.code ? "#D4A84B" : "#494133", backgroundColor: provider === item.code ? "#302719" : "#101010" }}>
          <Text style={{ color: provider === item.code ? "#F1D28A" : "#FFFFFF", fontWeight: "800", fontSize: 12 }}>{item.name}</Text>
        </TouchableOpacity>) : <TouchableOpacity onPress={() => void loadProviders()}><Text style={{ color: "#D4A84B" }}>RETRY PROVIDERS</Text></TouchableOpacity>}
        <Text style={label}>Smartcard / IUC number</Text>
        <TextInput accessibilityLabel="Cable TV smartcard number" value={smartcard} onChangeText={v => { setSmartcard(v.replace(/\D/g, "").slice(0, 12)); setValidation(null); }} keyboardType="number-pad" placeholder="Enter decoder number" placeholderTextColor="#777" style={field} />
        <TouchableOpacity onPress={() => void verify()} disabled={busy || loading || !provider || smartcard.length < 8} style={[button, { opacity: busy || loading || !provider || smartcard.length < 8 ? 0.55 : 1 }]}>
          {busy ? <ActivityIndicator color="#17130B" /> : <Text style={{ color: "#17130B", fontSize: 12, fontWeight: "900" }}>VERIFY DECODER</Text>}
        </TouchableOpacity>
        {validation && <>
          <View style={{ height: 1, backgroundColor: "#3A3020", marginVertical: 14 }} />
          <Text style={{ color: "#D4A84B", fontSize: 11, fontWeight: "900" }}>2 · CONFIRM CUSTOMER</Text>
          <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "900", marginTop: 9 }}>{validation.customerName || "Customer name unavailable"}</Text>
          <Text style={{ color: "#B9B9B9", fontSize: 11, marginTop: 4 }}>Smartcard: {validation.customerIdentifier}</Text>
          <Text style={label}>Subscription package</Text>
          {loading ? <ActivityIndicator color="#D4A84B" /> : bouquets.length ? bouquets.map(item => {
            const raw = Number(item.kobo_amount ?? item.amount_kobo ?? item.amount ?? item.price ?? 0);
            const price = raw / (item.kobo_amount != null || item.amount_kobo != null ? 100 : 1);
            return <TouchableOpacity key={item.code} onPress={() => setBouquet(item.code)} style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 12, marginBottom: 7, borderRadius: 9, borderWidth: 1, borderColor: bouquet === item.code ? "#D4A84B" : "#494133", backgroundColor: bouquet === item.code ? "#302719" : "#101010" }}>
              <Text style={{ color: bouquet === item.code ? "#F1D28A" : "#FFFFFF", fontSize: 12, fontWeight: "800", flex: 1 }}>{item.name}</Text>
              <Text style={{ color: "#F1D28A", fontSize: 12, fontWeight: "900" }}>{price ? money(price) : "Price unavailable"}</Text>
            </TouchableOpacity>;
          }) : <Text style={{ color: "#B9B9B9", fontSize: 11 }}>No packages are available. Change provider or retry.</Text>}
          <Text style={label}>Phone number</Text>
          <TextInput accessibilityLabel="Cable subscription phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="080..." placeholderTextColor="#777" style={field} />
          <Text style={label}>Email address</Text>
          <TextInput accessibilityLabel="Cable subscription email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="Email address" placeholderTextColor="#777" style={field} />
          {!!selectedBouquet && <Text style={{ color: "#F1D28A", fontWeight: "900", marginTop: 12 }}>Total: {money(amount)}</Text>}
          <TouchableOpacity onPress={() => void purchase()} disabled={busy || !selectedBouquet || !phone || !email} style={[button, { opacity: busy || !selectedBouquet || !phone || !email ? 0.55 : 1 }]}>
            {busy ? <ActivityIndicator color="#17130B" /> : <Text style={{ color: "#17130B", fontSize: 12, fontWeight: "900" }}>CONFIRM SUBSCRIPTION</Text>}
          </TouchableOpacity>
          <Text style={{ color: "#AFA89A", fontSize: 10, lineHeight: 16, marginTop: 9 }}>Decoder verification is single-use. If a purchase is processing, do not submit it again.</Text>
        </>}
      </View> : <View style={card}>
        <Text style={{ color: "#D4A84B", fontSize: 11, fontWeight: "900" }}>CABLE TV TRANSACTIONS</Text>
        <TouchableOpacity onPress={() => void loadHistory()} style={{ paddingVertical: 9 }}><Text style={{ color: "#D4A84B", textAlign: "right", fontSize: 10, fontWeight: "900" }}>REFRESH HISTORY</Text></TouchableOpacity>
        {history.length ? history.map(item => <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: "#3A3020", paddingVertical: 12 }}>
          <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 12 }}>{item.provider} · {item.customer_identifier}</Text>
          <Text style={{ color: "#F1D28A", marginTop: 4 }}>{money(Number(item.amount_kobo) / 100)}</Text>
          <Text style={{ color: item.status === "successful" ? "#79D6A1" : item.status === "failed" ? "#F28B82" : "#F1D28A", fontSize: 10, fontWeight: "900", marginTop: 4 }}>{item.status.toUpperCase()}</Text>
          <Text style={{ color: "#999", fontSize: 10, marginTop: 4 }}>{new Date(item.created_at).toLocaleString()}</Text>
          {item.status === "pending" && <TouchableOpacity disabled={busy} onPress={async () => { setBusy(true); try { await invoke({ action: "status", merchantReference: item.merchant_reference }); await loadHistory(); setError(false); setMessage("Transaction status refreshed."); } catch (e) { setError(true); setMessage(e instanceof Error ? e.message : "Could not check status."); } finally { setBusy(false); } }} style={{ paddingTop: 8 }}><Text style={{ color: "#D4A84B", fontWeight: "900", fontSize: 10 }}>CHECK STATUS</Text></TouchableOpacity>}
        </View>) : <Text style={{ color: "#B9B9B9", marginTop: 12 }}>No cable TV subscriptions recorded yet.</Text>}
      </View>}
      {!!message && <View style={{ borderRadius: 10, padding: 12, backgroundColor: error ? "#2B1717" : "#17251B" }}><Text style={{ color: error ? "#F28B82" : "#8ED6A5", fontSize: 11, lineHeight: 17 }}>{message}</Text></View>}
    </View>
  );
}
