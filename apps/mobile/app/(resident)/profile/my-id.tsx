import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Screen, Card, SectionTitle } from '../../../src/components/ui';
import { supabase } from '../../../src/lib/supabase';
import { theme } from '../../../src/theme/theme';

type Identity = {
  id_code: string;
  status: string;
  created_at: string;
  unit_id: string;
  unit_code: string;
  estate_id: string;
  estate_name: string;
};

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
        const detail = identityError.message || '';
        setError(detail.includes('resident_apartment_assignment_required')
          ? 'Your estate membership is active, but no apartment has been assigned to your account yet. Ask estate management to assign your apartment under My Property. Your apartment-linked ID will appear here after that.'
          : detail.includes('active_resident_required')
            ? 'A verified resident account is required before your CB Nest ID can be created.'
            : 'Your apartment ID could not be loaded. Please refresh or contact estate management.');
      } else {
        const row = Array.isArray(data) ? data[0] : data;
        if (row?.id_code && row?.unit_id && row?.unit_code) setIdentity(row as Identity);
        else setError('Your apartment assignment is not complete yet. Ask estate management to link your account to your apartment.');
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  return (
    <Screen title="My ID" subtitle="Your apartment-linked CB Nest identity">
      <Card>
        <SectionTitle>My apartment ID</SectionTitle>
        {loading ? <ActivityIndicator color={theme.gold} /> : error ? (
          <Text style={{ color: '#F2A5A5', fontSize: 13, lineHeight: 20 }}>{error}</Text>
        ) : identity ? (
          <View style={{ alignItems: 'center', paddingVertical: 14 }}>
            <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}> {identity.estate_name.toUpperCase()} </Text>
            <Text style={{ color: theme.gold, fontSize: 22, fontWeight: '900', marginTop: 5 }}>APARTMENT {identity.unit_code}</Text>
            <View style={{ backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, marginTop: 18 }}>
              <QRCode value={`CBNEST-BARRIER:v1:${identity.id_code}`} size={220} color="#050505" backgroundColor="#FFFFFF" />
            </View>
            <Text selectable style={{ color: theme.gold, fontSize: 16, fontWeight: '900', letterSpacing: 1.2, marginTop: 18 }}>
              {identity.id_code}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 12, textAlign: 'center', lineHeight: 19, marginTop: 12 }}>
              This unique code is linked to your CB Nest account and assigned apartment. Each household resident has a separate identity code linked to the same apartment.
            </Text>
          </View>
        ) : null}
      </Card>
      <Card>
        <SectionTitle>Barrier verification</SectionTitle>
        <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 19 }}>
          The barcode is formatted for CB Nest barrier verification. A physical gate scanner/barrier will only grant access after the estate’s barrier controller is connected to the secure CB Nest verification API. Displaying this code alone does not open a gate.
        </Text>
      </Card>
    </Screen>
  );
}
