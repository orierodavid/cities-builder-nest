import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Screen, SectionTitle, EmptyState, Card } from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import { theme } from '../../src/theme/theme';

type Payment = {
  id: string;
  amount_kobo: number;
  currency: string;
  status: 'pending' | 'successful' | 'failed' | 'reversed' | string;
  provider_reference: string | null;
  verified_at: string | null;
  created_at: string;
  description: string;
};

const money = (kobo: number, currency: string) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: currency || 'NGN', maximumFractionDigits: 2 }).format(kobo / 100);

const statusLabel = (status: string, verifiedAt: string | null) => {
  if (status === 'successful' && verifiedAt) return 'Successful';
  if (status === 'successful' || status === 'pending') return 'Pending';
  if (status === 'failed' && !verifiedAt) return 'Pending confirmation';
  if (status === 'failed') return 'Failed';
  if (status === 'reversed') return 'Reversed';
  return 'Processing';
};

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

    const [charges, savings, electricity] = await Promise.all([
      supabase.from('service_charge_payments')
        .select('id,amount_kobo,currency,status,provider_reference,verified_at,created_at,charge:estate_service_charges(title)')
        .eq('resident_user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.from('rent_savings_contributions')
        .select('id,amount_kobo,currency,status,provider_reference,verified_at,created_at')
        .eq('resident_user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.from('electricity_recharge_orders')
        .select('id,amount_kobo,currency,status,units_purchased,verified_at,created_at')
        .eq('resident_user_id', user.id)
        .order('created_at', { ascending: false }),
    ]);

    if (charges.error || savings.error || electricity.error) {
      setPayments([]);
      setError('Your payment history is temporarily unavailable. Please try again.');
      setLoading(false);
      return;
    }

    const chargeRows = (charges.data || []).map((row: any) => ({
      id: 'charge-' + row.id,
      amount_kobo: Number(row.amount_kobo),
      currency: row.currency || 'NGN',
      status: row.status,
      provider_reference: row.provider_reference,
      verified_at: row.verified_at,
      created_at: row.created_at,
      description: row.charge?.title || 'Service charge',
    }));
    const savingsRows = (savings.data || []).map((row: any) => ({
      id: 'savings-' + row.id,
      amount_kobo: Number(row.amount_kobo),
      currency: row.currency || 'NGN',
      status: row.status,
      provider_reference: row.provider_reference,
      verified_at: row.verified_at,
      created_at: row.created_at,
      description: 'Rent savings contribution',
    }));
    const electricityRows = (electricity.data || []).map((row: any) => ({
      id: 'electricity-' + row.id,
      amount_kobo: Number(row.amount_kobo),
      currency: row.currency || 'NGN',
      status: row.status,
      provider_reference: null,
      verified_at: row.verified_at,
      created_at: row.created_at,
      description: 'Electricity purchase' + (row.units_purchased ? ' · ' + row.units_purchased + ' units' : ''),
    }));
    setPayments([...chargeRows, ...savingsRows, ...electricityRows].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <Screen title="Payment History" subtitle="Your rent savings, service charge and electricity transactions">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionTitle>All transactions</SectionTitle>
        <Text onPress={() => void load()} style={{ color: theme.goldSoft, fontSize: 12, fontWeight: '700', padding: 8 }}>REFRESH</Text>
      </View>
      {loading ? (
        <View style={{ paddingVertical: 36, alignItems: 'center' }}>
          <ActivityIndicator color={theme.gold} />
          <Text style={{ color: theme.muted, marginTop: 10 }}>Loading your transactions…</Text>
        </View>
      ) : error ? (
        <Card>
          <Text style={{ color: '#F2A5A5', fontSize: 13 }}>{error}</Text>
          <Text onPress={() => void load()} style={{ color: theme.goldSoft, fontWeight: '700', marginTop: 12 }}>Try again</Text>
        </Card>
      ) : payments.length === 0 ? (
        <EmptyState icon="cash-multiple" title="No transactions yet" message="Your rent savings contributions, service charge payments and electricity purchases will appear here." />
      ) : (
        payments.map((payment) => {
          const label = statusLabel(payment.status, payment.verified_at);
          const successful = label === 'Successful';
          return (
            <Card key={payment.id}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{payment.description}</Text>
                  <Text style={{ color: theme.muted, fontSize: 12, marginTop: 5 }}>
                    {new Date(payment.created_at).toLocaleString('en-NG')}
                  </Text>
                </View>
                <Text style={{ color: theme.goldSoft, fontSize: 16, fontWeight: '800' }}>{money(payment.amount_kobo, payment.currency)}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                <View style={{ backgroundColor: successful ? '#153B29' : '#332B20', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 }}>
                  <Text style={{ color: successful ? '#79D6A1' : theme.goldSoft, fontSize: 11, fontWeight: '700' }}>{label.toUpperCase()}</Text>
                </View>
              </View>
              {!!payment.provider_reference && (
                <Text selectable style={{ color: theme.muted, fontSize: 11, marginTop: 8 }}>Transaction reference: {payment.provider_reference}</Text>
              )}
            </Card>
          );
        })
      )}
      <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 17, marginTop: 8 }}>
        A transaction is marked successful only after it has been confirmed.
      </Text>
    </Screen>
  );
}
