import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Screen, SectionTitle, EmptyState, Card } from '../../src/components/ui';
import { supabase } from '../../lib/supabase';
import { theme } from '../../src/theme/theme';

type EstateEvent = {
  id: string;
  estate_id: string;
  title: string;
  description: string;
  venue: string;
  starts_at: string;
  ends_at: string;
  status: 'draft' | 'published' | 'cancelled';
};

export default function EventsScreen() {
  const [events, setEvents] = useState<EstateEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error('Your session could not be verified. Please sign in again.');

      const { data: memberships, error: membershipError } = await supabase
        .from('estate_memberships')
        .select('estate_id')
        .eq('user_id', user.id)
        .eq('membership_role', 'resident')
        .eq('status', 'active');

      if (membershipError) throw membershipError;
      const estateIds = [...new Set((memberships ?? []).map((item) => item.estate_id).filter(Boolean))];
      if (!estateIds.length) {
        setEvents([]);
        return;
      }

      const { data, error: eventsError } = await supabase
        .from('estate_events')
        .select('id,estate_id,title,description,venue,starts_at,ends_at,status')
        .in('estate_id', estateIds)
        .eq('status', 'published')
        .gte('ends_at', new Date().toISOString())
        .order('starts_at', { ascending: true })
        .limit(50);

      if (eventsError) throw eventsError;
      setEvents((data ?? []) as EstateEvent[]);
    } catch (cause) {
      setEvents([]);
      setError(cause instanceof Error ? cause.message : 'Events could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen title="Events" subtitle="Estate events and activities">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionTitle>Upcoming events</SectionTitle>
        <Text onPress={() => void load()} style={{ color: theme.goldSoft, fontSize: 12, fontWeight: '700', padding: 8 }}>REFRESH</Text>
      </View>
      {loading ? (
        <View style={{ paddingVertical: 36, alignItems: 'center' }}>
          <ActivityIndicator color={theme.gold} />
          <Text style={{ color: theme.muted, marginTop: 10 }}>Loading estate events…</Text>
        </View>
      ) : error ? (
        <Card>
          <Text style={{ color: '#F2A5A5', fontSize: 13 }}>{error}</Text>
          <Text onPress={() => void load()} style={{ color: theme.goldSoft, fontWeight: '700', marginTop: 12 }}>Try again</Text>
        </Card>
      ) : events.length === 0 ? (
        <EmptyState icon="calendar-star" title="No upcoming events" message="Published upcoming events from your estate will appear here." />
      ) : (
        events.map((event) => (
          <Card key={event.id}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>{event.title}</Text>
            <Text style={{ color: theme.goldSoft, fontSize: 12, fontWeight: '700', marginTop: 8 }}>
              {new Date(event.starts_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 12, marginTop: 4 }}>
              Ends {new Date(event.ends_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}
            </Text>
            <Text style={{ color: theme.text, fontSize: 13, marginTop: 10 }}>📍 {event.venue}</Text>
            {!!event.description && (
              <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 19, marginTop: 10 }}>{event.description}</Text>
            )}
          </Card>
        ))
      )}
    </Screen>
  );
}
