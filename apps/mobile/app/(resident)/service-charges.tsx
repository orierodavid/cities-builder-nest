import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Text, TouchableOpacity, View } from 'react-native';
import { Screen, SectionTitle, EmptyState, Card, ListRow } from '../../src/components/ui';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { theme } from '../../src/theme/theme';

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
  const [paymentBusyId, setPaymentBusyId] = useState<string | null>(null);
  const [paymentMessage, setPaymentMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data: { user }, error: sessionError } = await supabase.auth.getUser();
    if (sessionError || !user) {
      setError('Your session could not be verified. Please sign in again.');
      setLoading(false);
      return;
    }

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

    const estateIds = [...new Set((memberships || []).map((item) => item.estate_id).filter(Boolean))];
    if (!estateIds.length) {
      setCharges([]);
      setLoading(false);
      return;
    }

    const { data: paidRows, error: paidError } = await supabase
      .from('service_charge_payments')
      .select('charge_id')
      .eq('resident_user_id', user.id)
      .eq('status', 'successful')
      .in('estate_id', estateIds);

    if (paidError) {
      setError('We could not verify your payment status. Please try again before making a payment.');
      setCharges([]);
      setLoading(false);
      return;
    }
    setPaidChargeIds([...new Set((paidRows || []).map((row) => row.charge_id).filter(Boolean))]);

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

  const payCharge = async (chargeId: string) => {
    setPaymentBusyId(chargeId);
    setPaymentMessage('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('initiate-squad-payment', {
        body: { paymentType: 'service_charge', chargeId },
      });
      if (invokeError) throw invokeError;
      if (!data?.checkoutUrl || typeof data.checkoutUrl !== 'string' || !data.checkoutUrl.startsWith('https://')) {
        throw new Error('We could not open the payment page. Please try again.');
      }
      await Linking.openURL(data.checkoutUrl);
      setPaymentMessage('Payment page opened. Your charge will be marked paid after the payment is confirmed.');
    } catch (e) {
      setPaymentMessage('We could not start your payment. Please try again.');
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
            <Text style={{ color: theme.muted, fontSize: 12, marginTop: 5 }}>
              {charge.due_date ? `Due ${new Date(charge.due_date + 'T00:00:00').toLocaleDateString()}` : 'Due date not specified'}
            </Text>
            {paidChargeIds.includes(charge.id) ? (
              <Text style={{ color: '#79D6A1', fontSize: 12, fontWeight: '800', marginTop: 12 }}>PAID · CONFIRMED</Text>
            ) : (
              <TouchableOpacity onPress={() => void payCharge(charge.id)} disabled={paymentBusyId === charge.id} style={{ marginTop: 14, minHeight: 46, borderRadius: 10, backgroundColor: theme.gold, alignItems: 'center', justifyContent: 'center', opacity: paymentBusyId === charge.id ? 0.65 : 1 }}>
                {paymentBusyId === charge.id ? <ActivityIndicator color="#071A3A" /> : <Text style={{ color: '#071A3A', fontWeight: '900' }}>Pay Now</Text>}
              </TouchableOpacity>
            )}
          </Card>
        ))
      )}
      {!!paymentMessage && <Card><Text accessibilityRole="alert" style={{ color: theme.muted, fontSize: 12, lineHeight: 18 }}>{paymentMessage}</Text></Card>}
    </Screen>
  );
}
