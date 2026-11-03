import React from 'react';
import { Screen, SectionTitle, EmptyState } from '../../src/components/ui';

export default function ActivityScreen() {
  return (
    <Screen title="Activity" subtitle="Your recent estate activity">
      <SectionTitle>Recent activity</SectionTitle>
      <EmptyState icon="history" title="No recent activity" message="Your visitor, maintenance and account activity will appear here when available." />
    </Screen>
  );
}
