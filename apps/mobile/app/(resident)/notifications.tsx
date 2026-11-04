import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Screen, SectionTitle, EmptyState, Card } from '../../src/components/ui';
import { supabase } from '../../lib/supabase';
import { theme } from '../../src/theme/theme';

type NotificationItem = {
  id: string;
  notification_id: string;
  read_at: string | null;
  created_at: string;
  notification: {
    title: string;
    body: string;
    priority: 'normal' | 'important' | 'urgent';
    sent_by_role: 'platform_admin' | 'facility_manager';
    created_at: string;
  };
};

export default function NotificationsScreen() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error('Your session could not be verified. Please sign in again.');
      const { data, error: inboxError } = await supabase
        .from('resident_notification_recipients')
        .select('id,notification_id,read_at,created_at,notification:resident_notifications!inner(title,body,priority,sent_by_role,created_at)')
        .eq('recipient_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (inboxError) throw inboxError;
      setItems((data ?? []) as unknown as NotificationItem[]);
    } catch (cause) {
      setItems([]);
      setError(cause instanceof Error ? cause.message : 'Notifications could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase.channel('resident-notification-inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'resident_notification_recipients' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const markRead = async (item: NotificationItem) => {
    if (item.read_at) return;
    const readAt = new Date().toISOString();
    const { error: updateError } = await supabase.from('resident_notification_recipients')
      .update({ read_at: readAt }).eq('id', item.id).is('read_at', null);
    if (updateError) {
      setError('This notification could not be marked as read. Please try again.');
      return;
    }
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: readAt } : entry));
  };

  const unreadCount = items.filter((item) => !item.read_at).length;
  return (
    <Screen title="Notifications" subtitle="Messages and updates from estate management">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionTitle>Notification inbox</SectionTitle>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ color: theme.muted, fontSize: 11 }}>{unreadCount} unread</Text>
          <TouchableOpacity onPress={() => void load()} accessibilityRole="button" accessibilityLabel="Refresh notifications" style={{ padding: 8 }}>
            <Text style={{ color: theme.goldSoft, fontSize: 12, fontWeight: '700' }}>REFRESH</Text>
          </TouchableOpacity>
        </View>
      </View>
      {loading ? (
        <View style={{ paddingVertical: 32, alignItems: 'center' }}>
          <ActivityIndicator color={theme.gold} />
          <Text style={{ color: theme.muted, marginTop: 10 }}>Loading your notifications…</Text>
        </View>
      ) : error ? (
        <Card>
          <Text accessibilityRole="alert" style={{ color: '#F2A5A5', fontSize: 13 }}>{error}</Text>
          <Text onPress={() => void load()} style={{ color: theme.goldSoft, fontWeight: '700', marginTop: 12 }}>Try again</Text>
        </Card>
      ) : items.length === 0 ? (
        <EmptyState icon="bell-outline" title="You're all caught up" message="Messages sent by your estate management will appear here." />
      ) : (
        items.map((item) => {
          const notification = item.notification;
          const sender = notification.sent_by_role === 'platform_admin' ? 'Super Admin' : 'Facility Manager';
          return (
            <TouchableOpacity key={item.id} activeOpacity={0.85} onPress={() => void markRead(item)} accessibilityRole="button" accessibilityLabel={`${notification.title}, ${item.read_at ? 'read' : 'unread'}`}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>{notification.title}</Text>
                    <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginTop: 7 }}>{notification.body}</Text>
                    <Text style={{ color: theme.muted, fontSize: 10, marginTop: 8 }}>{sender} · {new Date(notification.created_at).toLocaleString('en-NG')}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 5 }}>
                    {!item.read_at && <Text style={{ color: theme.goldSoft, fontSize: 10, fontWeight: '800' }}>NEW</Text>}
                    {notification.priority !== 'normal' && <Text style={{ color: notification.priority === 'urgent' ? '#F2A5A5' : theme.goldSoft, fontSize: 9, fontWeight: '800' }}>{notification.priority.toUpperCase()}</Text>}
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          );
        })
      )}
    </Screen>
  );
}
