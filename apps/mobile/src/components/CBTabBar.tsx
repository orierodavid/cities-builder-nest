// src/components/CBTabBar.tsx
// The ONE bottom bar for the resident app. Used by app/(resident)/_layout.tsx via <Tabs tabBar=... />.
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { theme as t } from '../theme/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  index: { label: 'Home', icon: 'home-outline', iconActive: 'home' },
  activity: { label: 'Activity', icon: 'pulse-outline', iconActive: 'pulse' },
  notifications: { label: 'Notifications', icon: 'notifications-outline', iconActive: 'notifications' },
  profile: { label: 'Profile', icon: 'person-outline', iconActive: 'person' },
};
type ResidentTabState = { routes: Array<{ name: string; key: string; params?: object }>; index: number };

export default function CBTabBar({ state, navigation }: { state: ResidentTabState; navigation: any }) {
  const insets = useSafeAreaInsets();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;
    const loadUnread = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) {
        if (active) setUnreadCount(0);
        return;
      }
      const { count, error } = await supabase.from('resident_notification_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_user_id', user.id).is('read_at', null);
      if (!error && active) setUnreadCount(count ?? 0);
    };
    void loadUnread();
    const channel = supabase.channel('resident-notification-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resident_notification_recipients' }, () => { void loadUnread(); })
      .subscribe();
    const authSubscription = supabase.auth.onAuthStateChange(() => { void loadUnread(); });
    return () => {
      active = false;
      void supabase.removeChannel(channel);
      authSubscription.data.subscription.unsubscribe();
    };
  }, []);

  const visible = state.routes.filter((r) => TABS[r.name]);
  const left = visible.slice(0, 2);
  const right = visible.slice(2);
  const renderTab = (route: (typeof state.routes)[number]) => {
    const meta = TABS[route.name];
    const activeRoute = state.routes[state.index]?.name;
    const focused = activeRoute === route.name || (!TABS[activeRoute] && route.name === 'index');
    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
    };
    return (
      <TouchableOpacity key={route.key} style={s.item} onPress={onPress} activeOpacity={0.7} accessibilityRole="tab" accessibilityLabel={meta.label} accessibilityState={{ selected: focused }}>
        <View>
          <Ionicons name={focused ? meta.iconActive : meta.icon} size={22} color={focused ? t.gold : t.muted} />
          {route.name === 'notifications' && unreadCount > 0 && (
            <View style={s.badge}><Text style={s.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View>
          )}
        </View>
        <Text style={[s.label, focused && { color: t.gold }]}>{meta.label}</Text>
      </TouchableOpacity>
    );
  };
  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {left.map(renderTab)}
      <TouchableOpacity style={s.fab} onPress={() => navigation.navigate('visitors')} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Generate visitor access code">
        <Ionicons name="add" size={32} color="#000" />
      </TouchableOpacity>
      {right.map(renderTab)}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: '#0A0A0A', borderTopWidth: 1, borderTopColor: t.border, paddingTop: 8 },
  item: { alignItems: 'center', justifyContent: 'center', minWidth: 60, minHeight: 48, paddingHorizontal: 4 },
  label: { color: t.muted, fontSize: 10, marginTop: 2 },
  fab: { width: 54, height: 54, borderRadius: 27, backgroundColor: t.gold, alignItems: 'center', justifyContent: 'center', marginTop: -26, borderWidth: 4, borderColor: t.bg },
  badge: { position: 'absolute', top: -7, right: -10, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, backgroundColor: '#C62828', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#0A0A0A' },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
});
