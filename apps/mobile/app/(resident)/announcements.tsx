import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Screen, SectionTitle, EmptyState, Card } from '../../src/components/ui';
import { supabase } from '../../lib/supabase';
import { theme } from '../../src/theme/theme';

type Announcement = {
  id: string;
  estate_id: string;
  title: string;
  body: string;
  published_at: string;
  created_at: string;
};

export default function AnnouncementsScreen() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
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
        setAnnouncements([]);
        return;
      }

      const { data, error: announcementsError } = await supabase
        .from('announcements')
        .select('id,estate_id,title,body,published_at,created_at')
        .in('estate_id', estateIds)
        .not('published_at', 'is', null)
        .order('published_at', { ascending: false })
        .limit(50);

      if (announcementsError) throw announcementsError;
      setAnnouncements((data ?? []) as Announcement[]);
    } catch (cause) {
      setAnnouncements([]);
      setError(cause instanceof Error ? cause.message : 'Announcements could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen title="Announcements" subtitle="Important updates from estate management">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionTitle>Latest announcements</SectionTitle>
        <Text onPress={() => void load()} style={{ color: theme.goldSoft, fontSize: 12, fontWeight: '700', padding: 8 }}>REFRESH</Text>
      </View>
      {loading ? (
        <View style={{ paddingVertical: 36, alignItems: 'center' }}>
          <ActivityIndicator color={theme.gold} />
          <Text style={{ color: theme.muted, marginTop: 10 }}>Loading estate announcements…</Text>
        </View>
      ) : error ? (
        <Card>
          <Text style={{ color: '#F2A5A5', fontSize: 13 }}>{error}</Text>
          <Text onPress={() => void load()} style={{ color: theme.goldSoft, fontWeight: '700', marginTop: 12 }}>Try again</Text>
        </Card>
      ) : announcements.length === 0 ? (
        <EmptyState icon="bullhorn-outline" title="No announcements yet" message="Official notices published by your estate management will appear here." />
      ) : (
        announcements.map((announcement) => (
          <Card key={announcement.id}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>{announcement.title}</Text>
            <Text style={{ color: theme.goldSoft, fontSize: 12, fontWeight: '700', marginTop: 8 }}>
              {new Date(announcement.published_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 20, marginTop: 12 }}>{announcement.body}</Text>
          </Card>
        ))
      )}
    </Screen>
  );
}
