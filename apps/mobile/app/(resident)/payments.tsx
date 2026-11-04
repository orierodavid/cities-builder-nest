import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Screen, SectionTitle, EmptyState, Card } from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import { theme } from '../../src/theme/theme';

type Payment = {
  id: string;
  estate_id: string;
  amount_kobo: number;
  currency: string;
  provider: string | null;
  provider_reference: string | null;
  verified_at: string;
  created_at: string;
  charge: { title: string } | null;
};

const money = (kobo: number, currency: string) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: currency || 'NGN', maximumFractionDigits: 2 }).format(kobo / 100);

export default function PaymentsScreen() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data: { user }, error: sessionError } = await supabase.auth.getUser();
    if (sessionError || !user) {
      setError('Your session could not be verified. Please sign in again.');
      setLoading(false);
      return;
    }

    const { data, error: queryError } = await supabase
      .from('service_charge_payments')
      .select('id,estate_id,amount_kobo,currency,provider,provider_reference,verified_at,created_at,charge:estate_service_charges(title)')
      .eq('resident_user_id', user.id)
      .eq('status', 'successful')
      .not('verified_at', 'is', null)
      .order('verified_at', { ascending: false });

    if (queryError) {
      setPayments([]);
      setError('Payment history is temporarily unavailable. Please try again.');
    } else {
      setPayments((data || []) as unknown as Payment[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <Screen title="Payments" subtitle="Provider-confirmed service charge payments">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionTitle>Payment history</SectionTitle>
        <Text onPress={() => void load()} style={{ color: theme.goldSoft, fontSize: 12, fontWeight: '700', padding: 8 }}>REFRESH</Text>
      </View>
      {loading ? (
        <View style={{ paddingVertical: 36, alignItems: 'center' }}>
          <ActivityIndicator color={theme.gold} />
          <Text style={{ color: theme.muted, marginTop: 10 }}>Loading confirmed payments…</Text>
        </View>
      ) : error ? (
        <Card>
          <Text style={{ color: '#F2A5A5', fontSize: 13 }}>{error}</Text>
          <Text onPress={() => void load()} style={{ color: theme.goldSoft, fontWeight: '700', marginTop: 12 }}>Try again</Text>
        </Card>
      ) : payments.length === 0 ? (
        <EmptyState icon="cash-multiple" title="No confirmed payments yet" message="Payments will appear here only after the payment provider confirms them." />
      ) : (
        payments.map((payment) => (
          <Card key={payment.id}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{payment.charge?.title || 'Estate service charge'}</Text>
                <Text style={{ color: theme.muted, fontSize: 12, marginTop: 5 }}>
                  {new Date(payment.verified_at).toLocaleString()}
                </Text>
              </View>
              <Text style={{ color: theme.goldSoft, fontSize: 16, fontWeight: '800' }}>{money(payment.amount_kobo, payment.currency)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
              <View style={{ backgroundColor: '#153B29', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ color: '#79D6A1', fontSize: 11, fontWeight: '700' }}>CONFIRMED</Text>
              </View>
              {!!payment.provider && <Text style={{ color: theme.muted, fontSize: 11, marginLeft: 8 }}>{payment.provider}</Text>}
            </View>
            {!!payment.provider_reference && (
              <Text selectable style={{ color: theme.muted, fontSize: 11, marginTop: 8 }}>Reference: {payment.provider_reference}</Text>
            )}
          </Card>
        ))
      )}
      <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 17, marginTop: 8 }}>
        Pending, failed, and unverified transactions are not shown as successful payments.
      </Text>
    </Screen>
  );
}
