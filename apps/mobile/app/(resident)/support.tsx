import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Screen, Card, SectionTitle, EmptyState, GoldButton } from '../../src/components/ui';
import { theme } from '../../src/theme/theme';
import { supabase } from '../../lib/supabase';

type Estate = { id: string; name: string };
type Ticket = {
  id: string;
  estate_id: string;
  subject: string;
  status: 'awaiting_management' | 'awaiting_resident' | 'closed';
  created_at: string;
  updated_at: string;
};
type TicketMessage = { id: string; ticket_id: string; sender_user_id: string; body: string; created_at: string };

const statusLabel: Record<Ticket['status'], string> = {
  awaiting_management: 'Awaiting Facility Manager',
  awaiting_resident: 'Facility Manager replied',
  closed: 'Closed',
};

export default function SupportScreen() {
  const [userId, setUserId] = useState('');
  const [estates, setEstates] = useState<Estate[]>([]);
  const [selectedEstate, setSelectedEstate] = useState('');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [subject, setSubject] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [reply, setReply] = useState('');
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNewTicket, setShowNewTicket] = useState(false);

  const loadTickets = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from('support_tickets')
      .select('id,estate_id,subject,status,created_at,updated_at')
      .order('updated_at', { ascending: false });
    if (queryError) throw queryError;
    setTickets((data || []) as Ticket[]);
  }, []);

  const loadMessages = useCallback(async (ticketId: string) => {
    const { data, error: queryError } = await supabase
      .from('support_ticket_messages')
      .select('id,ticket_id,sender_user_id,body,created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    if (queryError) throw queryError;
    setMessages((data || []) as TicketMessage[]);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) throw new Error('Please sign in again to access support.');
        if (!active) return;
        setUserId(user.id);
        const { data: memberships, error: membershipError } = await supabase
          .from('estate_memberships')
          .select('estate_id')
          .eq('user_id', user.id)
          .eq('membership_role', 'resident')
          .eq('status', 'active');
        if (membershipError) throw membershipError;
        const ids = [...new Set((memberships || []).map((row) => row.estate_id))];
        if (ids.length) {
          const { data: estateRows, error: estateError } = await supabase
            .from('estates').select('id,name').in('id', ids).order('name');
          if (estateError) throw estateError;
          if (!active) return;
          setEstates((estateRows || []) as Estate[]);
          setSelectedEstate((estateRows || [])[0]?.id || '');
        }
        await loadTickets();
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Support could not be loaded. Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [loadTickets]);

  useEffect(() => {
    if (!selectedTicket?.id) return;
    let active = true;
    const refresh = async () => {
      try { await loadMessages(selectedTicket.id); }
      catch { if (active) setError('Messages could not be refreshed.'); }
    };
    void refresh();
    const channel = supabase.channel('resident-support-ticket-' + selectedTicket.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_ticket_messages', filter: 'ticket_id=eq.' + selectedTicket.id }, () => { void refresh(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: 'id=eq.' + selectedTicket.id }, () => {
        void refresh();
        void loadTickets();
      })
      .subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [selectedTicket?.id, loadMessages, loadTickets]);

  const createTicket = async () => {
    if (!selectedEstate || subject.trim().length < 3 || !firstMessage.trim()) {
      setError('Choose your estate and enter a subject and message.');
      return;
    }
    setCreating(true); setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('create_support_ticket', {
        p_estate_id: selectedEstate,
        p_subject: subject.trim(),
        p_message: firstMessage.trim(),
      });
      if (rpcError) throw rpcError;
      await loadTickets();
      setSubject(''); setFirstMessage(''); setShowNewTicket(false);
      const { data: created, error: ticketError } = await supabase.from('support_tickets')
        .select('id,estate_id,subject,status,created_at,updated_at').eq('id', data).single();
      if (ticketError) throw ticketError;
      setSelectedTicket(created as Ticket);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Your ticket could not be submitted. Please try again.');
    } finally { setCreating(false); }
  };

  const sendReply = async () => {
    if (!selectedTicket || !reply.trim()) return;
    setSending(true); setError('');
    try {
      const { error: rpcError } = await supabase.rpc('send_support_ticket_message', {
        p_ticket_id: selectedTicket.id,
        p_body: reply.trim(),
      });
      if (rpcError) throw rpcError;
      setReply('');
      await Promise.all([loadMessages(selectedTicket.id), loadTickets()]);
      const nextStatus = selectedTicket.status === 'awaiting_resident' ? 'awaiting_management' : selectedTicket.status;
      setSelectedTicket({ ...selectedTicket, status: nextStatus, updated_at: new Date().toISOString() });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Your reply could not be sent. Please try again.');
    } finally { setSending(false); }
  };

  const closeTicket = async () => {
    if (!selectedTicket) return;
    try {
      const { error: rpcError } = await supabase.rpc('close_support_ticket', { p_ticket_id: selectedTicket.id });
      if (rpcError) throw rpcError;
      setSelectedTicket({ ...selectedTicket, status: 'closed' });
      await loadTickets();
    } catch {
      setError('This ticket could not be closed. Please try again.');
    }
  };

  if (loading) return <Screen title="Support" subtitle="Contact your estate Facility Manager"><ActivityIndicator color={theme.gold} /></Screen>;

  return (
    <Screen
      title={selectedTicket ? 'Support Ticket' : 'Support'}
      subtitle={selectedTicket ? selectedTicket.subject : 'Send a support ticket to your estate Facility Manager'}
      right={selectedTicket ? <Pressable onPress={() => { setSelectedTicket(null); setMessages([]); setError(''); }}><Text style={{ color: theme.gold, fontWeight: '700' }}>All tickets</Text></Pressable> : undefined}
    >
      {!!error && <Card><Text style={{ color: '#FF9292', fontSize: 12 }}>{error}</Text></Card>}

      {selectedTicket ? (
        <>
          <Card>
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14 }}>{selectedTicket.subject}</Text>
            <Text style={{ color: theme.goldSoft, fontSize: 11, marginTop: 6 }}>{statusLabel[selectedTicket.status]}</Text>
            <Text style={{ color: theme.muted, fontSize: 11, marginTop: 4 }}>Your estate Facility Manager is responsible for responding to this ticket.</Text>
          </Card>
          <SectionTitle>Conversation</SectionTitle>
          {messages.map((message) => {
            const mine = message.sender_user_id === userId;
            return (
              <View key={message.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%', backgroundColor: mine ? '#29200D' : theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 14, padding: 12, marginBottom: 9 }}>
                <Text style={{ color: theme.goldSoft, fontSize: 10, fontWeight: '800', marginBottom: 5 }}>{mine ? 'YOU' : 'FACILITY MANAGER'}</Text>
                <Text style={{ color: theme.text, fontSize: 13, lineHeight: 19 }}>{message.body}</Text>
                <Text style={{ color: theme.muted, fontSize: 9, marginTop: 7 }}>{new Date(message.created_at).toLocaleString('en-NG')}</Text>
              </View>
            );
          })}
          {selectedTicket.status !== 'closed' ? (
            <Card>
              <TextInput value={reply} onChangeText={setReply} placeholder="Write a reply…" placeholderTextColor={theme.muted} multiline maxLength={10000} textAlignVertical="top" style={{ minHeight: 90, color: theme.text, fontSize: 13 }} />
              <GoldButton label={sending ? 'Sending…' : 'Send reply'} onPress={sendReply} disabled={sending || !reply.trim()} />
            </Card>
          ) : <Card><Text style={{ color: theme.muted, fontSize: 12 }}>This ticket is closed. Create a new ticket if you need further assistance.</Text></Card>}
          {selectedTicket.status !== 'closed' ? <Pressable onPress={closeTicket} style={{ paddingVertical: 12, alignItems: 'center' }}><Text style={{ color: theme.muted, fontSize: 12 }}>Close this ticket</Text></Pressable> : null}
        </>
      ) : (
        <>
          <Card>
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>Need assistance?</Text>
            <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginTop: 5 }}>Create a ticket and your estate Facility Manager will respond here. Keep all replies in the same conversation.</Text>
            <View style={{ marginTop: 12 }}><GoldButton label={showNewTicket ? 'Cancel new ticket' : 'Create support ticket'} onPress={() => { setShowNewTicket(!showNewTicket); setError(''); }} /></View>
          </Card>
          {showNewTicket ? (
            <Card>
              <SectionTitle>Your estate</SectionTitle>
              {estates.length ? estates.map((estate) => (
                <Pressable key={estate.id} onPress={() => setSelectedEstate(estate.id)} style={{ padding: 10, borderRadius: 9, borderWidth: 1, borderColor: selectedEstate === estate.id ? theme.gold : theme.border, marginBottom: 7 }}>
                  <Text style={{ color: selectedEstate === estate.id ? theme.goldSoft : theme.text, fontSize: 12, fontWeight: '700' }}>{estate.name}</Text>
                </Pressable>
              )) : <Text style={{ color: theme.muted, fontSize: 12 }}>No active resident estate was found for this account.</Text>}
              <SectionTitle>Ticket subject</SectionTitle>
              <TextInput value={subject} onChangeText={setSubject} placeholder="What do you need help with?" placeholderTextColor={theme.muted} maxLength={160} style={{ color: theme.text, borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 11, marginBottom: 12 }} />
              <SectionTitle>Message</SectionTitle>
              <TextInput value={firstMessage} onChangeText={setFirstMessage} placeholder="Describe the issue or question…" placeholderTextColor={theme.muted} multiline maxLength={10000} textAlignVertical="top" style={{ minHeight: 110, color: theme.text, borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 11, marginBottom: 12 }} />
              <GoldButton label={creating ? 'Submitting…' : 'Submit ticket'} onPress={createTicket} disabled={creating || !estates.length} />
            </Card>
          ) : null}
          <SectionTitle>My tickets</SectionTitle>
          {!tickets.length ? <EmptyState icon="ticket-outline" title="No support tickets yet" message="Create a ticket when you need help from your estate Facility Manager." /> : tickets.map((ticket) => (
            <Pressable key={ticket.id} onPress={() => { setSelectedTicket(ticket); setError(''); }} style={{ backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 13, padding: 14, marginBottom: 9 }}>
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>{ticket.subject}</Text>
              <Text style={{ color: theme.goldSoft, fontSize: 10, fontWeight: '700', marginTop: 6 }}>{statusLabel[ticket.status]}</Text>
              <Text style={{ color: theme.muted, fontSize: 10, marginTop: 5 }}>Updated {new Date(ticket.updated_at).toLocaleString('en-NG')}</Text>
            </Pressable>
          ))}
        </>
      )}
    </Screen>
  );
}
