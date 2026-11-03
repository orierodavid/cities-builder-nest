import React from 'react';
import { Screen, SectionTitle, EmptyState } from '../../src/components/ui';

export default function CommunityScreen() {
  return (
    <Screen title="Community" subtitle="Connect with your estate">
      <SectionTitle>Community updates</SectionTitle>
      <EmptyState icon="account-group-outline" title="Community updates will appear here" message="Community posts and resident activities will be shown when the estate community feed is available." />
    </Screen>
  );
}
