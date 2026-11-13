import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { supabase } from "../lib/supabase";

type ElectricityCompany = { code: string; name: string; logoUrl?: string | null };
type MeterValidation = {
  validationId: string; customerName: string | null; address: string | null;
  meterNumber: string; meterType: string; provider: string;
  minimumVend: number | null; outstandingDebt: number | null; expiresAt: string;
};
type ElectricityTransaction = {
  id: string; provider: string; customer_identifier: string; merchant_reference: string;
  amount_kobo: number; status: string; receipt: Record<string, unknown> | null; created_at: string;
};
const money = (n: number) => new Intl.NumberFormat("en-NG", {
  style: "currency", currency: "NGN", maximumFractionDigits: 2,
}).format(n);
const card = { backgroundColor: "#171717", borderColor: "#3A3020", borderWidth: 1, borderRadius: 15, padding: 15 } as const;
const field = { minHeight: 47, borderWidth: 1, borderColor: "#494133", borderRadius: 10, paddingHorizontal: 12, color: "#FFFFFF", backgroundColor: "#101010", fontSize: 13 } as const;

export default function ResidentElectricity({ estateId, onBack }: { estateId: string; onBack: () => void }) {
  const [companies, setCompanies] = useState<ElectricityCompany[]>([]);
  const [companyCode, setCompanyCode] = useState("");
  const [meter, setMeter] = useState("");
  const [meterType, setMeterType] = useState<"prepaid" | "postpaid">("prepaid");
  const [validation, setValidation] = useState<MeterValidation | null>(null);
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [transactions, setTransactions] = useState<ElectricityTransaction[]>([]);
  const [tab, setTab] = useState<"buy" | "history">("buy");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<Record<string, unknown> | null>(null);

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    const { data, error: requestError } = await supabase.functions.invoke("squad-electricity", { body });
    if (requestError) {
      const context = (requestError as typeof requestError & { context?: Response }).context;
      const payload = context ? await context.clone().json().catch(() => null) as Record<string, unknown> | null : null;
      const detail = typeof payload?.message === "string" ? payload.message :
        typeof payload?.error === "string" ? payload.error.replace(/_/g, " ") : requestError.message;
      throw new Error(detail || "Electricity services are temporarily unavailable.");
    }
    if (!data) throw new Error("The electricity service returned an empty response. Please try again.");
    if (data.error) throw new Error(typeof data.message === "string" ? data.message : String(data.error).replace(/_/g, " "));
    return data;
  }, []);

  const loadCompanies = useCallback(async () => {
    setLoading(true); setMessage("");
    try {
      const data = await invoke({ action: "providers" });
      const rows = Array.isArray(data.providers) ? data.providers as ElectricityCompany[] : [];
      setCompanies(rows);
      if (rows.length) setCompanyCode((current) => rows.some((row) => row.code === current) ? current : rows[0].code);
      else setMessage("No electricity companies are currently available. Please retry.");
    } catch (cause) {
      setCompanies([]);
      setMessage(cause instanceof Error ? cause.message : "Electricity companies could not be loaded.");
    } finally { setLoading(false); }
  }, [invoke]);

  const loadHistory = useCallback(async () => {
    try {
      const data = await invoke({ action: "history" });
      setTransactions(Array.isArray(data.transactions) ? data.transactions as ElectricityTransaction[] : []);
    } catch (cause) {
      setError(true); setMessage(cause instanceof Error ? cause.message : "Transaction history could not be loaded.");
    }
  }, [invoke]);

  useEffect(() => { void loadCompanies(); }, [loadCompanies]);

  const validateMeter = async () => {
    if (!estateId) { setMessage("Select your estate first."); setError(true); return; }
    if (!/^\d{6,20}$/.test(meter.trim())) { setMessage("Enter a valid meter number (6–20 digits)."); setError(true); return; }
    setBusy(true); setMessage(""); setValidation(null); setLastReceipt(null);
    try {
      const data = await invoke({ action: "lookup", estateId, discoCode: companyCode, meterNumber: meter.trim(), meterType });
      setValidation(data as MeterValidation); setError(false);
      setMessage("Meter validated. Confirm the registered customer details before purchasing.");
    } catch (cause) {
      setError(true); setMessage(cause instanceof Error ? cause.message : "We could not validate this meter.");
    } finally { setBusy(false); }
  };

  const purchase = async () => {
    if (!validation) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 100 || Math.round(value * 100) !== value * 100) {
      setError(true); setMessage("Enter a valid purchase amount of at least ₦100."); return;
    }
    if (validation.minimumVend != null && value < validation.minimumVend) {
      setError(true); setMessage(`The minimum purchase for this meter is ${money(validation.minimumVend)}.`); return;
    }
    if (!/^\+?[0-9]{8,15}$/.test(phone.trim())) { setError(true); setMessage("Enter a valid phone number."); return; }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError(true); setMessage("Enter a valid email address."); return; }
    setBusy(true); setError(false); setMessage(""); setLastReceipt(null);
    try {
      const result = await invoke({ action: "vend", validationId: validation.validationId, amount: value, phone: phone.trim(), email: email.trim() });
      let tx = result.transaction as { merchantReference?: string; status?: string; receipt?: Record<string, unknown> };
      let currentStatus = String(tx?.status ?? "pending").toLowerCase();
      // Only poll a provider-accepted pending transaction. Never resubmit a vend.
      for (let attempt = 0; attempt < 6 && currentStatus === "pending" && tx?.merchantReference; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const checked = await invoke({ action: "status", merchantReference: tx.merchantReference });
        currentStatus = String(checked.transaction?.status ?? "pending").toLowerCase();
        tx = checked.transaction;
      }
      setValidation(null); setAmount(""); setTab("history"); await loadHistory();
      if (currentStatus === "successful") {
        setLastReceipt((tx?.receipt ?? null) as Record<string, unknown> | null);
        setMessage("Electricity purchase successful. Your token and receipt are shown below.");
        setError(false);
      } else if (currentStatus === "failed") {
        setMessage("Squad confirmed that the electricity purchase failed. Check transaction history before trying again.");
        setError(true);
      } else {
        setMessage("Your purchase is still processing. Do not pay again. Check its status in transaction history.");
        setError(false);
      }
    } catch (cause) {
      setError(true);
      setMessage(cause instanceof Error ? cause.message : "The purchase result is not confirmed. Check history before attempting another purchase.");
    } finally { setBusy(false); }
  };

  const checkStatus = async (reference: string) => {
    setBusy(true);
    try {
      const result = await invoke({ action: "status", merchantReference: reference });
      await loadHistory();
      const status = String(result.transaction?.status ?? "pending").toUpperCase();
      setError(false); setMessage(`Transaction status: ${status}`);
      if (status === "SUCCESSFUL" && result.transaction?.receipt) setLastReceipt(result.transaction.receipt);
    } catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : "Could not check transaction status."); }
    finally { setBusy(false); }
  };

  const selectedCompany = companies.find((item) => item.code === companyCode);
  const label = { color: "#F1D28A", fontSize: 11, fontWeight: "800" as const, marginTop: 12, marginBottom: 6 };
  const goldButton = { minHeight: 47, borderRadius: 10, backgroundColor: "#D4A84B", alignItems: "center" as const, justifyContent: "center" as const, marginTop: 14, paddingHorizontal: 12 };
  const receiptText = (key: string, value: unknown) => value == null || value === "" ? null : (
    <View key={key} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 5 }}>
      <Text style={{ color: "#AFA89A", fontSize: 11 }}>{key}</Text>
      <Text selectable style={{ color: "#F7F1E5", fontSize: 12, fontWeight: "800", flexShrink: 1, textAlign: "right" }}>{String(value)}</Text>
    </View>
  );

  return (
    <View style={{ gap: 13, paddingBottom: 28, backgroundColor: "#080808" }}>
      <TouchableOpacity onPress={onBack}><Text style={{ color: "#D4A84B", fontSize: 11, fontWeight: "900", paddingVertical: 5 }}>‹  BACK TO HOME</Text></TouchableOpacity>
      <View style={card}>
        <Text style={{ color: "#D4A84B", fontSize: 10, fontWeight: "900", letterSpacing: 1.7 }}>RESIDENT UTILITIES</Text>
        <Text style={{ color: "#FFFFFF", fontSize: 25, fontWeight: "900", marginTop: 7 }}>Electricity</Text>
        <Text style={{ color: "#B9B9B9", fontSize: 12, lineHeight: 19, marginTop: 5 }}>Buy electricity securely, verify your meter and keep every token and receipt.</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["buy", "history"] as const).map((item) => (
          <TouchableOpacity key={item} onPress={() => { setTab(item); if (item === "history") void loadHistory(); }}
            style={{ flex: 1, minHeight: 42, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: tab === item ? "#D4A84B" : "#171717" }}>
            <Text style={{ color: tab === item ? "#17130B" : "#D4A84B", fontSize: 11, fontWeight: "900" }}>{item === "buy" ? "BUY ELECTRICITY" : "TRANSACTION HISTORY"}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {tab === "buy" ? (
        <>
          <View style={card}>
            <Text style={{ color: "#D4A84B", fontSize: 11, fontWeight: "900", letterSpacing: 1 }}>1 · METER DETAILS</Text>
            <Text style={label}>Electricity distribution company</Text>
            {loading ? <ActivityIndicator color="#D4A84B" /> : companies.length ? companies.map((company) => (
              <TouchableOpacity key={company.code} onPress={() => { setCompanyCode(company.code); setValidation(null); }}
                style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 12, marginBottom: 7, borderRadius: 9, borderWidth: 1, borderColor: companyCode === company.code ? "#D4A84B" : "#494133", backgroundColor: companyCode === company.code ? "#302719" : "#101010" }}>
                <Text style={{ color: companyCode === company.code ? "#F1D28A" : "#FFFFFF", fontSize: 12, fontWeight: "800" }}>{company.name} ({company.code})</Text>
              </TouchableOpacity>
            )) : <TouchableOpacity onPress={() => void loadCompanies()}><Text style={{ color: "#D4A84B" }}>RETRY PROVIDERS</Text></TouchableOpacity>}
            <Text style={label}>Meter type</Text>
            <View style={{ flexDirection: "row", gap: 9 }}>
              {(["prepaid", "postpaid"] as const).map((item) => (
                <TouchableOpacity key={item} onPress={() => { setMeterType(item); setValidation(null); }}
                  style={{ flex: 1, minHeight: 43, borderRadius: 9, borderWidth: 1, borderColor: meterType === item ? "#D4A84B" : "#494133", backgroundColor: meterType === item ? "#302719" : "#101010", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: meterType === item ? "#F1D28A" : "#B9B9B9", fontWeight: "800", textTransform: "capitalize" }}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={label}>Meter number</Text>
            <TextInput accessibilityLabel="Electricity meter number" value={meter} onChangeText={(value) => { setMeter(value.replace(/\D/g, "").slice(0, 20)); setValidation(null); }}
              keyboardType="number-pad" maxLength={20} placeholder="Enter meter number" placeholderTextColor="#777" style={field} />
            <TouchableOpacity onPress={() => void validateMeter()} disabled={busy || loading || !companyCode || meter.length < 6} style={[goldButton, { opacity: busy || loading || !companyCode || meter.length < 6 ? 0.55 : 1 }]}>
              {busy ? <ActivityIndicator color="#17130B" /> : <Text style={{ color: "#17130B", fontSize: 12, fontWeight: "900" }}>VERIFY METER</Text>}
            </TouchableOpacity>
          </View>
          {validation && <View style={card}>
            <Text style={{ color: "#D4A84B", fontSize: 11, fontWeight: "900", letterSpacing: 1 }}>2 · VERIFIED METER</Text>
            <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "900", marginTop: 10 }}>{validation.customerName || "Customer name unavailable"}</Text>
            {!!validation.address && <Text style={{ color: "#B9B9B9", fontSize: 12, marginTop: 4 }}>{validation.address}</Text>}
            <View style={{ height: 1, backgroundColor: "#3A3020", marginVertical: 12 }} />
            {[
              ["Provider", selectedCompany?.name || validation.provider], ["Meter number", validation.meterNumber],
              ["Meter type", validation.meterType], ["Minimum purchase", validation.minimumVend == null ? "Not specified" : money(validation.minimumVend)],
              ...(validation.outstandingDebt != null ? [["Outstanding debt", money(validation.outstandingDebt)]] : []),
            ].map(([key, value]) => <View key={key} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, gap: 10 }}>
              <Text style={{ color: "#AFA89A", fontSize: 11 }}>{key}</Text><Text style={{ color: "#F7F1E5", fontSize: 11, fontWeight: "800", flexShrink: 1, textAlign: "right" }}>{value}</Text>
            </View>)}
            <Text style={label}>Purchase amount (NGN)</Text>
            <TextInput accessibilityLabel="Electricity purchase amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={validation.minimumVend ? String(validation.minimumVend) : "Enter amount"} placeholderTextColor="#777" style={field} />
            <Text style={label}>Phone number</Text>
            <TextInput accessibilityLabel="Purchase phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="080..." placeholderTextColor="#777" style={field} />
            <Text style={label}>Email (optional)</Text>
            <TextInput accessibilityLabel="Purchase email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="Email address" placeholderTextColor="#777" style={field} />
            <TouchableOpacity onPress={() => void purchase()} disabled={busy} style={[goldButton, { opacity: busy ? 0.55 : 1 }]}>
              {busy ? <ActivityIndicator color="#17130B" /> : <Text style={{ color: "#17130B", fontSize: 12, fontWeight: "900" }}>CONFIRM AND BUY</Text>}
            </TouchableOpacity>
            <Text style={{ color: "#AFA89A", fontSize: 10, lineHeight: 16, marginTop: 9 }}>Your meter verification expires after 15 minutes and can only be used once. Do not repeat a purchase while its status is pending.</Text>
          </View>}
        </>
      ) : <View style={card}>
        <Text style={{ color: "#D4A84B", fontSize: 11, fontWeight: "900" }}>ELECTRICITY TRANSACTIONS</Text>
        <TouchableOpacity onPress={() => void loadHistory()} style={{ paddingVertical: 9 }}><Text style={{ color: "#D4A84B", textAlign: "right", fontSize: 10, fontWeight: "900" }}>REFRESH HISTORY</Text></TouchableOpacity>
        {transactions.length ? transactions.map((item) => (
          <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: "#3A3020", paddingVertical: 12 }}>
            <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 12 }}>{item.provider} · {item.customer_identifier}</Text>
            <Text style={{ color: "#F1D28A", marginTop: 4 }}>{money(Number(item.amount_kobo) / 100)}</Text>
            <Text style={{ color: item.status === "successful" ? "#79D6A1" : item.status === "failed" ? "#F28B82" : "#F1D28A", fontSize: 10, fontWeight: "900", marginTop: 4 }}>{String(item.status).toUpperCase()}</Text>
            <Text style={{ color: "#999", fontSize: 10, marginTop: 4 }}>{new Date(item.created_at).toLocaleString()}</Text>
            {item.status === "pending" && <TouchableOpacity disabled={busy} onPress={() => void checkStatus(item.merchant_reference)} style={{ paddingTop: 8 }}><Text style={{ color: "#D4A84B", fontWeight: "900", fontSize: 10 }}>CHECK STATUS</Text></TouchableOpacity>}
            {item.receipt && receiptText("Token", item.receipt.token)}
            {item.receipt && receiptText("Units", item.receipt.units)}
            {item.receipt && receiptText("Receipt number", item.receipt.receiptNumber)}
          </View>
        )) : <Text style={{ color: "#B9B9B9", marginTop: 12 }}>No electricity purchases recorded yet.</Text>}
      </View>}
      {lastReceipt && <View style={card}>
        <Text style={{ color: "#79D6A1", fontWeight: "900", fontSize: 12 }}>ELECTRICITY TOKEN</Text>
        {receiptText("Token", lastReceipt.token)}
        {receiptText("Units", lastReceipt.units)}
        {receiptText("Receipt number", lastReceipt.receiptNumber)}
        {receiptText("Meter number", lastReceipt.meterNumber)}
      </View>}
      {!!message && <View style={{ borderRadius: 10, padding: 12, backgroundColor: error ? "#2B1717" : "#17251B" }}>
        <Text style={{ color: error ? "#F28B82" : "#8ED6A5", fontSize: 11, lineHeight: 17 }}>{message}</Text>
      </View>}
    </View>
  );
}
