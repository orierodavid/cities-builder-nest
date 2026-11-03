import React from 'react';
import { Screen, Card, SectionTitle, ListRow, EmptyState } from '../../src/components/ui';

export default function PropertyScreen() {
  return (
    <Screen title="My Property" subtitle="Your home and occupancy details">
      <Card>
        <SectionTitle>Property information</SectionTitle>
        <EmptyState icon="home-city-outline" title="Property details unavailable" message="Your assigned property information will appear here once loaded from your resident account." />
      </Card>
      <ListRow icon="file-document-outline" title="Property documents" subtitle="Documents shared by estate management" />
    </Screen>
  );
}
