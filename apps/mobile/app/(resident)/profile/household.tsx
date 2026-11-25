import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Screen, Card, SectionTitle } from '../../../src/components/ui';
import { supabase } from '../../../src/lib/supabase';
import { theme } from '../../../src/theme/theme';

type HouseholdMember = {
  member_user_id: string | null;
  member_name: string;
  member_role: string;
  invitation_email: string | null;
  invitation_expires_at: string | null;
  invitation_id: string | null;
};

function errorDetails(error: any) {
  return [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean).join(' ').toLowerCase();
}
function isCancellation(error: any) {
  const value = errorDetails(error);
  return error?.name === 'AbortError' || /abort|cancelled|canceled|request was cancelled/.test(value);
}
function friendlyError(error: any) {
  const detail = errorDetails(error);
  if (detail.includes('active_resident_apartment_required')) return 'Your estate membership is active, but estate management has not assigned an official apartment/unit to your account yet. The household can be managed after that assignment is confirmed.';
  if (detail.includes('account_or_legal_access_required')) return 'Please complete the CB Nest account and legal acceptance steps before managing your household.';
  if (detail.includes('active_resident_required')) return 'This account is not currently an active resident. Please contact estate management.';
  if (detail.includes('apartment_resident_limit_reached')) return 'This apartment already has two resident accounts or a pending invitation. The limit is two people per apartment.';
  if (detail.includes('invitee_already_assigned_to_another_apartment')) return 'That person is already assigned to another apartment and cannot be added to this household.';
  if (detail.includes('invitee_already_in_household')) return 'That person is already a member of this apartment.';
  if (detail.includes('primary_resident_only')) return 'Only the primary resident can add or remove a household member.';
  if (detail.includes('household_member_not_found')) return 'That household member is no longer linked to this apartment. Refresh the list and try again.';
  if (detail.includes('cannot_invite_yourself')) return 'You cannot add your own email address to your household.';
  if (detail.includes('household_invitation_already_pending')) return 'An invitation is already pending for that email address.';
  if (detail.includes('verified_invited_email_required')) return 'Verify the email address linked to your CB Nest account before accepting this apartment invitation.';
  if (detail.includes('valid_household_invitation_not_found')) return 'This apartment invitation has expired or is no longer available. Ask the primary resident to send a new invitation.';
  return 'Your apartment household could not be loaded. Check your connection and try again.';
}

