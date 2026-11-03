import React from 'react';
import { Screen, SectionTitle, EmptyState } from '../../src/components/ui';

export default function PaymentsScreen() {
  return (
    <Screen title="Payments" subtitle="Service charge payment records">
      <SectionTitle>Payment history</SectionTitle>
      <EmptyState icon="cash-multiple" title="No payment records" message="Your confirmed service charge payments will appear here when available." />
    </Screen>
  );
}
