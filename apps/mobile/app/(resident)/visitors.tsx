import React from 'react';
import { Screen, SectionTitle, EmptyState, GoldButton } from '../../src/components/ui';
import { useRouter } from 'expo-router';

export default function VisitorsScreen() {
  const router = useRouter();
  return (
    <Screen title="Visitors" subtitle="Manage visits to your home">
      <GoldButton label="Generate visitor code" onPress={() => router.push('/access-code' as never)} />
      <SectionTitle>Visitor history</SectionTitle>
      <EmptyState icon="account-multiple-outline" title="No visitor records to show" message="Your visitor pass history will appear here when records are available." />
    </Screen>
  );
}
