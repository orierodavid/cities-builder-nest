import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Modal, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ContactsLegacy from 'expo-contacts/legacy';
import { Contact } from 'expo-contacts';
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
  const [visitorFirstName, setVisitorFirstName] = useState('');
  const [visitorLastName, setVisitorLastName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [contactPickerVisible, setContactPickerVisible] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  type VisitorContact = { id: string; givenName?: string | null; familyName?: string | null; fullName?: string | null; phones?: { number?: string | null }[] | null };
  const [contacts, setContacts] = useState<VisitorContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
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
    setMessage('');
    setContactsLoading(true);
    try {
      let permission = await ContactsLegacy.getPermissionsAsync();
      if (permission.status !== 'granted' && permission.canAskAgain) {
        permission = await ContactsLegacy.requestPermissionsAsync();
      }
      if (permission.status !== 'granted') {
        setMessage('CB Nest needs contacts permission to select a visitor. You can still enter the details manually.');
        if (!permission.canAskAgain) {
          Alert.alert(
            'Allow contact access',
            'Contact access is turned off for CB Nest. Open your device settings and allow Contacts access to use your address book.',
            [
              { text: 'Not now', style: 'cancel' },
              { text: 'Open settings', onPress: () => { void Linking.openSettings(); } },
            ],
          );
        }
        return;
      }

      // Use SDK 58's supported class-based reader; legacy is used only for permission prompts.
      const result = await Contact.getAllDetails(['givenName', 'familyName', 'fullName', 'phones'], {
        limit: 500,
        offset: 0,
      });
      const available = result.filter(
        contact => !!(contact.givenName?.trim() || contact.familyName?.trim() || contact.fullName?.trim())
          && !!contact.phones?.some(phone => !!phone.number?.trim()),
      );
      setContacts(available);
      setContactSearch('');
      setContactPickerVisible(true);
      if (!available.length) {
        setMessage('No contacts with phone numbers were found in the address book.');
      }
    } catch (error) {
      console.warn('[CB Nest contacts] Unable to read device contacts:', error);
      const detail = error instanceof Error ? error.message : String(error);
      setMessage('Contacts could not be loaded: ' + detail + '. You can still enter visitor details manually.');
    } finally {
      setContactsLoading(false);
    }
  }

  function selectContact(contact: VisitorContact) {
    const phone = contact.phones?.find(item => !!item.number?.trim())?.number || '';
    const fullName = (contact.fullName || '').trim();
    const givenName = (contact.givenName || '').trim();
    const familyName = (contact.familyName || '').trim();
    setVisitorFirstName(givenName || (fullName ? fullName.split(/\s+/)[0] : ''));
    setVisitorLastName(familyName || (fullName ? fullName.split(/\s+/).slice(1).join(' ') : ''));
    setVisitorPhone(phone);
    setContactPickerVisible(false);
    setContactSearch('');
    setMessage('');
  }


  async function shareWhatsApp(code: string, pass?: Pass | null) {
    const details = [
      'CB Nest Visitor Access Pass',
      'Visitor: ' + (pass?.visitor_name || [visitorFirstName, visitorLastName].filter(Boolean).join(' ') || 'Visitor'),
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
    const name = [visitorFirstName.trim(), visitorLastName.trim()].filter(Boolean).join(' ');
    const count = Number(visitorCount);
    if (!name) { setMessage('Enter your visitor’s name.'); return; }
    if (!Number.isInteger(count) || count < 1 || count > 50) { setMessage('Enter a visitor count between 1 and 50.'); return; }
    if (!/^\+?[0-9 ()-]{7,40}$/.test(visitorPhone.trim())) { setMessage('Enter a valid visitor phone number.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) { setMessage('Choose valid visit start and end dates.'); return; }
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
      setIssuedCode(code); setIssuedPass(pass); setVisitorFirstName(''); setVisitorLastName(''); setVisitorPhone(''); setVisitorCount('1');
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
        <Text style={labelStyle}>First name</Text>
        <TextInput value={visitorFirstName} onChangeText={setVisitorFirstName} placeholder="Enter visitor’s first name" placeholderTextColor={theme.muted} autoCapitalize="words" style={inputStyle} />
        <Text style={labelStyle}>Last name</Text>
        <View style={{ position: 'relative', marginBottom: 12, justifyContent: 'center' }}>
          <TextInput value={visitorLastName} onChangeText={setVisitorLastName} placeholder="Enter visitor’s last name" placeholderTextColor={theme.muted} autoCapitalize="words" style={[inputStyle, { paddingRight: 48, marginBottom: 0 }]} />
          <TouchableOpacity
            onPress={() => void chooseContact()}
            disabled={contactsLoading}
            accessibilityRole="button"
            accessibilityLabel="Choose visitor from contacts"
            hitSlop={8}
            style={{ position: 'absolute', right: 10, top: 0, bottom: 0, width: 24, alignItems: 'center', justifyContent: 'center' }}
          >
            {contactsLoading
              ? <ActivityIndicator size="small" color={theme.gold} />
              : <Ionicons name="person-add-outline" size={14} color={theme.gold} />}
          </TouchableOpacity>
        </View>
        <Text style={labelStyle}>Phone number</Text>
        <TextInput value={visitorPhone} onChangeText={setVisitorPhone} placeholder="Visitor phone number" placeholderTextColor={theme.muted} keyboardType="phone-pad" style={inputStyle} />
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
      <Modal
        visible={contactPickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setContactPickerVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.72)' }}>
          <View style={{ maxHeight: '82%', minHeight: '55%', backgroundColor: theme.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: theme.border, padding: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800' }}>Choose a contact</Text>
              <Pressable onPress={() => setContactPickerVisible(false)} accessibilityRole="button" accessibilityLabel="Close contacts">
                <Ionicons name="close-circle-outline" size={27} color={theme.muted} />
              </Pressable>
            </View>
            <TextInput
              value={contactSearch}
              onChangeText={setContactSearch}
              placeholder="Search name or phone number"
              placeholderTextColor={theme.muted}
              autoCapitalize="none"
              style={[inputStyle, { marginBottom: 12 }]}
            />
            <FlatList
              data={contacts.filter(contact => {
                const query = contactSearch.trim().toLowerCase();
                if (!query) return true;
                const fullName = [contact.givenName, contact.familyName, contact.fullName].filter(Boolean).join(' ');
                return fullName.toLowerCase().includes(query)
                  || (contact.phones || []).some(phone => (phone.number || '').toLowerCase().includes(query));
              })}
              keyExtractor={(contact, index) => contact.id || ([contact.givenName, contact.familyName].filter(Boolean).join('-') || 'contact') + '-' + index}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={{ color: theme.muted, textAlign: 'center', paddingVertical: 24 }}>No matching contacts with phone numbers.</Text>}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => selectContact(item)}
                  style={{ paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.border }}
                >
                  <Text style={{ color: theme.text, fontWeight: '700' }}>{item.fullName || [item.givenName, item.familyName].filter(Boolean).join(' ')}</Text>
                  <Text style={{ color: theme.muted, fontSize: 12, marginTop: 4 }}>
                    {item.phones?.find(phone => !!phone.number?.trim())?.number || ''}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
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
