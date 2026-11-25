import React from 'react';
import { Stack } from 'expo-router';
import { theme } from '../../../src/theme/theme';

export default function ProfileStackLayout() {
  return (
    <Stack screenOptions={{
      headerShown: false,
      gestureEnabled: true,
      animation: 'slide_from_right',
      contentStyle: { backgroundColor: theme.bg },
    }} />
  );
}
