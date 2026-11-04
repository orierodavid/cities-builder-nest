// src/components/CBTabBar.tsx
// The ONE bottom bar for the resident app. Used by app/(resident)/_layout.tsx via <Tabs tabBar=... />.
// Requires: @react-navigation/bottom-tabs (installed with expo-router), react-native-safe-area-context, @expo/vector-icons
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme as t } from '../theme/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Keep the bottom bar intentionally focused; every resident feature remains reachable
// from the dashboard and stays inside this same tab navigator.
const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  index: { label: 'Home', icon: 'home-outline', iconActive: 'home' },
  activity: { label: 'Activity', icon: 'pulse-outline', iconActive: 'pulse' },
  notifications: { label: 'Notifications', icon: 'notifications-outline', iconActive: 'notifications' },
  profile: { label: 'Profile', icon: 'person-outline', iconActive: 'person' },
};

export default function CBTabBar({ state, navigation }: { state: any; navigation: any }) {
  const insets = useSafeAreaInsets();

  const visible = state.routes.filter((r) => TABS[r.name]);
  const left = visible.slice(0, 2);
  const right = visible.slice(2);

  const renderTab = (route: (typeof state.routes)[number]) => {
    const meta = TABS[route.name];
    const focused = state.routes[state.index]?.key === route.key;

    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
    };

    return (
      <TouchableOpacity key={route.key} style={s.item} onPress={onPress} activeOpacity={0.7}>
        <Ionicons name={focused ? meta.iconActive : meta.icon} size={22} color={focused ? t.gold : t.muted} />
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
  bar: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#0A0A0A',
    borderTopWidth: 1,
    borderTopColor: t.border,
    paddingTop: 8,
  },
  item: { alignItems: 'center', justifyContent: 'center', minWidth: 60, minHeight: 48, paddingHorizontal: 4 },
  label: { color: t.muted, fontSize: 10, marginTop: 2 },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: t.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -26,
    borderWidth: 4,
    borderColor: t.bg,
  },
});
