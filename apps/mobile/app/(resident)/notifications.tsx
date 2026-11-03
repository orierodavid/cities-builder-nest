import React from 'react';
import { Screen, SectionTitle, EmptyState } from '../../src/components/ui';

export default function NotificationsScreen() {
  return (
    <Screen title="Notifications" subtitle="Updates from your estate">
      <SectionTitle>Recent</SectionTitle>
      <EmptyState icon="bell-outline" title="You're all caught up" message="Estate announcements and visitor alerts will show up here." />
    </Screen>
  );
}
