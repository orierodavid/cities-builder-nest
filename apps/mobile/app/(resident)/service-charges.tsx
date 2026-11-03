import React from 'react';
import { Screen, SectionTitle, EmptyState, ListRow } from '../../src/components/ui';
import { useRouter } from 'expo-router';

export default function ServiceChargesScreen() {
  const router = useRouter();
  return (
    <Screen title="Service Charges" subtitle="Your estate service charge account">
      <ListRow icon="receipt" title="Payment history" subtitle="View payments made against service charges" onPress={() => router.push('/payments' as never)} />
      <SectionTitle>Current charges</SectionTitle>
      <EmptyState icon="file-document-outline" title="No service charges available" message="Charges assigned to your property will appear here when published by estate management." />
    </Screen>
  );
}
