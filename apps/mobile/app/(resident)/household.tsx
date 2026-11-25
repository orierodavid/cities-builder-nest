import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Screen, Card, SectionTitle } from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import { theme } from '../../src/theme/theme';

type HouseholdMember = {
  member_user_id: string | null;
  member_name: string;
  member_role: string;
  invitation_email: string | null;
  invitation_expires_at: string | null;
};

export default function HouseholdScreen() {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [{ data: auth }, { data, error: householdError }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.rpc('get_my_household_members'),
    ]);
    if (householdError) {
      setError('Your apartment household could not be loaded. Please try again.');
      setMembers([]);
    } else {
      setCurrentUserId(auth.user?.id || '');
      setMembers((data || []) as HouseholdMember[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const currentMember = members.find((member) => member.member_user_id === currentUserId);
  const isPrimary = currentMember?.member_role === 'primary';
  const activeMembers = members.filter((member) => !!member.member_user_id);
  const pendingInvite = members.find((member) => member.member_role === 'pending');

  const sendInvite = async () => {
    setMessage('');
    setError('');
    if (fullName.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter the second resident’s full name and a valid email address.');
      return;
    }
    setSending(true);
    const { data, error: inviteError } = await supabase.functions.invoke('invite-household-member', {
      body: { fullName: fullName.trim(), email: email.trim().toLowerCase() },
    });
    if (inviteError || data?.error) {
      setError(data?.message || data?.error || 'The invitation could not be sent. Please try again.');
    } else {
      setMessage(data?.message || 'Invitation sent. The second resident must verify their email to join this apartment.');
      setFullName('');
      setEmail('');
      await load();
    }
    setSending(false);
  };

  return (
    <Screen title="My Household" subtitle="Manage the two resident accounts for your apartment">
      <Card>
        <SectionTitle>Apartment accounts</SectionTitle>
        {loading ? <ActivityIndicator color={theme.gold} /> : error && members.length === 0 ? (
          <Text style={{ color: '#F2A5A5', fontSize: 13 }}>{error}</Text>
        ) : (
          <View style={{ gap: 12 }}>
            {activeMembers.map((member) => (
              <View key={member.member_user_id} style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: '#0B0B0B' }}>
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>{member.member_name}{member.member_user_id === currentUserId ? ' (You)' : ''}</Text>
                <Text style={{ color: theme.goldSoft, fontSize: 11, marginTop: 4 }}>{member.member_role === 'primary' ? 'PRIMARY RESIDENT' : 'HOUSEHOLD RESIDENT'}</Text>
              </View>
            ))}
            {pendingInvite && (
              <View style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: '#17130A' }}>
                <Text style={{ color: theme.goldSoft, fontSize: 12, fontWeight: '800' }}>INVITATION PENDING</Text>
                <Text style={{ color: theme.text, fontSize: 13, marginTop: 5 }}>{pendingInvite.invitation_email}</Text>
                {!!pendingInvite.invitation_expires_at && <Text style={{ color: theme.muted, fontSize: 11, marginTop: 4 }}>Expires {new Date(pendingInvite.invitation_expires_at).toLocaleDateString('en-NG')}</Text>}
              </View>
            )}
            <Text style={{ color: theme.muted, fontSize: 12 }}> {activeMembers.length} of 2 resident accounts linked to this apartment.</Text>
          </View>
        )}
      </Card>

      {isPrimary && activeMembers.length < 2 && !pendingInvite && (
        <Card>
          <SectionTitle>Invite the second resident</SectionTitle>
          <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginBottom: 12 }}>
            Send an invitation to your spouse or another household member. They will have their own secure login and personal CB Nest ID, while sharing this apartment’s property details and service-charge status.
          </Text>
          <Text style={{ color: theme.muted, fontSize: 11, marginBottom: 5 }}>FULL NAME</Text>
          <TextInput value={fullName} onChangeText={setFullName} placeholder="Second resident’s full name" placeholderTextColor={theme.muted} autoCapitalize="words" style={{ minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, color: theme.text, marginBottom: 12, backgroundColor: '#080808' }} />
          <Text style={{ color: theme.muted, fontSize: 11, marginBottom: 5 }}>EMAIL ADDRESS</Text>
          <TextInput value={email} onChangeText={setEmail} placeholder="name@example.com" placeholderTextColor={theme.muted} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={{ minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, color: theme.text, marginBottom: 14, backgroundColor: '#080808' }} />
          {!!error && <Text style={{ color: '#F2A5A5', fontSize: 12, marginBottom: 10 }}>{error}</Text>}
          {!!message && <Text style={{ color: '#79D6A1', fontSize: 12, lineHeight: 18, marginBottom: 10 }}>{message}</Text>}
          <TouchableOpacity disabled={sending} onPress={() => void sendInvite()} style={{ minHeight: 48, borderRadius: 10, backgroundColor: theme.gold, alignItems: 'center', justifyContent: 'center', opacity: sending ? 0.6 : 1 }}>
            <Text style={{ color: '#080808', fontWeight: '900' }}>{sending ? 'SENDING INVITATION…' : 'SEND INVITATION'}</Text>
          </TouchableOpacity>
        </Card>
      )}
      {!isPrimary && !loading && (
        <Card><Text style={{ color: theme.muted, fontSize: 12, lineHeight: 19 }}>The primary resident manages the second household invitation. You can view the shared apartment membership here.</Text></Card>
      )}
      {!!error && members.length > 0 && <Text style={{ color: '#F2A5A5', fontSize: 12 }}>{error}</Text>}
    </Screen>
  );
}
