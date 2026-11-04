import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Screen, SectionTitle, EmptyState, Card } from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import { theme } from '../../src/theme/theme';

type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
};

const formatMoney = (amountKobo: number, currency: string) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: currency || 'NGN',
    maximumFractionDigits: 2,
  }).format(amountKobo / 100);

export default function ActivityScreen() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('Your session has expired. Please sign in again.');

      // These columns and relationships are defined by the service-charge migration.
      // Do not infer activity from unverified maintenance or notification schemas.
      const { data, error: paymentsError } = await supabase
        .from('service_charge_payments')
        .select('id,amount_kobo,currency,verified_at,created_at,charge:estate_service_charges(title)')
        .eq('resident_user_id', user.id)
        .eq('status', 'successful')
        .not('verified_at', 'is', null)
        .order('verified_at', { ascending: false })
        .limit(50);

      if (paymentsError) throw paymentsError;

      setItems((data || []).map((item: any) => ({
        id: item.id,
        title: item.charge?.title || 'Estate service charge payment',
        detail: 'Confirmed payment · ' + formatMoney(Number(item.amount_kobo), item.currency || 'NGN'),
        createdAt: item.verified_at || item.created_at,
      })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your recent activity could not be loaded.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <Screen title="Activity" subtitle="Your recent estate activity">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionTitle>Recent activity</SectionTitle>
        <TouchableOpacity onPress={() => void load()} accessibilityRole="button" accessibilityLabel="Refresh activity" style={{ padding: 8 }}>
          <Text style={{ color: theme.goldSoft, fontSize: 12, fontWeight: '700' }}>REFRESH</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 32, alignItems: 'center' }}>
          <ActivityIndicator color={theme.gold} />
          <Text style={{ color: theme.muted, marginTop: 10 }}>Loading your activity…</Text>
        </View>
      ) : error ? (
        <Card>
          <Text accessibilityRole="alert" style={{ color: '#F2A5A5', fontSize: 13 }}>{error}</Text>
          <Text onPress={() => void load()} style={{ color: theme.goldSoft, fontWeight: '700', marginTop: 12 }}>Try again</Text>
        </Card>
      ) : items.length === 0 ? (
        <EmptyState icon="history" title="No recent activity" message="Your provider-confirmed service charge payments will appear here." />
      ) : (
        items.map((item) => (
          <Card key={item.id}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>{item.title}</Text>
                <Text style={{ color: theme.muted, fontSize: 11, marginTop: 5 }}>{item.detail}</Text>
                <Text style={{ color: theme.muted, fontSize: 10, marginTop: 6 }}>{new Date(item.createdAt).toLocaleString('en-NG')}</Text>
              </View>
              <Text style={{ color: '#79D6A1', fontSize: 10, fontWeight: '800' }}>CONFIRMED</Text>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}
