import React from 'react';
import { Screen, SectionTitle, EmptyState } from '../../src/components/ui';

export default function AnnouncementsScreen() {
  return (
    <Screen title="Announcements" subtitle="Important updates from estate management">
      <SectionTitle>Latest announcements</SectionTitle>
      <EmptyState icon="bullhorn-outline" title="No announcements yet" message="Official notices from your estate management team will appear here." />
    </Screen>
  );
}
