import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { Screen, SectionTitle, EmptyState, Card } from '../../src/components/ui';
import { theme } from '../../src/theme/theme';
import { supabase } from '../../lib/supabase';
import { getApiBaseUrl } from '../../src/lib/api-url';

type Estate = { id: string; membershipRole?: string | null };
type EstateResponse = { estates?: Estate[]; error?: string };
type EstateVenue = { id: string; name: string; location: string | null; status: string };
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

type DateTimeFieldProps = { label: string; value: Date | null; onChange: (value: Date) => void };

function DateTimeField({ label, value, onChange }: DateTimeFieldProps) {
  const [mode, setMode] = useState<'date' | 'time' | null>(null);
  const [dateDraft, setDateDraft] = useState<Date | null>(value);
  const [hasTime, setHasTime] = useState(Boolean(value));
  const [visibleMonth, setVisibleMonth] = useState(() => value ? new Date(value.getFullYear(), value.getMonth(), 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [hour, setHour] = useState(() => value ? (value.getHours() % 12 || 12) : 9);
  const [minute, setMinute] = useState(() => value ? value.getMinutes() : 0);
  const [period, setPeriod] = useState<'AM' | 'PM'>(() => value && value.getHours() >= 12 ? 'PM' : 'AM');
  useEffect(() => {
    if (value) { setDateDraft(new Date(value)); setHasTime(true); }
    else { setDateDraft(null); setHasTime(false); }
  }, [value]);
  const calendarDays = useMemo(() => {
    const offset = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1).getDay();
    const count = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
    return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];
  }, [visibleMonth]);
  function openTimePicker() {
    if (value) { setHour(value.getHours() % 12 || 12); setMinute(value.getMinutes()); setPeriod(value.getHours() >= 12 ? 'PM' : 'AM'); }
    setMode('time');
  }
  function chooseDate(day: number) {
    const next = dateDraft ? new Date(dateDraft) : new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day);
    next.setFullYear(visibleMonth.getFullYear(), visibleMonth.getMonth(), day);
    setDateDraft(next);
    if (hasTime) { next.setHours((hour % 12) + (period === 'PM' ? 12 : 0), minute, 0, 0); onChange(next); }
    setMode(null);
  }
  function saveTime() {
    setHasTime(true);
    if (dateDraft) {
      const next = new Date(dateDraft);
      next.setHours((hour % 12) + (period === 'PM' ? 12 : 0), minute, 0, 0);
      onChange(next);
    }
    setMode(null);
  }
  function shift(current: number, delta: number, min: number, max: number, setter: (value: number) => void) {
    const next = current + delta;
    setter(next < min ? max : next > max ? min : next);
  }
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={label + ' calendar date'} onPress={() => { setVisibleMonth(dateDraft ? new Date(dateDraft.getFullYear(), dateDraft.getMonth(), 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setMode('date'); }} style={{ flex: 1.25, borderColor: theme.border, borderWidth: 1, borderRadius: 10, padding: 13 }}>
          <Text style={{ color: theme.muted, fontSize: 10, marginBottom: 4 }}>DATE</Text>
          <Text style={{ color: dateDraft ? theme.text : theme.muted, fontSize: 13 }}>{dateDraft ? dateDraft.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : 'Choose date'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={label + ' clock time'} onPress={openTimePicker} style={{ flex: 1, borderColor: theme.border, borderWidth: 1, borderRadius: 10, padding: 13 }}>
          <Text style={{ color: theme.muted, fontSize: 10, marginBottom: 4 }}>TIME</Text>
          <Text style={{ color: hasTime ? theme.text : theme.muted, fontSize: 13 }}>{hasTime ? new Date(2000, 0, 1, (hour % 12) + (period === 'PM' ? 12 : 0), minute).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true }) : 'Choose time'}</Text>
        </Pressable>
      </View>
      <Modal transparent visible={mode !== null} animationType="fade" onRequestClose={() => setMode(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16 }}>
            {mode === 'date' ? <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Pressable accessibilityLabel="Previous month" onPress={() => setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))} style={{ padding: 8 }}><Text style={{ color: theme.gold, fontSize: 20 }}>‹</Text></Pressable>
                <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>{visibleMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
                <Pressable accessibilityLabel="Next month" onPress={() => setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))} style={{ padding: 8 }}><Text style={{ color: theme.gold, fontSize: 20 }}>›</Text></Pressable>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <View key={day} style={{ width: '14.285%', alignItems: 'center', paddingVertical: 8 }}><Text style={{ color: theme.muted, fontSize: 11, fontWeight: '700' }}>{day}</Text></View>)}
                {calendarDays.map((day, index) => day === null
                  ? <View key={'blank-' + index} style={{ width: '14.285%', height: 42 }} />
                  : <Pressable key={day} accessibilityRole="button" accessibilityLabel={'Choose ' + visibleMonth.toLocaleDateString(undefined, { month: 'long' }) + ' ' + day} onPress={() => chooseDate(day)} style={{ width: '14.285%', height: 42, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: dateDraft && dateDraft.getFullYear() === visibleMonth.getFullYear() && dateDraft.getMonth() === visibleMonth.getMonth() && dateDraft.getDate() === day ? theme.gold : 'transparent' }}>
                      <Text style={{ color: dateDraft && dateDraft.getFullYear() === visibleMonth.getFullYear() && dateDraft.getMonth() === visibleMonth.getMonth() && dateDraft.getDate() === day ? '#080808' : theme.text, fontWeight: '700' }}>{day}</Text>
                    </View>
                  </Pressable>)}
              </View>
            </> : <>
              <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16, textAlign: 'center', marginBottom: 18 }}>Choose time</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                <View style={{ alignItems: 'center' }}>
                  <Pressable accessibilityLabel="Increase hour" onPress={() => shift(hour, 1, 1, 12, setHour)} style={timeAdjustButton}><Text style={timeAdjustText}>＋</Text></Pressable>
                  <Text style={timeValueText}>{String(hour).padStart(2, '0')}</Text>
                  <Pressable accessibilityLabel="Decrease hour" onPress={() => shift(hour, -1, 1, 12, setHour)} style={timeAdjustButton}><Text style={timeAdjustText}>−</Text></Pressable>
                </View>
                <Text style={{ color: theme.text, fontSize: 26, fontWeight: '800' }}>:</Text>
                <View style={{ alignItems: 'center' }}>
                  <Pressable accessibilityLabel="Increase minute" onPress={() => shift(minute, 5, 0, 55, setMinute)} style={timeAdjustButton}><Text style={timeAdjustText}>＋</Text></Pressable>
                  <Text style={timeValueText}>{String(minute).padStart(2, '0')}</Text>
                  <Pressable accessibilityLabel="Decrease minute" onPress={() => shift(minute, -5, 0, 55, setMinute)} style={timeAdjustButton}><Text style={timeAdjustText}>−</Text></Pressable>
                </View>
                <View style={{ gap: 8 }}>
                  {(['AM', 'PM'] as const).map(item => <Pressable key={item} onPress={() => setPeriod(item)} style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 8, backgroundColor: period === item ? theme.gold : '#080808' }}><Text style={{ color: period === item ? '#080808' : theme.text, fontWeight: '800' }}>{item}</Text></Pressable>)}
                </View>
              </View>
            </>}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <Pressable onPress={() => setMode(null)} style={{ padding: 11 }}><Text style={{ color: theme.muted, fontWeight: '700' }}>CANCEL</Text></Pressable>
              {mode === 'time' ? <Pressable onPress={saveTime} style={{ backgroundColor: theme.gold, borderRadius: 8, padding: 11 }}><Text style={{ color: '#080808', fontWeight: '800' }}>SET TIME</Text></Pressable> : null}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const timeAdjustButton = { width: 48, height: 34, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: '#080808', borderRadius: 8 };
