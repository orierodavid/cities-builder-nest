import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
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
          </Card>
        ))
      )}
      <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 17, marginTop: 8 }}>
        Payment collection will become available when an approved payment provider is connected. Viewing a charge does not mark it as paid.
      </Text>
    </Screen>
  );
}
