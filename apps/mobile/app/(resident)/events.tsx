import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Screen, SectionTitle, EmptyState, Card } from '../../src/components/ui';
import { theme } from '../../src/theme/theme';
import { supabase } from '../../lib/supabase';
import { getApiBaseUrl } from '../../src/lib/api-url';

type Estate = { id: string; membershipRole?: string | null };
type EstateResponse = { estates?: Estate[]; error?: string };
type EstateEvent = {
  id: string;
  title: string;
  description?: string | null;
  venue: string;
  starts_at: string;
  ends_at: string;
  status: string;
  venue_approval_status?: string | null;
};
const apiUrl = getApiBaseUrl();

export default function ResidentEventsRoute() {
  const [estateId, setEstateId] = useState('');
  const [events, setEvents] = useState<EstateEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [message, setMessage] = useState('');

  const request = useCallback(async (path: string, token: string, method: 'GET' | 'POST' = 'GET', body?: unknown) => {
    if (!apiUrl) throw new Error('The CB Nest API address is not configured.');
    const response = await fetch(apiUrl + path, {
      method,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json() as { error?: string; message?: string; events?: EstateEvent[]; event?: EstateEvent };
    if (!response.ok) throw new Error(result.message || result.error || 'The event request could not be completed.');
    return result;
  }, []);

  const loadEvents = useCallback(async (knownEstateId?: string, knownToken?: string) => {
    setLoading(true);
    setMessage('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = knownToken || session?.access_token;
      if (!token) throw new Error('Your session has expired. Please sign in again.');
      let activeEstateId = knownEstateId || estateId;
      if (!activeEstateId) {
        const response = await fetch(apiUrl + '/v1/estates', { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
        const body = await response.json() as EstateResponse;
        if (!response.ok) throw new Error(body.error || 'Your estate details could not be loaded.');
        const residentEstate = (body.estates || []).find(item => (item.membershipRole || '').toLowerCase().replace(/-/g, '_') === 'resident');
        if (!residentEstate) throw new Error('An active Resident estate membership is required to create events.');
        activeEstateId = residentEstate.id;
        setEstateId(activeEstateId);
      }
      const result = await request('/v1/estates/' + encodeURIComponent(activeEstateId) + '/events', token);
      setEvents(result.events || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Events could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [estateId, request]);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  async function createEvent() {
    const cleanTitle = title.trim();
    if (cleanTitle.length < 3) { setMessage('Enter an event title with at least 3 characters.'); return; }
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (!startsAt.trim() || !endsAt.trim() || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setMessage('Enter valid start and end date/time values. The end must be after the start.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || !estateId) throw new Error('Your session or estate membership is unavailable. Refresh and try again.');
      await request('/v1/estates/' + encodeURIComponent(estateId) + '/events', session.access_token, 'POST', {
        title: cleanTitle,
        description: description.trim(),
        venue: 'Home',
        venueId: 'home',
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        status: 'published',
      });
      setTitle('');
      setDescription('');
      setStartsAt('');
      setEndsAt('');
      setShowCreate(false);
      setMessage('Your event has been created.');
      await loadEvents(estateId, session.access_token);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The event could not be created. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="Community Events" subtitle="Create and manage events for your estate">
      <Pressable onPress={() => { setShowCreate(value => !value); setMessage(''); }} style={{ backgroundColor: theme.gold, borderRadius: 12, padding: 15, alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ color: '#080808', fontWeight: '800' }}>{showCreate ? 'CANCEL' : '＋ CREATE EVENT'}</Text>
      </Pressable>
      {showCreate ? <Card>
        <SectionTitle>New event</SectionTitle>
        <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 8 }}>Residents can create and manage events for their own estate.</Text>
        <TextInput value={title} onChangeText={setTitle} placeholder="Event title" placeholderTextColor={theme.muted} style={fieldStyle} />
        <TextInput value={description} onChangeText={setDescription} placeholder="Description (optional)" placeholderTextColor={theme.muted} multiline style={[fieldStyle, { minHeight: 86, textAlignVertical: 'top' }]} />
        <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>Venue</Text>
        <View style={{ borderColor: theme.border, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <Text style={{ color: theme.text }}>Home / Private residence</Text>
          <Text style={{ color: theme.muted, fontSize: 11, marginTop: 3 }}>Estate facility booking and approval can be selected when available.</Text>
        </View>
        <TextInput value={startsAt} onChangeText={setStartsAt} placeholder="Start date/time (e.g. 2026-12-20T15:00)" placeholderTextColor={theme.muted} autoCapitalize="none" style={fieldStyle} />
        <TextInput value={endsAt} onChangeText={setEndsAt} placeholder="End date/time (e.g. 2026-12-20T18:00)" placeholderTextColor={theme.muted} autoCapitalize="none" style={fieldStyle} />
        <Pressable disabled={saving} onPress={() => void createEvent()} style={{ backgroundColor: theme.gold, borderRadius: 10, padding: 14, alignItems: 'center', opacity: saving ? 0.6 : 1 }}>
          {saving ? <ActivityIndicator color="#080808" /> : <Text style={{ color: '#080808', fontWeight: '800' }}>CREATE EVENT</Text>}
        </Pressable>
      </Card> : null}
      {message ? <Text accessibilityRole="alert" style={{ color: theme.goldSoft, marginBottom: 12 }}>{message}</Text> : null}
      <SectionTitle>Your events</SectionTitle>
      {loading ? <ActivityIndicator color={theme.gold} /> : events.length ? events.map(event => (
        <Card key={event.id}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>{event.title}</Text>
          {event.description ? <Text style={{ color: theme.muted, marginTop: 6 }}>{event.description}</Text> : null}
          <Text style={{ color: theme.muted, marginTop: 8 }}>Venue: {event.venue}</Text>
          <Text style={{ color: theme.muted, marginTop: 3 }}>Starts: {new Date(event.starts_at).toLocaleString()}</Text>
          <Text style={{ color: theme.muted, marginTop: 3 }}>Ends: {new Date(event.ends_at).toLocaleString()}</Text>
          <Text style={{ color: theme.gold, fontWeight: '800', marginTop: 8 }}>{event.status.toUpperCase()}</Text>
        </Card>
      )) : <EmptyState icon="calendar-blank-outline" title="No events yet" message="Create your first estate event using the button above." />}
      {!loading ? <Pressable onPress={() => void loadEvents()} style={{ padding: 12, alignItems: 'center' }}><Text style={{ color: theme.gold }}>Refresh events</Text></Pressable> : null}
    </Screen>
  );
}

const fieldStyle = {
  color: theme.text,
  borderColor: theme.border,
  borderWidth: 1,
  borderRadius: 10,
  padding: 13,
  marginBottom: 12,
};