const timeAdjustText = { color: theme.gold, fontSize: 18, fontWeight: '800' as const };
const timeValueText = { color: theme.text, fontSize: 26, fontWeight: '800' as const, paddingVertical: 5 };

export default function ResidentEventsRoute() {
  const [estateId, setEstateId] = useState('');
  const [events, setEvents] = useState<EstateEvent[]>([]);
  const [venues, setVenues] = useState<EstateVenue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState('home');
  const [venueDropdownOpen, setVenueDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState<Date | null>(null);
  const [endsAt, setEndsAt] = useState<Date | null>(null);
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
      const [{ data: availableVenues, error: venueError }, result] = await Promise.all([
        supabase.from('estate_venues')
          .select('id,name,location,status')
          .eq('estate_id', activeEstateId)
          .eq('status', 'available')
          .order('name', { ascending: true }),
        request('/v1/estates/' + encodeURIComponent(activeEstateId) + '/events', token),
      ]);
      if (venueError) throw new Error('Available estate venues could not be loaded. Please refresh and try again.');
      const venueList = (availableVenues || []) as EstateVenue[];
      setVenues(venueList);
      setSelectedVenueId(current => current === 'home' || venueList.some(venue => venue.id === current) ? current : 'home');
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
    const selectedVenue = selectedVenueId === 'home' ? null : venues.find(venue => venue.id === selectedVenueId && venue.status === 'available');
    if (selectedVenueId !== 'home' && !selectedVenue) {
      setMessage('That venue is no longer available. Refresh the venue list and choose another.');
      return;
    }
    const start = startsAt;
    const end = endsAt;
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
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
        venue: selectedVenue ? (selectedVenue.location ? selectedVenue.name + ' · ' + selectedVenue.location : selectedVenue.name) : 'Home / Private Residence',
        venueId: selectedVenueId,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        status: 'published',
      });
      setTitle('');
      setDescription('');
      setStartsAt(null);
      setEndsAt(null);
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
        <Pressable accessibilityRole="button" accessibilityLabel="Select event venue" accessibilityState={{ expanded: venueDropdownOpen }} onPress={() => setVenueDropdownOpen(value => !value)} style={{ borderColor: theme.border, borderWidth: 1, borderRadius: 10, padding: 13, marginBottom: venueDropdownOpen ? 6 : 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: theme.text }}>{selectedVenueId === 'home' ? 'Home / Private Residence' : (() => { const venue = venues.find(item => item.id === selectedVenueId); return venue ? (venue.location ? venue.name + ' · ' + venue.location : venue.name) : 'Select a venue'; })()}</Text>
          <Text style={{ color: theme.gold, fontSize: 16 }}>{venueDropdownOpen ? '▴' : '▾'}</Text>
        </Pressable>
        {venueDropdownOpen ? <View style={{ borderColor: theme.border, borderWidth: 1, borderRadius: 10, marginBottom: 12, overflow: 'hidden' }}>
          <Pressable onPress={() => { setSelectedVenueId('home'); setVenueDropdownOpen(false); }} style={{ padding: 13, borderBottomWidth: 1, borderBottomColor: theme.border }}>
            <Text style={{ color: selectedVenueId === 'home' ? theme.gold : theme.text, fontWeight: selectedVenueId === 'home' ? '800' : '500' }}>Home / Private Residence</Text>
          </Pressable>
          {venues.map(venue => <Pressable key={venue.id} onPress={() => { setSelectedVenueId(venue.id); setVenueDropdownOpen(false); }} style={{ padding: 13, borderBottomWidth: 1, borderBottomColor: theme.border }}>
            <Text style={{ color: selectedVenueId === venue.id ? theme.gold : theme.text, fontWeight: selectedVenueId === venue.id ? '800' : '500' }}>{venue.name}</Text>
            {venue.location ? <Text style={{ color: theme.muted, fontSize: 11, marginTop: 3 }}>{venue.location}</Text> : null}
          </Pressable>)}
          {!venues.length ? <Text style={{ color: theme.muted, fontSize: 12, padding: 13 }}>No other venues are currently available in this estate.</Text> : null}
        </View> : null}
        <DateTimeField label="Start date and time" value={startsAt} onChange={setStartsAt} />
        <DateTimeField label="End date and time" value={endsAt} onChange={setEndsAt} />
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
