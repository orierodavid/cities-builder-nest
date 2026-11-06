import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Screen, SectionTitle, EmptyState, Card } from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import { theme } from '../../src/theme/theme';

type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  status: string;
  createdAt: string;
};

const formatMoney = (amountKobo: number, currency: string) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: currency || 'NGN',
    maximumFractionDigits: 2,
  }).format(amountKobo / 100);

const displayStatus = (status: string, verifiedAt?: string | null) => {
  if (status === 'successful' && verifiedAt) return 'Successful';
  if (status === 'successful' || status === 'pending') return 'Pending';
  if (status === 'failed') return 'Failed';
  if (status === 'reversed') return 'Reversed';
  if (status === 'awaiting_provider') return 'Processing';
  const label = status.replaceAll('_', ' ');
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Processing';
};

export default function ActivityScreen() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        setError('Your session has expired. Please sign in again.');
        setItems([]);
        return;
      }

      const [charges, savings, visitors, maintenance] = await Promise.all([
        supabase.from('service_charge_payments')
          .select('id,amount_kobo,currency,status,verified_at,created_at,charge:estate_service_charges(title)')
          .eq('resident_user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('rent_savings_contributions')
          .select('id,amount_kobo,currency,status,verified_at,created_at')
          .eq('resident_user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('visitor_passes')
          .select('id,visitor_name,status,created_at,valid_until')
          .eq('host_user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('maintenance_requests')
          .select('id,title,status,created_at,priority')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      const next: ActivityItem[] = [];
      for (const row of charges.data || []) {
        next.push({
          id: 'charge-' + row.id,
          title: row.charge?.[0]?.title || 'Service charge payment',
          detail: formatMoney(Number(row.amount_kobo), row.currency || 'NGN'),
          status: displayStatus(row.status, row.verified_at),
          createdAt: row.verified_at || row.created_at,
        });
      }
      for (const row of savings.data || []) {
        next.push({
          id: 'savings-' + row.id,
          title: 'Rent savings contribution',
          detail: formatMoney(Number(row.amount_kobo), row.currency || 'NGN'),
          status: displayStatus(row.status, row.verified_at),
          createdAt: row.verified_at || row.created_at,
        });
      }
      for (const row of visitors.data || []) {
        next.push({
          id: 'visitor-' + row.id,
          title: 'Visitor pass · ' + (row.visitor_name || 'Visitor'),
          detail: row.valid_until ? 'Valid until ' + new Date(row.valid_until).toLocaleString('en-NG') : 'Visitor access pass',
          status: displayStatus(row.status),
          createdAt: row.created_at,
        });
      }
      for (const row of maintenance.data || []) {
        next.push({
          id: 'maintenance-' + row.id,
          title: row.title || 'Maintenance request',
          detail: 'Priority: ' + (row.priority || 'Normal'),
          status: displayStatus(row.status),
          createdAt: row.created_at,
        });
      }

      setItems(next.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      if (charges.error || savings.error || visitors.error || maintenance.error) {
        setError('Some activity could not be loaded. Please refresh to try again.');
      }
    } catch {
      setError('Your recent activity could not be loaded. Please try again.');
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
      ) : error && items.length === 0 ? (
        <Card>
          <Text accessibilityRole="alert" style={{ color: '#F2A5A5', fontSize: 13 }}>{error}</Text>
          <Text onPress={() => void load()} style={{ color: theme.goldSoft, fontWeight: '700', marginTop: 12 }}>Try again</Text>
        </Card>
      ) : items.length === 0 ? (
        <EmptyState icon="history" title="No recent activity" message="Your payments, savings contributions, visitor passes and maintenance requests will appear here." />
      ) : (
        items.map((item) => {
          const successful = item.status.toLowerCase() === 'successful' || item.status.toLowerCase() === 'active' || item.status.toLowerCase() === 'completed';
          return (
            <Card key={item.id}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>{item.title}</Text>
                  <Text style={{ color: theme.muted, fontSize: 11, marginTop: 5 }}>{item.detail}</Text>
                  <Text style={{ color: theme.muted, fontSize: 10, marginTop: 6 }}>{new Date(item.createdAt).toLocaleString('en-NG')}</Text>
                </View>
                <Text style={{ color: successful ? '#79D6A1' : theme.goldSoft, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }}>{item.status}</Text>
              </View>
            </Card>
          );
        })
      )}
      {!!error && items.length > 0 && <Text accessibilityRole="alert" style={{ color: theme.goldSoft, fontSize: 11 }}>{error}</Text>}
    </Screen>
  );
}
