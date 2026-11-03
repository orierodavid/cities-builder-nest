import React from 'react';
import { Screen, SectionTitle, EmptyState, GoldButton } from '../../src/components/ui';

export default function MaintainScreen() {
  return (
    <Screen title="Maintenance" subtitle="Report and track property issues">
      <GoldButton label="Maintenance requests" disabled />
      <SectionTitle>My requests</SectionTitle>
      <EmptyState icon="tools" title="No maintenance requests" message="Your submitted maintenance requests and their status will appear here." />
    </Screen>
  );
}
