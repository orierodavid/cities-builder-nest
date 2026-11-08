import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, AppState, SafeAreaView, Text, TouchableOpacity, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { WebView, WebViewNavigation } from "react-native-webview";
import { supabase } from "../src/lib/supabase";

type PaymentStatus = "pending" | "successful" | "failed" | "reversed" | "unknown";

export default function PaymentCheckoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ checkoutUrl?: string; reference?: string; paymentType?: string }>();
  const checkoutUrl = typeof params.checkoutUrl === "string" ? params.checkoutUrl : "";
  const reference = typeof params.reference === "string" ? params.reference : "";
  const paymentType = params.paymentType === "rent_savings" ? "rent_savings" : "service_charge";
  const [checkoutVisible, setCheckoutVisible] = useState(true);
  const [status, setStatus] = useState<PaymentStatus>("pending");
  const [checking, setChecking] = useState(false);
  const [pageError, setPageError] = useState("");

  const safeCheckoutUrl = useMemo(() => {
    try {
      const parsed = new URL(checkoutUrl);
      return parsed.protocol === "https:" && parsed.hostname.toLowerCase().endsWith("squadco.com");
    } catch {
      return false;
    }
  }, [checkoutUrl]);

  const checkPayment = useCallback(async () => {
    if (!reference) return;
    setChecking(true);
    const table = paymentType === "rent_savings" ? "rent_savings_contributions" : "service_charge_payments";
    const { data, error } = await supabase.from(table).select("status").eq("provider_reference", reference).maybeSingle();
    if (!error && data?.status) {
      const next = String(data.status).toLowerCase() as PaymentStatus;
      if (["pending", "successful", "failed", "reversed"].includes(next)) setStatus(next);
    }
    setChecking(false);
  }, [paymentType, reference]);

  useEffect(() => { void checkPayment(); }, [checkPayment]);

  useEffect(() => {
    if (status !== "pending") return;
    const timer = setInterval(() => { void checkPayment(); }, 3000);
    return () => clearInterval(timer);
  }, [checkPayment, status]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void checkPayment();
    });
    return () => sub.remove();
  }, [checkPayment]);

  const handleNavigation = (request: { url: string }) => {
    if (request.url.startsWith("citiesbuildernest://payment-return")) {
      setCheckoutVisible(false);
      void checkPayment();
      return false;
    }
    if (!request.url.startsWith("https://")) return false;
    return true;
  };

  const onNavigationStateChange = (navigation: WebViewNavigation) => {
    if (navigation.url.startsWith("citiesbuildernest://payment-return")) {
      setCheckoutVisible(false);
      void checkPayment();
    }
  };

  const closeCheckout = () => {
    setCheckoutVisible(false);
    void checkPayment();
  };

  if (!reference || !safeCheckoutUrl) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#050505", padding: 22, justifyContent: "center" }}>
        <Text style={{ color: "#FFFFFF", fontSize: 19, fontWeight: "800" }}>Unable to open checkout</Text>
        <Text style={{ color: "#A8A8A8", marginTop: 9, lineHeight: 20 }}>The payment link could not be validated. Please return and try again.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 22, padding: 15, backgroundColor: "#D9A93F", borderRadius: 10, alignItems: "center" }}>
          <Text style={{ color: "#080808", fontWeight: "900" }}>Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#050505" }}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <View style={{ minHeight: 58, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#3A2E12" }}>
        <View>
          <Text style={{ color: "#F0C766", fontSize: 15, fontWeight: "900" }}>CB NEST · SECURE CHECKOUT</Text>
          <Text style={{ color: "#9A9A9A", fontSize: 10, marginTop: 3 }}>Your payment stays inside the app</Text>
        </View>
        <TouchableOpacity onPress={closeCheckout} style={{ padding: 9 }}>
          <Text style={{ color: "#F0C766", fontWeight: "800" }}>CLOSE</Text>
        </TouchableOpacity>
      </View>

      {checkoutVisible && status === "pending" ? (
        <WebView
          source={{ uri: checkoutUrl }}
          originWhitelist={["https://*"]}
          onShouldStartLoadWithRequest={handleNavigation}
          onNavigationStateChange={onNavigationStateChange}
          onError={() => setPageError("The checkout page could not load. Check your connection and try again.")}
          onHttpError={(event) => {
            if (event.nativeEvent.statusCode >= 500) setPageError("The payment provider is temporarily unavailable.");
          }}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          renderLoading={() => <View style={{ flex: 1, backgroundColor: "#050505", alignItems: "center", justifyContent: "center" }}><ActivityIndicator color="#D9A93F" /></View>}
          style={{ flex: 1, backgroundColor: "#050505" }}
        />
      ) : (
        <View style={{ flex: 1, padding: 24, justifyContent: "center", alignItems: "center" }}>
          {status === "successful" ? (
            <>
              <Text style={{ color: "#72D6A0", fontSize: 22, fontWeight: "900" }}>Payment confirmed</Text>
              <Text style={{ color: "#C8C8C8", textAlign: "center", marginTop: 10, lineHeight: 21 }}>Squad has verified this payment. Your CB Nest records will reflect the confirmed transaction.</Text>
            </>
          ) : status === "failed" || status === "reversed" ? (
            <>
              <Text style={{ color: "#FF9292", fontSize: 22, fontWeight: "900" }}>Payment not completed</Text>
              <Text style={{ color: "#C8C8C8", textAlign: "center", marginTop: 10, lineHeight: 21 }}>The transaction was not confirmed. You can return and try again.</Text>
            </>
          ) : (
            <>
              <ActivityIndicator color="#D9A93F" size="large" />
              <Text style={{ color: "#F0C766", fontSize: 18, fontWeight: "900", marginTop: 18 }}>Checking payment status</Text>
              <Text style={{ color: "#A8A8A8", textAlign: "center", marginTop: 9, lineHeight: 20 }}>Your payment may still be processing. CB Nest will update this screen when Squad confirms the result. Do not pay again while this transaction is pending.</Text>
            </>
          )}
          {checking && <Text style={{ color: "#777777", fontSize: 10, marginTop: 12 }}>Refreshing secure payment status…</Text>}
          {!!pageError && <Text style={{ color: "#FF9292", fontSize: 12, textAlign: "center", marginTop: 16 }}>{pageError}</Text>}
          <Text style={{ color: "#777777", fontSize: 10, marginTop: 18 }}>Reference: {reference}</Text>
          <TouchableOpacity onPress={() => router.replace(paymentType === "rent_savings" ? "/save-for-rent" : "/service-charges")} style={{ marginTop: 24, minHeight: 48, paddingHorizontal: 24, backgroundColor: "#D9A93F", borderRadius: 10, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ color: "#080808", fontWeight: "900" }}>Return to CB Nest</Text>
          </TouchableOpacity>
          {status === "pending" && <TouchableOpacity onPress={() => { setCheckoutVisible(true); setPageError(""); }} style={{ padding: 14 }}><Text style={{ color: "#F0C766", fontWeight: "800" }}>Reopen checkout</Text></TouchableOpacity>}
        </View>
      )}
    </SafeAreaView>
  );
}
