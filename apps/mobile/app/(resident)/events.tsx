import React from 'react';
import { Screen, SectionTitle, EmptyState } from '../../src/components/ui';

export default function EventsScreen() {
  return (
    <Screen title="Events" subtitle="Estate events and activities">
      <SectionTitle>Upcoming events</SectionTitle>
      <EmptyState icon="calendar-star" title="No upcoming events" message="Events published by your estate will appear here." />
    </Screen>
  );
}
