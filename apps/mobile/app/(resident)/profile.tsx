import React from 'react';
import { Screen, Card, SectionTitle, ListRow } from '../../src/components/ui';
import { useRouter } from 'expo-router';

export default function ProfileScreen() {
  const router = useRouter();
  return (
    <Screen title="My Profile" subtitle="Your account and resident preferences">
      <Card>
        <SectionTitle>Account</SectionTitle>
        <ListRow icon="account-outline" title="Personal details" subtitle="View your resident account information" />
        <ListRow icon="home-city-outline" title="My property" subtitle="View your assigned property" onPress={() => router.push('/property' as never)} />
      </Card>
      <Card>
        <SectionTitle>Preferences & support</SectionTitle>
        <ListRow icon="bell-outline" title="Notifications" subtitle="Estate updates and alerts" onPress={() => router.push('/notifications' as never)} />
        <ListRow icon="shield-check-outline" title="Privacy & security" subtitle="Account security and privacy settings" />
        <ListRow icon="help-circle-outline" title="Help & support" subtitle="Get assistance from estate management" />
      </Card>
    </Screen>
  );
}
