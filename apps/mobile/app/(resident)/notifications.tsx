import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Screen, SectionTitle, EmptyState, Card } from '../../src/components/ui';
import { supabase } from '../../lib/supabase';
import { theme } from '../../src/theme/theme';

type UpdateItem = {
  id: string;
  kind: 'announcement' | 'event' | 'visitor';
  title: string;
  detail: string;
  createdAt: string;
};

const RECENT_DAYS = 30;

export default function NotificationsScreen() {
  const [items, setItems] = useState<UpdateItem[]>([]);
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
        setItems([]);
        return;
      }

      const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const now = new Date().toISOString();

      const [announcementsResult, eventsResult, visitorPassesResult] = await Promise.all([
        supabase
          .from('announcements')
          .select('id,title,published_at')
          .in('estate_id', estateIds)
          .not('published_at', 'is', null)
          .gte('published_at', since)
          .order('published_at', { ascending: false })
          .limit(20),
        supabase
          .from('estate_events')
          .select('id,title,venue,starts_at')
          .in('estate_id', estateIds)
          .eq('status', 'published')
          .gte('starts_at', now)
          .order('starts_at', { ascending: true })
          .limit(20),
        supabase
          .from('visitor_passes')
          .select('id,visitor_name,status,created_at')
          .eq('host_user_id', user.id)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (announcementsResult.error) throw announcementsResult.error;
      if (eventsResult.error) throw eventsResult.error;
      if (visitorPassesResult.error) throw visitorPassesResult.error;

      const announcements: UpdateItem[] = (announcementsResult.data ?? []).map((item) => ({
        id: 'announcement-' + item.id,
        kind: 'announcement',
        title: item.title,
        detail: 'A new estate announcement has been published.',
        createdAt: item.published_at as string,
      }));

      const events: UpdateItem[] = (eventsResult.data ?? []).map((item) => ({
        id: 'event-' + item.id,
        kind: 'event',
        title: item.title,
        detail: 'Upcoming estate event · ' + item.venue + ' · ' + new Date(item.starts_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }),
        createdAt: item.starts_at,
      }));

      const visitorPasses: UpdateItem[] = (visitorPassesResult.data ?? []).map((item) => ({
        id: 'visitor-' + item.id,
        kind: 'visitor',
        title: 'Visitor pass · ' + item.visitor_name,
        detail: 'Your visitor pass is ' + item.status + '.',
        createdAt: item.created_at,
      }));

      setItems([...announcements, ...events, ...visitorPasses]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 50));
    } catch (cause) {
      setItems([]);
      setError(cause instanceof Error ? cause.message : 'Your estate updates could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen title="Notifications" subtitle="Updates from your estate">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionTitle>Recent updates</SectionTitle>
        <TouchableOpacity onPress={() => void load()} accessibilityRole="button" accessibilityLabel="Refresh notifications" style={{ padding: 8 }}>
          <Text style={{ color: theme.goldSoft, fontSize: 12, fontWeight: '700' }}>REFRESH</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 32, alignItems: 'center' }}>
          <ActivityIndicator color={theme.gold} />
          <Text style={{ color: theme.muted, marginTop: 10 }}>Loading your estate updates…</Text>
        </View>
      ) : error ? (
        <Card>
          <Text accessibilityRole="alert" style={{ color: '#F2A5A5', fontSize: 13 }}>{error}</Text>
          <Text onPress={() => void load()} style={{ color: theme.goldSoft, fontWeight: '700', marginTop: 12 }}>Try again</Text>
        </Card>
      ) : items.length === 0 ? (
        <EmptyState icon="bell-outline" title="You're all caught up" message="New estate announcements, upcoming events and recent visitor-pass updates will appear here." />
      ) : (
        items.map((item) => (
          <Card key={item.id}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>{item.title}</Text>
                <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginTop: 6 }}>{item.detail}</Text>
                <Text style={{ color: theme.muted, fontSize: 10, marginTop: 7 }}>{new Date(item.createdAt).toLocaleString('en-NG')}</Text>
              </View>
              <Text style={{ color: theme.goldSoft, fontSize: 10, fontWeight: '800' }}>
                {item.kind === 'announcement' ? 'NOTICE' : item.kind === 'event' ? 'EVENT' : 'VISITOR'}
              </Text>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}
