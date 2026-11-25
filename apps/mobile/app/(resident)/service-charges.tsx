import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Text, TouchableOpacity, View } from 'react-native';
import { Screen, SectionTitle, EmptyState, Card, ListRow } from '../../src/components/ui';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { theme } from '../../src/theme/theme';

type FeeSettings = { enabled: boolean; fee_mode: 'fixed' | 'percentage'; fee_value: number };

type Charge = {
  id: string;
  title: string;
  description: string | null;
  amount_kobo: number;
  due_date: string | null;
  created_at: string;
};

const money = (kobo: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(kobo / 100);

export default function ServiceChargesScreen() {
  const router = useRouter();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paidChargeIds, setPaidChargeIds] = useState<string[]>([]);
  const [pendingPaymentRefs, setPendingPaymentRefs] = useState<Record<string, string>>({});
  const [paymentBusyId, setPaymentBusyId] = useState<string | null>(null);
  const [paymentMessage, setPaymentMessage] = useState('');
  const [feeSettings, setFeeSettings] = useState<FeeSettings | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data: { user }, error: sessionError } = await supabase.auth.getUser();
    if (sessionError || !user) {
      setError('Your session could not be verified. Please sign in again.');
      setLoading(false);
      return;
    }

    const { data: feeRows, error: feeError } = await supabase.rpc('get_my_service_charge_fee_settings');
    const feeRow = Array.isArray(feeRows) ? feeRows[0] : feeRows;
    if (feeError || !feeRow) setFeeSettings(null);
    else setFeeSettings({ enabled: !!feeRow.enabled, fee_mode: feeRow.fee_mode, fee_value: Number(feeRow.fee_value) });

    const { data: memberships, error: membershipError } = await supabase
      .from('estate_memberships')
      .select('estate_id')
      .eq('user_id', user.id)
      .eq('membership_role', 'resident')
      .eq('status', 'active');

    if (membershipError) {
      setError('We could not load your estate membership. Please try again.');
      setLoading(false);
      return;
    }

    const { data: assignments, error: assignmentError } = await supabase
      .from('resident_units').select('unit_id').eq('resident_user_id', user.id)
      .is('end_date', null).order('created_at', { ascending: false }).limit(1);
    if (assignmentError) {
      setError('We could not load your apartment assignment. Please try again.');
      setLoading(false);
      return;
    }
    const unitId = assignments?.[0]?.unit_id || null;

    const estateIds = [...new Set((memberships || []).map((item) => item.estate_id).filter(Boolean))];
    if (!estateIds.length) {
      setCharges([]);
      setLoading(false);
      return;
    }

    let paymentQuery = supabase.from('service_charge_payments')
      .select('charge_id,status,provider_reference,verified_at,created_at')
      .in('estate_id', estateIds);
    paymentQuery = unitId
      ? paymentQuery.or(`unit_id.eq.${unitId},and(unit_id.is.null,resident_user_id.eq.${user.id})`)
      : paymentQuery.eq('resident_user_id', user.id);
    const { data: paidRows, error: paidError } = await paymentQuery
      .order('created_at', { ascending: false });

    if (paidError) {
      setError('We could not verify your payment status. Please try again before making a payment.');
      setCharges([]);
      setLoading(false);
      return;
    }
    const verifiedPaid = (paidRows || []).filter((row) => row.status === 'successful' && !!row.verified_at);
    setPaidChargeIds([...new Set(verifiedPaid.map((row) => row.charge_id).filter(Boolean))]);
    const pendingRefs: Record<string, string> = {};
    for (const row of paidRows || []) {
      if (!pendingRefs[row.charge_id] && row.provider_reference &&
          (row.status === 'pending' || (row.status === 'failed' && !row.verified_at))) {
        pendingRefs[row.charge_id] = row.provider_reference;
      }
    }
    setPendingPaymentRefs(pendingRefs);

    const { data, error: chargesError } = await supabase
      .from('estate_service_charges')
      .select('id,title,description,amount_kobo,due_date,created_at')
      .in('estate_id', estateIds)
      .eq('is_active', true)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (chargesError) {
      setError('Service charges are temporarily unavailable. Please try again.');
      setCharges([]);
    } else {
      setCharges((data || []) as Charge[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => subscription.remove();
  }, [load]);

  const payChargeWithWallet = async (chargeId: string) => {
    setPaymentBusyId(chargeId);
    setPaymentMessage('');
    try {
      const { data, error: walletError } = await supabase.rpc('pay_service_charge_from_wallet', { p_charge_id: chargeId });
      if (walletError) {
        const detail = walletError.message || '';
        if (detail.includes('insufficient_wallet_funds')) throw new Error('Your wallet balance is insufficient. Choose normal payment or top up your wallet.');
        if (detail.includes('service_charge_payment_already_pending_or_paid')) throw new Error('A payment for this charge is already pending or has been confirmed. Refresh to check its status.');
        if (detail.includes('active_wallet_not_found')) throw new Error('Your CB Nest wallet is not active. Choose normal payment or contact support.');
        throw new Error('Wallet payment could not be completed. Your balance has not been intentionally changed; refresh and check your transaction history.');
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.payment_id || !row?.wallet_transaction_id) throw new Error('Wallet payment confirmation was not returned. Refresh your payment history before trying again.');
      setPaymentMessage('Service charge paid successfully from your CB Nest wallet.');
      await load();
    } catch (e) {
      setPaymentMessage(e instanceof Error ? e.message : 'Wallet payment could not be completed. Please try again.');
    } finally {
      setPaymentBusyId(null);
    }
  };

  const paymentFeeFor = (principalKobo: number) => {
    if (!feeSettings?.enabled || feeSettings.fee_value <= 0) return 0;
    return feeSettings.fee_mode === 'percentage'
      ? Math.round(principalKobo * feeSettings.fee_value / 10000)
      : feeSettings.fee_value;
  };

  const payCharge = async (chargeId: string) => {
    setPaymentBusyId(chargeId);
    setPaymentMessage('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('initiate-squad-payment', {
        body: { paymentType: 'service_charge', chargeId },
      });
      if (invokeError) throw invokeError;
      if (typeof data?.transactionReference !== "string" || !data.transactionReference) {
        throw new Error('We could not confirm the payment attempt. Please try again.');
      }
      if (data.checkoutUrl && (typeof data.checkoutUrl !== 'string' || !data.checkoutUrl.startsWith('https://'))) {
        throw new Error('The payment link could not be validated.');
      }
      router.push({ pathname: "/payment-checkout", params: {
        checkoutUrl: typeof data.checkoutUrl === "string" ? data.checkoutUrl : "",
        reference: data.transactionReference,
        paymentType: "service_charge",
        amountKobo: String(data.amountKobo ?? 0),
        feeKobo: String(data.feeKobo ?? 0),
        totalAmountKobo: String(data.totalAmountKobo ?? data.amountKobo ?? 0),
      } });
    } catch (e) {
      setPaymentMessage('We could not confirm whether the payment started. Check its status before trying again.');
    } finally {
      setPaymentBusyId(null);
    }
  };

  return (
    <Screen title="Service Charges" subtitle="Published fees for your estate">
      <ListRow icon="receipt" title="Payment history" subtitle="View confirmed payments" onPress={() => router.push('/payments' as never)} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <SectionTitle>Current charges</SectionTitle>
        <Text onPress={() => void load()} style={{ color: theme.goldSoft, fontSize: 12, fontWeight: '700', padding: 8 }}>REFRESH</Text>
      </View>
      {loading ? (
        <View style={{ paddingVertical: 36, alignItems: 'center' }}>
          <ActivityIndicator color={theme.gold} />
          <Text style={{ color: theme.muted, marginTop: 10 }}>Loading your published charges…</Text>
        </View>
      ) : error ? (
        <Card>
          <Text style={{ color: '#F2A5A5', fontSize: 13 }}>{error}</Text>
          <Text onPress={() => void load()} style={{ color: theme.goldSoft, fontWeight: '700', marginTop: 12 }}>Try again</Text>
        </Card>
      ) : charges.length === 0 ? (
        <EmptyState icon="file-document-outline" title="No service charges available" message="Charges published by your estate management will appear here." />
      ) : (
        charges.map((charge) => (
          <Card key={charge.id}>
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{charge.title}</Text>
            {!!charge.description && <Text style={{ color: theme.muted, fontSize: 12, marginTop: 5 }}>{charge.description}</Text>}
            <Text style={{ color: theme.goldSoft, fontSize: 22, fontWeight: '800', marginTop: 12 }}>{money(charge.amount_kobo)}</Text>
            <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border, gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: theme.muted, fontSize: 12 }}>Service charge</Text><Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>{money(charge.amount_kobo)}</Text></View>
              {feeSettings?.enabled && paymentFeeFor(charge.amount_kobo) > 0 ? <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: theme.muted, fontSize: 12 }}>Platform payment fee (online payment)</Text><Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>{money(paymentFeeFor(charge.amount_kobo))}</Text></View> : null}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: theme.goldSoft, fontSize: 12, fontWeight: '800' }}>Total for online payment</Text><Text style={{ color: theme.goldSoft, fontSize: 13, fontWeight: '900' }}>{money(charge.amount_kobo + paymentFeeFor(charge.amount_kobo))}</Text></View>
              {!feeSettings && <Text style={{ color: '#F2A5A5', fontSize: 11 }}>Payment fee details could not be loaded. Refresh before starting an online payment.</Text>}
            </View>
            <Text style={{ color: theme.muted, fontSize: 12, marginTop: 5 }}>
              {charge.due_date ? `Due ${new Date(charge.due_date + 'T00:00:00').toLocaleDateString()}` : 'Due date not specified'}
            </Text>
            {paidChargeIds.includes(charge.id) ? (
              <Text style={{ color: '#79D6A1', fontSize: 12, fontWeight: '800', marginTop: 12 }}>PAID · CONFIRMED</Text>
            ) : pendingPaymentRefs[charge.id] ? (
              <>
                <Text style={{ color: theme.goldSoft, fontSize: 12, fontWeight: '800', marginTop: 12 }}>PAYMENT CONFIRMATION PENDING</Text>
                <TouchableOpacity onPress={() => router.push({ pathname: "/payment-checkout", params: {
                  checkoutUrl: "", reference: pendingPaymentRefs[charge.id], paymentType: "service_charge",
                } })} style={{ marginTop: 12, minHeight: 46, borderRadius: 10, borderWidth: 1, borderColor: theme.gold, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: theme.goldSoft, fontWeight: '900' }}>CHECK PAYMENT STATUS</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
              <TouchableOpacity onPress={() => void payChargeWithWallet(charge.id)} disabled={paymentBusyId === charge.id} style={{ marginTop: 14, minHeight: 46, borderRadius: 10, backgroundColor: theme.gold, alignItems: 'center', justifyContent: 'center', opacity: paymentBusyId === charge.id ? 0.65 : 1 }}>
                {paymentBusyId === charge.id ? <ActivityIndicator color="#071A3A" /> : <Text style={{ color: '#071A3A', fontWeight: '900' }}>PAY FROM WALLET</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void payCharge(charge.id)} disabled={paymentBusyId === charge.id || !feeSettings} style={{ marginTop: 9, minHeight: 46, borderRadius: 10, borderWidth: 1, borderColor: theme.gold, alignItems: 'center', justifyContent: 'center', opacity: paymentBusyId === charge.id ? 0.65 : 1 }}>
                <Text style={{ color: theme.goldSoft, fontWeight: '900' }}>PAY NORMALLY</Text>
              </TouchableOpacity>
              </>
            )}
          </Card>
        ))
      )}
      {!!paymentMessage && <Card><Text accessibilityRole="alert" style={{ color: theme.muted, fontSize: 12, lineHeight: 18 }}>{paymentMessage}</Text></Card>}
    </Screen>
  );
}
