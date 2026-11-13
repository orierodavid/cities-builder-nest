import React from 'react';
import { Text, View } from 'react-native';
import { Screen, SectionTitle, EmptyState, Card } from '../../src/components/ui';
import { theme } from '../../src/theme/theme';

export default function ResidentEventsRoute() {
  return (
    <Screen title="Community Events" subtitle="Discover activities and events in your estate">
      <SectionTitle>Upcoming events</SectionTitle>
      <Card>
        <View style={{ gap: 8 }}>
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>Stay connected with your community</Text>
          <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18 }}>
            Events published for your estate will appear here. Check back for updates from your estate team.
          </Text>
        </View>
      </Card>
      <EmptyState icon="calendar-blank-outline" title="No upcoming events" message="There are no published community events to display right now." />
    </Screen>
  );
}
