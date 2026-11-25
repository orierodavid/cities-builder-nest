import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Contacts from 'expo-contacts';
import { Screen, SectionTitle, EmptyState, GoldButton, Card } from '../../src/components/ui';
import { supabase } from '../../lib/supabase';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { theme } from '../../src/theme/theme';
import { getApiBaseUrl } from '../../src/lib/api-url';

type Estate = { id: string; membershipRole?: string | null };
type Frequency = 'once' | 'daily' | 'weekly';
type Pass = { id: string; visitor_name: string; visitor_phone?: string | null; visitor_count?: number; visit_frequency?: Frequency; schedule_start_date?: string; schedule_end_date?: string; valid_from: string; valid_until: string; status: string; created_at: string; accessCode?: string | null };
const apiUrl = getApiBaseUrl();
const today = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'); };
const dateLabel = (value?: string) => value ? new Date(value + 'T00:00:00').toLocaleDateString() : '—';

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
  const [visitorPhone, setVisitorPhone] = useState('');
  const [visitorCount, setVisitorCount] = useState('1');
  const [frequency, setFrequency] = useState<Frequency>('once');
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [message, setMessage] = useState('');
  const [passes, setPasses] = useState<Pass[]>([]);
  const [issuedCode, setIssuedCode] = useState('');
  const [issuedPass, setIssuedPass] = useState<Pass | null>(null);
  const [updatingPassId, setUpdatingPassId] = useState('');

  const request = useCallback(async (path: string, method: 'GET' | 'POST' | 'PATCH', token: string, body?: unknown) => {
    if (!apiUrl) throw new Error('Visitor passes are temporarily unavailable. Please try again later.');
    const response = await fetch(apiUrl + '/v1/estates/' + encodeURIComponent(estateId) + path, {
      method, headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json() as { error?: string; visitorPasses?: Pass[]; accessCode?: string; visitorPass?: Pass };
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

  async function chooseContact() {
    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        setMessage('Contact access was not granted. You can still enter visitor details manually.');
        return;
      }
      const result = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        sort: Contacts.SortTypes.FirstName,
        pageSize: 500,
      });
      const choices = (result.data || []).filter(contact => !!contact.name && !!contact.phoneNumbers?.length).slice(0, 12);
      if (!choices.length) { setMessage('No contacts with phone numbers were found.'); return; }
      Alert.alert('Choose a visitor', 'Select a contact to fill in the visitor details.', [
        ...choices.slice(0, 10).map(contact => ({
          text: contact.name || 'Contact',
          onPress: () => {
            setVisitorName(contact.name || '');
            setVisitorPhone(contact.phoneNumbers?.[0]?.number || '');
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ]);
    } catch {
      setMessage('Your contacts could not be opened. Enter the visitor details manually.');
    }
  }

  async function shareWhatsApp(code: string, pass?: Pass | null) {
    const details = [
      'CB Nest Visitor Access Pass',
      'Visitor: ' + (pass?.visitor_name || visitorName || 'Visitor'),
      'Phone: ' + (pass?.visitor_phone || visitorPhone || 'Not provided'),
      'Number of visitors: ' + String(pass?.visitor_count || visitorCount || 1),
      'Frequency: ' + String(pass?.visit_frequency || frequency).toUpperCase(),
      'Visit date: ' + (pass?.schedule_start_date || startDate) + ((pass?.schedule_end_date || endDate) !== (pass?.schedule_start_date || startDate) ? ' to ' + (pass?.schedule_end_date || endDate) : ''),
      'Access code: ' + code,
      'Please present this code to estate security.',
    ].join('\n');
    const url = 'https://wa.me/?text=' + encodeURIComponent(details);
    try { await Linking.openURL(url); } catch { setMessage('WhatsApp could not be opened. Copy the access code and share it manually.'); }
  }

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
    const count = Number(visitorCount);
    if (!name) { setMessage('Enter your visitor’s name.'); return; }
    if (!Number.isInteger(count) || count < 1 || count > 50) { setMessage('Enter a visitor count between 1 and 50.'); return; }
    if (!/^\\+?[0-9 ()-]{7,40}$/.test(visitorPhone.trim())) { setMessage('Enter a valid visitor phone number.'); return; }
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(startDate) || !/^\\d{4}-\\d{2}-\\d{2}$/.test(endDate) || endDate < startDate) { setMessage('Choose valid visit start and end dates.'); return; }
    if (frequency === 'once' && endDate !== startDate) { setMessage('For a one-time visit, the start and end dates must be the same.'); return; }
    setBusy(true); setMessage(''); setIssuedCode(''); setIssuedPass(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || !estateId) throw new Error('Your session or estate membership is unavailable. Please refresh and try again.');
      const result = await request('/visitor-passes', 'POST', session.access_token, {
        visitorName: name, visitorPhone: visitorPhone.trim(), visitorCount: count,
        frequency, scheduleStartDate: startDate, scheduleEndDate: endDate,
      });
      const code = result.accessCode || '';
      if (!code) throw new Error('The visitor pass was created, but its access code is not available yet. Please refresh your visitor history.');
      const pass = result.visitorPass || null;
      setIssuedCode(code); setIssuedPass(pass); setVisitorName(''); setVisitorPhone(''); setVisitorCount('1');
      await Clipboard.setStringAsync(code);
      setMessage('Visitor pass generated. The access code has been copied to your clipboard.');
      await loadPasses(session.access_token);
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      setMessage(detail || 'We could not create the visitor pass. Please try again.');
    } finally { setBusy(false); }
  }

  const inputStyle = { color: theme.text, borderColor: theme.border, borderWidth: 1, borderRadius: 10, padding: 13, marginBottom: 12 } as const;
  const labelStyle = { color: theme.text, fontSize: 13, marginBottom: 8 } as const;
  const dateInputStyle = { ...inputStyle, flex: 1, minWidth: 0 } as const;

  return (
    <Screen title="Visitor Management" subtitle="Create and manage access passes for your visitors">
      <SectionTitle>Generate access code</SectionTitle>
      <Card>
        <Text style={labelStyle}>Visitor name</Text>
        <TextInput value={visitorName} onChangeText={setVisitorName} placeholder="Enter visitor’s full name" placeholderTextColor={theme.muted} autoCapitalize="words" style={inputStyle} />
        <Text style={labelStyle}>Phone number</Text>
        <TextInput value={visitorPhone} onChangeText={setVisitorPhone} placeholder="Visitor phone number" placeholderTextColor={theme.muted} keyboardType="phone-pad" style={inputStyle} />
        <TouchableOpacity onPress={() => void chooseContact()} style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.gold, alignItems: 'center', marginBottom: 14 }}>
          <Text style={{ color: theme.gold, fontWeight: '800' }}>SELECT FROM CONTACTS</Text>
        </TouchableOpacity>
        <Text style={labelStyle}>How many visitors?</Text>
        <TextInput value={visitorCount} onChangeText={setVisitorCount} placeholder="1" placeholderTextColor={theme.muted} keyboardType="number-pad" style={inputStyle} />
        <Text style={labelStyle}>Frequency of visit</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          {([{ value: 'once', label: 'One-time' }, { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }] as const).map(option => (
            <TouchableOpacity key={option.value} onPress={() => { setFrequency(option.value); if (option.value === 'once') setEndDate(startDate); }} style={{ flex: 1, paddingVertical: 12, borderRadius: 9, borderWidth: 1, borderColor: frequency === option.value ? theme.gold : theme.border, backgroundColor: frequency === option.value ? '#302719' : theme.card, alignItems: 'center' }}>
              <Text style={{ color: frequency === option.value ? theme.gold : theme.muted, fontSize: 12, fontWeight: '800' }}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={labelStyle}>Start date (YYYY-MM-DD)</Text>
        <TextInput value={startDate} onChangeText={value => { setStartDate(value); if (frequency === 'once') setEndDate(value); }} placeholder="YYYY-MM-DD" placeholderTextColor={theme.muted} style={inputStyle} />
        {frequency !== 'once' ? <>
          <Text style={labelStyle}>End date (YYYY-MM-DD)</Text>
          <TextInput value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" placeholderTextColor={theme.muted} style={inputStyle} />
        </> : null}
        <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 17, marginBottom: 12 }}>Recurring passes are valid only on the selected daily or weekly schedule and within the start and end dates.</Text>
        <GoldButton label={busy ? 'Generating…' : 'Generate visitor code'} onPress={createPass} disabled={busy || loading || !estateId} />
        {busy ? <ActivityIndicator color={theme.gold} style={{ marginTop: 12 }} /> : null}
      </Card>
      {issuedCode ? <Card>
        <Text style={{ color: theme.gold, fontWeight: '700', marginBottom: 12 }}>Your visitor access code</Text>
        <Text selectable style={{ color: theme.text, fontSize: 30, fontWeight: '800', letterSpacing: 7, textAlign: 'center', marginBottom: 16 }}>{issuedCode}</Text>
        <View style={{ alignItems: 'center', marginBottom: 14 }}><QRCode value={issuedCode} size={176} backgroundColor="#FFFFFF" color="#000000" /></View>
        <TouchableOpacity onPress={() => Clipboard.setStringAsync(issuedCode)} style={{ padding: 12, borderRadius: 10, backgroundColor: theme.gold, alignItems: 'center' }}><Text style={{ color: '#000', fontWeight: '700' }}>Copy access code</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => void shareWhatsApp(issuedCode, issuedPass)} style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#25D366', alignItems: 'center', marginTop: 10 }}><Text style={{ color: '#25D366', fontWeight: '800' }}>SHARE ON WHATSAPP</Text></TouchableOpacity>
      </Card> : null}
      {message ? <Text accessibilityRole="alert" style={{ color: theme.goldSoft, marginBottom: 12 }}>{message}</Text> : null}
      <SectionTitle>Visitor pass history</SectionTitle>
      {loading ? <ActivityIndicator color={theme.gold} /> : passes.length ? passes.map(pass => {
        const canToggle = pass.status === 'active' || pass.status === 'revoked';
        const active = pass.status === 'active';
        return <Card key={pass.id}>
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>{pass.visitor_name}</Text>
          <Text style={{ color: active ? '#2FB36D' : theme.muted, marginTop: 6, fontWeight: '800' }}>{active ? 'ACTIVE' : 'INACTIVE'}</Text>
          <Text style={{ color: theme.muted, marginTop: 3 }}>Phone: {pass.visitor_phone || 'Not provided'}</Text>
          <Text style={{ color: theme.muted, marginTop: 3 }}>Visitors: {pass.visitor_count || 1}</Text>
          <Text style={{ color: theme.muted, marginTop: 3 }}>Frequency: {(pass.visit_frequency || 'once').toUpperCase()}</Text>
          <Text style={{ color: theme.muted, marginTop: 3 }}>Visit dates: {dateLabel(pass.schedule_start_date)}{pass.schedule_end_date && pass.schedule_end_date !== pass.schedule_start_date ? ' – ' + dateLabel(pass.schedule_end_date) : ''}</Text>
          {pass.accessCode ? <>
            <Text style={{ color: theme.gold, fontWeight: '700', marginTop: 12, marginBottom: 7 }}>Visitor access code</Text>
            <Text selectable style={{ color: theme.text, fontSize: 25, fontWeight: '900', letterSpacing: 6, textAlign: 'center', paddingVertical: 8 }}>{pass.accessCode}</Text>
            <TouchableOpacity onPress={() => { void Clipboard.setStringAsync(pass.accessCode || ''); setMessage('Visitor access code copied.'); }} style={{ padding: 10, borderRadius: 9, borderWidth: 1, borderColor: theme.border, alignItems: 'center', marginTop: 5 }}><Text style={{ color: theme.gold, fontWeight: '700' }}>Copy access code</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => void shareWhatsApp(pass.accessCode || '', pass)} style={{ padding: 10, borderRadius: 9, borderWidth: 1, borderColor: '#25D366', alignItems: 'center', marginTop: 8 }}><Text style={{ color: '#25D366', fontWeight: '800' }}>SHARE ON WHATSAPP</Text></TouchableOpacity>
          </> : <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 17, marginTop: 10 }}>The original code for this older pass cannot be recovered. Generate a new visitor pass to get a code you can view later.</Text>}
          {canToggle ? <TouchableOpacity disabled={updatingPassId === pass.id} onPress={() => void updatePassStatus(pass)} style={{ padding: 12, borderRadius: 9, backgroundColor: active ? '#2B1717' : '#302719', alignItems: 'center', marginTop: 12, opacity: updatingPassId === pass.id ? 0.5 : 1 }}><Text style={{ color: active ? '#F28B82' : theme.gold, fontWeight: '800' }}>{updatingPassId === pass.id ? 'UPDATING…' : active ? 'DEACTIVATE PASS' : 'ACTIVATE PASS'}</Text></TouchableOpacity> : <Text style={{ color: theme.muted, fontSize: 11, marginTop: 10 }}>{pass.status === 'used' ? 'This pass has already been used and cannot be reactivated.' : 'This pass has expired.'}</Text>}
        </Card>;
      }) : <EmptyState icon="account-multiple-outline" title="No visitor passes yet" message="Visitor passes you create will appear here." />}
      {!loading ? <TouchableOpacity onPress={() => void initialize()} style={{ padding: 12, alignItems: 'center' }}><Text style={{ color: theme.gold }}>Refresh visitor history</Text></TouchableOpacity> : null}
    </Screen>
  );
}
