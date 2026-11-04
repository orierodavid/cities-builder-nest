import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Screen, SectionTitle, EmptyState, GoldButton, Card } from '../../src/components/ui';
import { supabase } from '../../lib/supabase';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { theme } from '../../src/theme/theme';

type Estate = { id: string; membershipRole?: string | null };
type Pass = { id: string; visitor_name: string; valid_from: string; valid_until: string; status: string; created_at: string };
const apiUrl = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '');

function apiMessage(code?: string) {
  if (code === 'estate_membership_required') return 'Only an active resident of this estate can manage visitor passes.';
  if (code === 'estate_subscription_inactive') return 'This estate is temporarily unavailable because its subscription is inactive.';
  if (code === 'visitor_pass_create_failed') return 'The visitor pass could not be created. Confirm your estate membership and try again.';
  if (code === 'visitor_pass_list_failed') return 'Visitor pass history could not be loaded.';
  return code ? 'Visitor request failed (' + code + ').' : 'The request failed. Check your connection and try again.';
}

export default function VisitorsScreen() {
  const [estateId, setEstateId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [visitorName, setVisitorName] = useState('');
  const [message, setMessage] = useState('');
  const [passes, setPasses] = useState<Pass[]>([]);
  const [issuedCode, setIssuedCode] = useState('');

  const request = useCallback(async (path: string, method: 'GET' | 'POST', token: string, body?: unknown) => {
    if (!apiUrl) throw new Error('API address is not configured. Set EXPO_PUBLIC_API_URL and restart the app.');
    const response = await fetch(apiUrl + '/v1/estates/' + encodeURIComponent(estateId) + path, {
      method, headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json() as { error?: string; visitorPasses?: Pass[]; accessCode?: string };
    if (!response.ok) throw new Error(apiMessage(result.error));
    return result;
  }, [estateId]);

  const loadPasses = useCallback(async (token: string) => {
    const result = await request('/visitor-passes', 'GET', token);
    setPasses(result.visitorPasses || []);
  }, [request]);

  const initialize = useCallback(async () => {
    setLoading(true); setMessage('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.');
      if (!apiUrl) throw new Error('API address is not configured. Set EXPO_PUBLIC_API_URL and restart the app.');
      const response = await fetch(apiUrl + '/v1/estates', { headers: { Authorization: 'Bearer ' + session.access_token, Accept: 'application/json' } });
      const result = await response.json() as { estates?: Estate[]; error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not load your estate membership.');
      const residentEstate = (result.estates || []).find(e => (e.membershipRole || '').toLowerCase().replace(/-/g, '_') === 'resident');
      if (!residentEstate) throw new Error('No active resident estate membership was found for this account.');
      setEstateId(residentEstate.id);
      const passResponse = await fetch(apiUrl + '/v1/estates/' + encodeURIComponent(residentEstate.id) + '/visitor-passes', { headers: { Authorization: 'Bearer ' + session.access_token, Accept: 'application/json' } });
      const passResult = await passResponse.json() as { visitorPasses?: Pass[]; error?: string };
      if (!passResponse.ok) throw new Error(apiMessage(passResult.error));
      setPasses(passResult.visitorPasses || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load visitor management.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void initialize(); }, [initialize]);

  async function createPass() {
    const name = visitorName.trim();
    if (!name) { setMessage('Enter your visitor’s name.'); return; }
    setBusy(true); setMessage(''); setIssuedCode('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || !estateId) throw new Error('Your session or estate membership is unavailable. Please refresh and try again.');
      const result = await request('/visitor-passes', 'POST', session.access_token, { visitorName: name });
      const code = result.accessCode || '';
      if (!code) throw new Error('The pass was created, but the API did not return an access code. Refresh pass history and contact support.');
      setIssuedCode(code); setVisitorName('');
      await Clipboard.setStringAsync(code);
      setMessage('Visitor pass generated. The access code has been copied to your clipboard.');
      await loadPasses(session.access_token);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create visitor pass.');
    } finally { setBusy(false); }
  }

  return (
    <Screen title="Visitor Management" subtitle="Create and manage access passes for your visitors">
      <SectionTitle>Generate access code</SectionTitle>
      <Card>
        <Text style={{ color: theme.text, fontSize: 13, marginBottom: 8 }}>Visitor name</Text>
        <TextInput value={visitorName} onChangeText={setVisitorName} placeholder="Enter visitor’s full name" placeholderTextColor={theme.muted} autoCapitalize="words" style={{ color: theme.text, borderColor: theme.border, borderWidth: 1, borderRadius: 10, padding: 13, marginBottom: 12 }} />
        <GoldButton label={busy ? 'Generating…' : 'Generate visitor code'} onPress={createPass} disabled={busy || loading || !estateId} />
        {busy ? <ActivityIndicator color={theme.gold} style={{ marginTop: 12 }} /> : null}
      </Card>
      {issuedCode ? <Card>
        <Text style={{ color: theme.gold, fontWeight: '700', marginBottom: 12 }}>Your visitor access code</Text>
        <Text selectable style={{ color: theme.text, fontSize: 30, fontWeight: '800', letterSpacing: 7, textAlign: 'center', marginBottom: 16 }}>{issuedCode}</Text>
        <View style={{ alignItems: 'center', marginBottom: 14 }}><QRCode value={issuedCode} size={176} backgroundColor="#FFFFFF" color="#000000" /></View>
        <TouchableOpacity onPress={() => Clipboard.setStringAsync(issuedCode)} style={{ padding: 12, borderRadius: 10, backgroundColor: theme.gold, alignItems: 'center' }}><Text style={{ color: '#000', fontWeight: '700' }}>Copy access code</Text></TouchableOpacity>
      </Card> : null}
      {message ? <Text accessibilityRole="alert" style={{ color: theme.goldSoft, marginBottom: 12 }}>{message}</Text> : null}
      <SectionTitle>Visitor pass history</SectionTitle>
      {loading ? <ActivityIndicator color={theme.gold} /> : passes.length ? passes.map(pass => <Card key={pass.id}>
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>{pass.visitor_name}</Text>
        <Text style={{ color: theme.muted, marginTop: 5 }}>Status: {pass.status}</Text>
        <Text style={{ color: theme.muted, marginTop: 3 }}>Valid until: {new Date(pass.valid_until).toLocaleString()}</Text>
      </Card>) : <EmptyState icon="account-multiple-outline" title="No visitor passes yet" message="Visitor passes you create will appear here." />}
      {!loading ? <TouchableOpacity onPress={() => void initialize()} style={{ padding: 12, alignItems: 'center' }}><Text style={{ color: theme.gold }}>Refresh visitor history</Text></TouchableOpacity> : null}
    </Screen>
  );
}
