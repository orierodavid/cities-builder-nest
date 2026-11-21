import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, SectionTitle, Card, ListRow } from '../../src/components/ui';
import { theme } from '../../src/theme/theme';

export default function SupportScreen() {
  const router = useRouter();
  const open = (route: string) => router.push((route === '/wallet' ? '/(resident)/wallet' : `/(resident)${route}`) as never);

  return (
    <Screen title="Support" subtitle="Find help with your CB Nest account and estate services">
      <Card>
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>How can we help?</Text>
        <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginTop: 6 }}>
          Choose the area related to your question. Each option takes you directly to the relevant CB Nest service.
        </Text>
      </Card>

      <SectionTitle>Account and payments</SectionTitle>
      <ListRow icon="wallet-outline" title="Wallet and top ups" subtitle="Balance, adding money and wallet transactions" onPress={() => open('/wallet')} />
      <ListRow icon="receipt-text-outline" title="Payments and receipts" subtitle="Review payment history and payment status" onPress={() => open('/payments')} />
      <ListRow icon="cash-multiple" title="Service charges" subtitle="View estate charges and invoices" onPress={() => open('/service-charges')} />

      <SectionTitle>Estate services</SectionTitle>
      <ListRow icon="account-multiple-outline" title="Visitors and access" subtitle="Visitor codes and access history" onPress={() => open('/visitors')} />
      <ListRow icon="tools" title="Maintenance requests" subtitle="Report and follow up on property issues" onPress={() => open('/maintain')} />
      <ListRow icon="account-group-outline" title="Community updates" subtitle="View available estate community information" onPress={() => open('/community')} />

      <Card style={{ marginTop: 8 }}>
        <View style={{ gap: 6 }}>
          <Text style={{ color: theme.goldSoft, fontSize: 12, fontWeight: '800' }}>NEED MORE HELP?</Text>
          <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18 }}>
            For account-specific assistance, contact your estate management team through the support channel provided by your estate.
          </Text>
        </View>
      </Card>
    </Screen>
  );
}
