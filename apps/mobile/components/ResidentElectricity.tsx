import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { supabase } from "../lib/supabase";

type ElectricityCompany = { code: string; name: string };
type MeterValidation = {
  validationId: string;
  customerName: string | null;
  address: string | null;
  meterNumber: string;
  meterType: string;
  provider: string;
  outstandingDebt: number | null;
  expiresInSeconds: number;
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    const { data, error: requestError } = await supabase.functions.invoke("squad-electricity", { body });
    if (requestError || !data || data.error) {
      throw new Error("Electricity meter services are temporarily unavailable. Please try again.");
    }
    return data;
  }, []);

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const data = await invoke({ action: "providers" });
      const rows = Array.isArray(data.providers) ? data.providers as ElectricityCompany[] : [];
      setCompanies(rows);
      if (rows.length) setCompanyCode((current) => current || rows[0].code);
      if (!rows.length) setMessage("No electricity companies are currently available.");
    } catch {
      setCompanies([]);
      setMessage("Electricity companies could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  useEffect(() => { void loadCompanies(); }, [loadCompanies]);

  const validateMeter = async () => {
    if (!estateId) { setMessage("Select your estate first."); setError(true); return; }
    if (!/^\d{6,20}$/.test(meter.trim())) {
      setMessage("Enter a valid meter number (6–20 digits).");
      setError(true);
      return;
    }
    setBusy(true);
    setMessage("");
    setValidation(null);
    try {
      const data = await invoke({
        action: "lookup",
        estateId,
        discoCode: companyCode,
        meterNumber: meter.trim(),
        meterType,
      });
      setValidation(data as MeterValidation);
      setError(false);
      setMessage("Meter validated. Review the customer details below.");
    } catch {
      setError(true);
      setMessage("We could not validate this meter. Check the details and try again.");
    } finally {
      setBusy(false);
    }
  };

  const selectedCompany = companies.find((item) => item.code === companyCode);
  const label = { color: "#F1D28A", fontSize: 11, fontWeight: "800" as const, marginTop: 12, marginBottom: 6 };

  return (
    <View style={{ gap: 13, paddingBottom: 28, backgroundColor: "#080808" }}>
      <TouchableOpacity onPress={onBack}>
        <Text style={{ color: "#D4A84B", fontSize: 11, fontWeight: "900", paddingVertical: 5 }}>‹  BACK TO HOME</Text>
      </TouchableOpacity>
      <View style={card}>
        <Text style={{ color: "#D4A84B", fontSize: 10, fontWeight: "900", letterSpacing: 1.7 }}>RESIDENT UTILITIES</Text>
        <Text style={{ color: "#FFFFFF", fontSize: 25, fontWeight: "900", marginTop: 7 }}>Electricity</Text>
        <Text style={{ color: "#B9B9B9", fontSize: 12, lineHeight: 19, marginTop: 5 }}>
          Choose your electricity company and check the registered meter details.
        </Text>
      </View>
      <View style={card}>
        <Text style={{ color: "#D4A84B", fontSize: 11, fontWeight: "900", letterSpacing: 1 }}>1 · METER DETAILS</Text>
        <Text style={label}>Electricity company</Text>
        {loading ? <ActivityIndicator color="#D4A84B" /> : companies.length ? companies.map((company) => (
          <TouchableOpacity key={company.code} onPress={() => { setCompanyCode(company.code); setValidation(null); }}
            style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 12, marginBottom: 7, borderRadius: 9, borderWidth: 1, borderColor: companyCode === company.code ? "#D4A84B" : "#494133", backgroundColor: companyCode === company.code ? "#302719" : "#101010" }}>
            <Text style={{ color: companyCode === company.code ? "#F1D28A" : "#FFFFFF", fontSize: 12, fontWeight: "800" }}>{company.name}</Text>
          </TouchableOpacity>
        )) : <TouchableOpacity onPress={() => void loadCompanies()}><Text style={{ color: "#D4A84B" }}>TRY AGAIN</Text></TouchableOpacity>}
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
        <TextInput accessibilityLabel="Electricity meter number" value={meter}
          onChangeText={(value) => { setMeter(value.replace(/\D/g, "").slice(0, 20)); setValidation(null); }}
          keyboardType="number-pad" maxLength={20} placeholder="Enter meter number" placeholderTextColor="#777" style={field} />
        <TouchableOpacity onPress={() => void validateMeter()} disabled={busy || loading || !companyCode || meter.length < 6}
          style={{ minHeight: 48, borderRadius: 10, backgroundColor: "#D4A84B", alignItems: "center", justifyContent: "center", marginTop: 15, opacity: busy || loading || !companyCode || meter.length < 6 ? 0.55 : 1 }}>
          {busy ? <ActivityIndicator color="#17130B" /> : <Text style={{ color: "#17130B", fontSize: 12, fontWeight: "900" }}>CHECK METER</Text>}
        </TouchableOpacity>
      </View>
      {validation && (
        <View style={card}>
          <Text style={{ color: "#D4A84B", fontSize: 11, fontWeight: "900", letterSpacing: 1 }}>2 · REGISTERED METER DETAILS</Text>
          <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "900", marginTop: 10 }}>{validation.customerName || "Customer name unavailable"}</Text>
          {!!validation.address && <Text style={{ color: "#B9B9B9", fontSize: 12, marginTop: 4 }}>{validation.address}</Text>}
          <View style={{ height: 1, backgroundColor: "#3A3020", marginVertical: 12 }} />
          {[
            ["Electricity company", selectedCompany?.name || validation.provider],
            ["Meter number", validation.meterNumber],
            ["Meter type", validation.meterType],
            ...(validation.outstandingDebt != null ? [["Outstanding debt", money(Number(validation.outstandingDebt))]] : []),
          ].map(([key, value]) => (
            <View key={key} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, gap: 10 }}>
              <Text style={{ color: "#AFA89A", fontSize: 11 }}>{key}</Text>
              <Text style={{ color: "#F7F1E5", fontSize: 11, fontWeight: "800", flexShrink: 1, textAlign: "right" }}>{value}</Text>
            </View>
          ))}
          <Text style={{ color: "#B9B1A0", fontSize: 11, lineHeight: 18, marginTop: 15 }}>
            Electricity purchases are not available yet. You can use this screen to check your meter details.
          </Text>
        </View>
      )}
      {!!message && <View style={{ borderRadius: 10, padding: 12, backgroundColor: error ? "#2B1717" : "#17251B" }}>
        <Text style={{ color: error ? "#F28B82" : "#8ED6A5", fontSize: 11, lineHeight: 17 }}>{message}</Text>
      </View>}
    </View>
  );
}
