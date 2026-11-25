import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Screen, Card, SectionTitle } from '../../../src/components/ui';
import { supabase } from '../../../src/lib/supabase';
import { theme } from '../../../src/theme/theme';

type Identity = {
  id_code: string;
  status: string;
  created_at: string;
  resident_name: string;
  unit_id: string | null;
  unit_code: string | null;
  estate_id: string | null;
  estate_name: string | null;
};

function errorDetails(error: any) {
  return [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean).join(' ').toLowerCase();
}

function isCancellation(error: any) {
  const value = errorDetails(error);
  return error?.name === 'AbortError' || /abort|cancelled|canceled|request was cancelled/.test(value);
}

export default function MyIdScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestVersion = useRef(0);

  useEffect(() => {
    let active = true;
    const resolveUser = async () => {
      const { data, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !data.user) {
        console.warn('[CB Nest My ID] Session lookup failed', {
          message: authError?.message, code: authError?.code,
        });
        setError('Your session could not be verified. Please sign in again.');
        setLoading(false);
        return;
      }
      setUserId(data.user.id);
    };
    void resolveUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUserId(session?.user?.id ?? null);
    });
    return () => {
      active = false;
      requestVersion.current += 1;
      subscription.unsubscribe();
    };
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    const version = ++requestVersion.current;
    setLoading(true);
    setError('');
    const { data, error: identityError } = await supabase.rpc('get_my_resident_identity');
    if (version !== requestVersion.current) return;
    if (identityError) {
      if (isCancellation(identityError)) {
        setLoading(false);
        return;
      }
      console.warn('[CB Nest My ID] Identity RPC failed', {
        userId, message: identityError.message, details: identityError.details,
        hint: identityError.hint, code: identityError.code,
      });
      const detail = errorDetails(identityError);
      if (detail.includes('account_or_legal_access_required')) {
        setError('Please complete the CB Nest account and legal acceptance steps before opening your resident ID.');
      } else if (detail.includes('active_resident_required')) {
        setError('This account does not have an active resident membership. Please contact estate management.');
      } else if (detail.includes('resident_identity_unavailable')) {
        setError('Your CB Nest ID is not available yet. Please try again.');
      } else {
        setError('Your CB Nest ID could not be loaded. Check your connection and try again.');
      }
      setIdentity(null);
      setLoading(false);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.id_code) {
      setIdentity(row as Identity);
      setError('');
    } else {
      console.warn('[CB Nest My ID] Identity RPC returned no identity row', { userId });
      setIdentity(null);
      setError('Your CB Nest ID is not available yet. Please try again.');
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (userId) void load();
  }, [userId, load]);

  return (
    <Screen title="My ID" subtitle="Your personal CB Nest resident identity">
      <Card>
        <SectionTitle>Digital resident ID</SectionTitle>
        {loading ? (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <ActivityIndicator color={theme.gold} />
            <Text style={{ color: theme.muted, fontSize: 12, marginTop: 10 }}>Loading your resident ID…</Text>
          </View>
        ) : error ? (
          <View style={{ gap: 12 }}>
            <Text style={{ color: '#F2A5A5', fontSize: 13, lineHeight: 20 }}>{error}</Text>
            <TouchableOpacity onPress={() => void load()} style={{ minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: theme.gold, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: theme.goldSoft, fontWeight: '800' }}>TRY AGAIN</Text>
            </TouchableOpacity>
          </View>
        ) : identity ? (
          <View style={{ paddingVertical: 12 }}>
            <View style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 16, backgroundColor: '#090909', padding: 18 }}>
              <Text style={{ color: theme.gold, fontSize: 11, fontWeight: '900', letterSpacing: 1.4 }}>CB NEST · RESIDENT ID</Text>
              <Text style={{ color: theme.text, fontSize: 20, fontWeight: '900', marginTop: 12 }}>{identity.resident_name || 'CB Nest Resident'}</Text>
              <Text style={{ color: theme.muted, fontSize: 11, marginTop: 12 }}>ESTATE</Text>
              <Text style={{ color: theme.goldSoft, fontSize: 14, fontWeight: '800', marginTop: 3 }}>{identity.estate_name || 'Estate membership unavailable'}</Text>
              <Text style={{ color: theme.muted, fontSize: 11, marginTop: 12 }}>APARTMENT / UNIT</Text>
              <Text style={{ color: identity.unit_code ? theme.text : theme.goldSoft, fontSize: 15, fontWeight: '800', marginTop: 3 }}>
                {identity.unit_code ? identity.unit_code : 'Not assigned yet'}
              </Text>
              <View style={{ alignItems: 'center', marginTop: 18 }}>
                <View style={{ backgroundColor: '#FFFFFF', padding: 14, borderRadius: 14 }}>
                  <QRCode value={`CBNEST-BARRIER:v1:${identity.id_code}`} size={210} color="#050505" backgroundColor="#FFFFFF" />
                </View>
                <Text selectable style={{ color: theme.gold, fontSize: 14, fontWeight: '900', letterSpacing: 1.1, marginTop: 14 }}>
                  {identity.id_code}
                </Text>
                <Text style={{ color: theme.muted, fontSize: 11, textAlign: 'center', lineHeight: 17, marginTop: 8 }}>
                  Scan this QR code to identify your resident account. Each household resident has a separate CB Nest ID.
                </Text>
              </View>
            </View>
            {!identity.unit_id && (
              <Text style={{ color: theme.goldSoft, fontSize: 12, lineHeight: 19, marginTop: 14 }}>
                Your digital ID is ready, but estate management has not linked your account to an official apartment/unit yet. Your apartment details will appear here after the property register is updated and your assignment is confirmed.
              </Text>
            )}
          </View>
        ) : null}
      </Card>
      <Card>
        <SectionTitle>Barrier verification</SectionTitle>
        <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 19 }}>
          This QR code is prepared for CB Nest barrier verification. A physical gate scanner will only grant access after the estate’s barrier controller is connected to the secure CB Nest verification API.
        </Text>
      </Card>
    </Screen>
  );
}
