import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Screen, SectionTitle, EmptyState, GoldButton, Card } from '../../src/components/ui';
import { supabase } from '../../lib/supabase';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { theme } from '../../src/theme/theme';
import { getApiBaseUrl } from '../../src/lib/api-url';

type Estate = { id: string; membershipRole?: string | null };
type Pass = { id: string; visitor_name: string; valid_from: string; valid_until: string; status: string; created_at: string; accessCode?: string | null };
const apiUrl = getApiBaseUrl();

function apiMessage(code?: string) {
  if (code === 'estate_membership_required') return 'Only an active resident of this estate can manage visitor passes.';
  if (code === 'estate_subscription_inactive') return 'This estate is temporarily unavailable because its subscription is inactive.';
  if (code === 'visitor_pass_create_failed') return 'The visitor pass could not be created. Confirm your estate membership and try again.';
  if (code === 'visitor_pass_list_failed') return 'Visitor pass history could not be loaded.';
  if (code === 'visitor_pass_expired') return 'This visitor pass has expired and cannot be activated.';
  if (code === 'visitor_pass_not_reactivatable') return 'A used or expired visitor pass cannot be activated again.';
  if (code === 'visitor_pass_not_found') return 'This visitor pass could not be found.';
  if (code === 'visitor_pass_status_update_failed') return 'The visitor pass status could not be updated. Refresh and try again.';
  if (code === 'visitor_code_storage_not_configured') return 'Visitor code history is not configured yet. Please contact support.';
  return 'Visitor management is temporarily unavailable. Please try again.';
}

export default function VisitorsScreen() {
  const [estateId, setEstateId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [visitorName, setVisitorName] = useState('');
  const [message, setMessage] = useState('');
  const [passes, setPasses] = useState<Pass[]>([]);
  const [issuedCode, setIssuedCode] = useState('');
  const [updatingPassId, setUpdatingPassId] = useState('');

  const request = useCallback(async (path: string, method: 'GET' | 'POST' | 'PATCH', token: string, body?: unknown) => {
    if (!apiUrl) throw new Error('Visitor passes are temporarily unavailable. Please try again later.');
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
      if (!apiUrl) throw new Error('Visitor management is temporarily unavailable. Please try again later.');
      const response = await fetch(apiUrl + '/v1/estates', { headers: { Authorization: 'Bearer ' + session.access_token, Accept: 'application/json' } });
      const result = await response.json() as { estates?: Estate[]; error?: string };
      if (!response.ok) throw new Error('Could not load your estate details. Please try again.');
      const residentEstate = (result.estates || []).find(e => (e.membershipRole || '').toLowerCase().replace(/-/g, '_') === 'resident');
      if (!residentEstate) throw new Error('No active resident estate membership was found for this account.');
      setEstateId(residentEstate.id);
      const passResponse = await fetch(apiUrl + '/v1/estates/' + encodeURIComponent(residentEstate.id) + '/visitor-passes', { headers: { Authorization: 'Bearer ' + session.access_token, Accept: 'application/json' } });
      const passResult = await passResponse.json() as { visitorPasses?: Pass[]; error?: string };
      if (!passResponse.ok) throw new Error(apiMessage(passResult.error));
      setPasses(passResult.visitorPasses || []);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Could not load visitor management.';
      setMessage(/fetch failed|network request failed|network error/i.test(detail) ? 'Visitor management is temporarily unavailable. Please try again.' : detail);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void initialize(); }, [initialize]);

  async function updatePassStatus(pass: Pass) {
    const nextStatus = pass.status === 'active' ? 'revoked' : 'active';
    setUpdatingPassId(pass.id); setMessage('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.');
      await request('/visitor-passes/' + encodeURIComponent(pass.id) + '/status', 'PATCH', session.access_token, { status: nextStatus });
      await loadPasses(session.access_token);
      setMessage(nextStatus === 'active' ? 'Visitor pass activated.' : 'Visitor pass deactivated.');
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      setMessage(detail || 'The visitor pass status could not be updated. Please try again.');
    } finally { setUpdatingPassId(''); }
  }

  async function createPass() {
    const name = visitorName.trim();
    if (!name) { setMessage('Enter your visitor’s name.'); return; }
    setBusy(true); setMessage(''); setIssuedCode('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || !estateId) throw new Error('Your session or estate membership is unavailable. Please refresh and try again.');
      const result = await request('/visitor-passes', 'POST', session.access_token, { visitorName: name });
      const code = result.accessCode || '';
      if (!code) throw new Error('The visitor pass was created, but its access code is not available yet. Please refresh your visitor history.');
      setIssuedCode(code); setVisitorName('');
      await Clipboard.setStringAsync(code);
      setMessage('Visitor pass generated. The access code has been copied to your clipboard.');
      await loadPasses(session.access_token);
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      setMessage(detail || 'We could not create the visitor pass. Please try again.');
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
      {loading ? <ActivityIndicator color={theme.gold} /> : passes.length ? passes.map(pass => {
        const canToggle = pass.status === 'active' || pass.status === 'revoked';
        const active = pass.status === 'active';
        return <Card key={pass.id}>
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>{pass.visitor_name}</Text>
          <Text style={{ color: active ? '#2FB36D' : theme.muted, marginTop: 6, fontWeight: '800' }}>{active ? 'ACTIVE' : 'INACTIVE'}</Text>
          <Text style={{ color: theme.muted, marginTop: 3 }}>Valid until: {new Date(pass.valid_until).toLocaleString()}</Text>
          {pass.accessCode ? <>
            <Text style={{ color: theme.gold, fontWeight: '700', marginTop: 12, marginBottom: 7 }}>Visitor access code</Text>
            <Text selectable style={{ color: theme.text, fontSize: 25, fontWeight: '900', letterSpacing: 6, textAlign: 'center', paddingVertical: 8 }}>{pass.accessCode}</Text>
            <TouchableOpacity onPress={() => { void Clipboard.setStringAsync(pass.accessCode || ''); setMessage('Visitor access code copied.'); }} style={{ padding: 10, borderRadius: 9, borderWidth: 1, borderColor: theme.border, alignItems: 'center', marginTop: 5 }}><Text style={{ color: theme.gold, fontWeight: '700' }}>Copy access code</Text></TouchableOpacity>
          </> : <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 17, marginTop: 10 }}>The original code for this older pass cannot be recovered. Generate a new visitor pass to get a code you can view later.</Text>}
          {canToggle ? <TouchableOpacity disabled={updatingPassId === pass.id} onPress={() => void updatePassStatus(pass)} style={{ padding: 12, borderRadius: 9, backgroundColor: active ? '#2B1717' : '#302719', alignItems: 'center', marginTop: 12, opacity: updatingPassId === pass.id ? 0.5 : 1 }}><Text style={{ color: active ? '#F28B82' : theme.gold, fontWeight: '800' }}>{updatingPassId === pass.id ? 'UPDATING…' : active ? 'DEACTIVATE PASS' : 'ACTIVATE PASS'}</Text></TouchableOpacity> : <Text style={{ color: theme.muted, fontSize: 11, marginTop: 10 }}>{pass.status === 'used' ? 'This pass has already been used and cannot be reactivated.' : 'This pass has expired.'}</Text>}
        </Card>;
      }) : <EmptyState icon="account-multiple-outline" title="No visitor passes yet" message="Visitor passes you create will appear here." />}
      {!loading ? <TouchableOpacity onPress={() => void initialize()} style={{ padding: 12, alignItems: 'center' }}><Text style={{ color: theme.gold }}>Refresh visitor history</Text></TouchableOpacity> : null}
    </Screen>
  );
}
