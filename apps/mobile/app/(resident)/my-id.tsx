import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Screen, Card, SectionTitle } from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import { theme } from '../../src/theme/theme';

type Identity = { id_code: string; status: string; created_at: string };

export default function MyIdScreen() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error: identityError } = await supabase.rpc('get_my_resident_identity');
      if (!active) return;
      if (identityError) {
        setError(identityError.message.includes('active_resident_required')
          ? 'A verified resident account is required before your CB Nest ID can be created.'
          : 'Your resident ID could not be loaded. Please try again.');
      } else {
        const row = Array.isArray(data) ? data[0] : data;
        if (row?.id_code) setIdentity(row as Identity);
        else setError('Your resident ID is not available yet.');
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  return (
    <Screen title="My ID" subtitle="Your personal CB Nest resident identity">
      <Card>
        <SectionTitle>Resident identification</SectionTitle>
        {loading ? <ActivityIndicator color={theme.gold} /> : error ? (
          <Text style={{ color: '#F2A5A5', fontSize: 13, lineHeight: 20 }}>{error}</Text>
        ) : identity ? (
          <View style={{ alignItems: 'center', paddingVertical: 14 }}>
            <View style={{ backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16 }}>
              <QRCode value={`CBNEST-ID:${identity.id_code}`} size={220} color="#050505" backgroundColor="#FFFFFF" />
            </View>
            <Text selectable style={{ color: theme.gold, fontSize: 17, fontWeight: '900', letterSpacing: 1.2, marginTop: 20 }}>
              {identity.id_code}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 12, textAlign: 'center', lineHeight: 19, marginTop: 12 }}>
              This ID belongs to your personal resident account. Keep the QR code private and show it only when identification is requested.
            </Text>
          </View>
        ) : null}
      </Card>
      <Card>
        <SectionTitle>Gate access readiness</SectionTitle>
        <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 19 }}>
          Your resident ID is prepared for future CB Nest gate-barrier integration. It is an identity credential, not a visitor pass or an active gate-opening permission. Gate scanners will only be enabled after the barrier verification system is connected.
        </Text>
      </Card>
    </Screen>
  );
}
