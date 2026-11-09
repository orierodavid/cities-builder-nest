import React from 'react';
import { Tabs } from 'expo-router';
import CBTabBar from '../../src/components/CBTabBar';
import { theme } from '../../src/theme/theme';

export default function ResidentLayout() {
  return (
    <Tabs
      tabBar={(props) => <CBTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: false,
        sceneStyle: { backgroundColor: theme.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="community" options={{ title: 'Community' }} />
      <Tabs.Screen name="maintain" options={{ title: 'Maintenance' }} />
      <Tabs.Screen name="property" options={{ title: 'Property' }} />
      <Tabs.Screen name="visitors" options={{ title: 'Visitors' }} />
      <Tabs.Screen name="events" options={{ title: 'Events' }} />
      <Tabs.Screen name="service-charges" options={{ title: 'Service Charges' }} />
      <Tabs.Screen name="payments" options={{ title: 'Payments' }} />
      <Tabs.Screen name="utilities" options={{ title: 'Utilities' }} />
      <Tabs.Screen name="electricity" options={{ title: 'Electricity', href: null }} />
      <Tabs.Screen name="create-event" options={{ href: null }} />
      <Tabs.Screen name="[eventId]" options={{ href: null }} />
      <Tabs.Screen name="announcements" options={{ title: 'Announcements' }} />
    </Tabs>
  );
}