export default function HouseholdScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [acting, setActing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const resolveUser = async () => {
      const { data, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !data.user) {
        console.warn('[CB Nest Household] Session lookup failed', {
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
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError('');
    const { data, error: householdError } = await supabase.rpc('get_my_household_members');
    if (householdError) {
      if (isCancellation(householdError)) {
        setLoading(false);
        return;
      }
      console.warn('[CB Nest Household] Household RPC failed', {
        userId, message: householdError.message, details: householdError.details,
        hint: householdError.hint, code: householdError.code,
      });
      setMembers([]);
      setError(friendlyError(householdError));
    } else {
      setMembers((data || []) as HouseholdMember[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { if (userId) void load(); }, [userId, load]);

  const currentMember = members.find((member) => member.member_user_id === userId);
  const isPrimary = currentMember?.member_role === 'primary';
  const activeMembers = members.filter((member) => !!member.member_user_id);
  const pendingInvite = members.find((member) => member.member_role === 'pending');
  const incomingInvites = members.filter((member) => member.member_role === 'incoming');
  const unassigned = members.some((member) => member.member_role === 'unassigned');
  const atLimit = activeMembers.length >= 2 || !!pendingInvite;

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
      const detail = data?.error || inviteError?.message || '';
      console.warn('[CB Nest Household] Invitation request failed', {
        message: inviteError?.message, details: inviteError?.details, code: inviteError?.code,
        serverError: data?.error,
      });
      setError(data?.message || friendlyError({ message: detail }) || 'The invitation could not be sent. Please try again.');
    } else {
      setMessage(data?.message || 'Invitation created. The second resident must accept it before joining this apartment.');
      setFullName('');
      setEmail('');
      await load();
    }
    setSending(false);
  };

  const acceptInvite = async () => {
    setActing(true);
    setError('');
    const { error: acceptError } = await supabase.rpc('accept_resident_household_invite');
    if (acceptError) {
      console.warn('[CB Nest Household] Invitation acceptance failed', {
        message: acceptError.message, details: acceptError.details, hint: acceptError.hint, code: acceptError.code,
      });
      setError(friendlyError(acceptError));
    } else {
      setMessage('You have joined the apartment household.');
    }
    await load();
    setActing(false);
  };

  const removeMember = (member: HouseholdMember) => {
    if (!member.member_user_id) return;
    Alert.alert('Remove household member?', `Remove ${member.member_name} from this apartment? Their CB Nest account will remain active.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { void (async () => {
        setActing(true); setError(''); setMessage('');
        const { error: removeError } = await supabase.rpc('remove_resident_household_member', { p_member_user_id: member.member_user_id });
        if (removeError) {
          console.warn('[CB Nest Household] Remove member failed', {
            message: removeError.message, details: removeError.details, hint: removeError.hint, code: removeError.code,
          });
          setError(friendlyError(removeError));
        } else setMessage('The resident has been removed from this apartment.');
        await load(); setActing(false);
      })(); } },
    ]);
  };

  const cancelInvite = () => {
    if (!pendingInvite?.invitation_id) return;
    Alert.alert('Cancel invitation?', 'The pending invitation will be cancelled and the apartment’s second resident slot will become available.', [
      { text: 'Keep invitation', style: 'cancel' },
      { text: 'Cancel invitation', style: 'destructive', onPress: () => { void (async () => {
        setActing(true); setError(''); setMessage('');
        const { error: cancelError } = await supabase.rpc('cancel_resident_household_invite', { p_invite_id: pendingInvite.invitation_id });
        if (cancelError) setError(friendlyError(cancelError));
        else setMessage('The household invitation has been cancelled.');
        await load(); setActing(false);
      })(); } },
    ]);
  };

  return (
    <Screen title="My Household" subtitle="Manage up to two resident accounts for your apartment">
      <Card>
        <SectionTitle>Apartment accounts</SectionTitle>
        {loading ? (
          <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            <ActivityIndicator color={theme.gold} />
            <Text style={{ color: theme.muted, fontSize: 12, marginTop: 10 }}>Loading household…</Text>
          </View>
        ) : error && members.length === 0 ? (
          <View style={{ gap: 12 }}>
            <Text style={{ color: '#F2A5A5', fontSize: 13, lineHeight: 20 }}>{error}</Text>
            <TouchableOpacity onPress={() => void load()} style={{ minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: theme.gold, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: theme.goldSoft, fontWeight: '800' }}>TRY AGAIN</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {activeMembers.map((member) => (
              <View key={member.member_user_id} style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: '#0B0B0B' }}>
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>{member.member_name}{member.member_user_id === userId ? ' (You)' : ''}</Text>
                <Text style={{ color: theme.goldSoft, fontSize: 11, marginTop: 4 }}>{member.member_role === 'primary' ? 'PRIMARY RESIDENT' : 'HOUSEHOLD RESIDENT'}</Text>
                {isPrimary && member.member_user_id !== userId && (
                  <TouchableOpacity disabled={acting} onPress={() => removeMember(member)} style={{ alignSelf: 'flex-start', marginTop: 10, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#8E1B14', opacity: acting ? 0.5 : 1 }}>
                    <Text style={{ color: '#F2A5A5', fontSize: 11, fontWeight: '800' }}>REMOVE FROM APARTMENT</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {pendingInvite && (
              <View style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: '#17130A' }}>
                <Text style={{ color: theme.goldSoft, fontSize: 12, fontWeight: '800' }}>INVITATION PENDING</Text>
                <Text style={{ color: theme.text, fontSize: 13, marginTop: 5 }}>{pendingInvite.invitation_email}</Text>
                {!!pendingInvite.invitation_expires_at && <Text style={{ color: theme.muted, fontSize: 11, marginTop: 4 }}>Expires {new Date(pendingInvite.invitation_expires_at).toLocaleDateString('en-NG')}</Text>}
                {isPrimary && <TouchableOpacity disabled={acting} onPress={cancelInvite} style={{ alignSelf: 'flex-start', marginTop: 10, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#8E1B14', opacity: acting ? 0.5 : 1 }}>
                  <Text style={{ color: '#F2A5A5', fontSize: 11, fontWeight: '800' }}>CANCEL INVITATION</Text>
                </TouchableOpacity>}
              </View>
            )}
            {incomingInvites.map((invite) => (
              <View key={invite.invitation_id || invite.invitation_expires_at || 'incoming'} style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.gold, backgroundColor: '#17130A' }}>
                <Text style={{ color: theme.goldSoft, fontSize: 12, fontWeight: '800' }}>APARTMENT INVITATION</Text>
                <Text style={{ color: theme.text, fontSize: 13, marginTop: 5 }}>You have been invited to join a household. Accept to link your account to that apartment.</Text>
                {!!invite.invitation_expires_at && <Text style={{ color: theme.muted, fontSize: 11, marginTop: 4 }}>Expires {new Date(invite.invitation_expires_at).toLocaleDateString('en-NG')}</Text>}
                <TouchableOpacity disabled={acting} onPress={() => void acceptInvite()} style={{ minHeight: 44, marginTop: 10, borderRadius: 9, backgroundColor: theme.gold, alignItems: 'center', justifyContent: 'center', opacity: acting ? 0.5 : 1 }}>
                  <Text style={{ color: '#080808', fontWeight: '900' }}>{acting ? 'PLEASE WAIT…' : 'ACCEPT INVITATION'}</Text>
                </TouchableOpacity>
              </View>
            ))}
            {unassigned && (
              <Text style={{ color: theme.goldSoft, fontSize: 12, lineHeight: 19 }}>
                Estate membership is active, but no apartment has been assigned to your account. Estate management must register the official property and assign your apartment before you can add or remove a household member.
              </Text>
            )}
            {!!(activeMembers.length || pendingInvite) && (
              <Text style={{ color: theme.muted, fontSize: 12 }}>{activeMembers.length} of 2 resident accounts linked to this apartment{pendingInvite ? ' · second slot reserved by invitation' : ''}.</Text>
            )}
            {activeMembers.length >= 2 && <Text style={{ color: theme.goldSoft, fontSize: 12, fontWeight: '800' }}>APARTMENT LIMIT REACHED — maximum two residents.</Text>}
          </View>
        )}
      </Card>

      {isPrimary && !atLimit && (
        <Card>
          <SectionTitle>Add the second resident</SectionTitle>
          <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginBottom: 12 }}>
            Invite one other person to this apartment. A new user can accept the email invitation; an existing CB Nest user can accept the in-app invitation from My Household. The invited person cannot select or change the apartment.
          </Text>
          <Text style={{ color: theme.muted, fontSize: 11, marginBottom: 5 }}>FULL NAME</Text>
          <TextInput value={fullName} onChangeText={setFullName} placeholder="Second resident’s full name" placeholderTextColor={theme.muted} autoCapitalize="words" style={{ minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, color: theme.text, marginBottom: 12, backgroundColor: '#080808' }} />
          <Text style={{ color: theme.muted, fontSize: 11, marginBottom: 5 }}>EMAIL ADDRESS</Text>
          <TextInput value={email} onChangeText={setEmail} placeholder="name@example.com" placeholderTextColor={theme.muted} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={{ minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, color: theme.text, marginBottom: 14, backgroundColor: '#080808' }} />
          {!!error && <Text style={{ color: '#F2A5A5', fontSize: 12, marginBottom: 10 }}>{error}</Text>}
          {!!message && <Text style={{ color: '#79D6A1', fontSize: 12, lineHeight: 18, marginBottom: 10 }}>{message}</Text>}
          <TouchableOpacity disabled={sending} onPress={() => void sendInvite()} style={{ minHeight: 48, borderRadius: 10, backgroundColor: theme.gold, alignItems: 'center', justifyContent: 'center', opacity: sending ? 0.6 : 1 }}>
            <Text style={{ color: '#080808', fontWeight: '900' }}>{sending ? 'SENDING INVITATION…' : 'ADD SECOND RESIDENT'}</Text>
          </TouchableOpacity>
        </Card>
      )}
      {!isPrimary && activeMembers.length > 0 && !loading && (
        <Card><Text style={{ color: theme.muted, fontSize: 12, lineHeight: 19 }}>The primary resident manages the second household account. You can view the shared apartment membership here.</Text></Card>
      )}
      {!!error && members.length > 0 && <Text style={{ color: '#F2A5A5', fontSize: 12 }}>{error}</Text>}
      {!!message && members.length > 0 && <Text style={{ color: '#79D6A1', fontSize: 12, lineHeight: 18 }}>{message}</Text>}
    </Screen>
  );
}
