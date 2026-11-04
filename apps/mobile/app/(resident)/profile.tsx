import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View, TouchableOpacity } from 'react-native';
import { Screen, Card, SectionTitle, ListRow } from '../../src/components/ui';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import ResidentVirtualAccount from '../../components/ResidentVirtualAccount';

export default function ProfileScreen() {
  const router = useRouter();
  const [residentUserId, setResidentUserId] = useState('');
  const [estateId, setEstateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function loadResidentContext() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) { if (mounted) setLoading(false); return; }
        const [{ data: account, error: accountError }, { data: memberships, error: membershipError }] = await Promise.all([
          supabase.from('users').select('full_name, phone_e164').eq('id', user.id).maybeSingle(),
          supabase.from('estate_memberships').select('estate_id, created_at').eq('user_id', user.id).eq('membership_role', 'resident').eq('status', 'active').order('created_at', { ascending: false })
        ]);
        if (accountError) throw accountError;
        if (membershipError) throw membershipError;
        if (mounted) {
          setResidentUserId(user.id);
          setFullName(account?.full_name?.trim() || user.user_metadata?.full_name || '');
          setPhone(account?.phone_e164 || '');
          setEmail(user.email || '');
          setEstateId(memberships?.[0]?.estate_id ?? null);
        }
      } catch { if (mounted) setFullName('Profile details unavailable'); }
      finally { if (mounted) setLoading(false); }
    }
    void loadResidentContext();
    return () => { mounted = false; };
  }, []);

  return (
    <Screen title="My Profile" subtitle="Your account and resident preferences">
      <Card>
        <SectionTitle>Account</SectionTitle>
        {loading ? <ActivityIndicator color="#D4A84B" /> : <View style={{ gap: 8, paddingVertical: 8 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '900' }}>{fullName || 'Name unavailable'}</Text>
          <Text style={{ color: '#B9B9B9', fontSize: 12 }}>{email || 'Email unavailable'}</Text>
          {!!phone && <Text style={{ color: '#B9B9B9', fontSize: 12 }}>{phone}</Text>}
        </View>}
        <ListRow icon="account-outline" title="Personal details" subtitle="View your resident account information" />
        <ListRow icon="home-city-outline" title="My property" subtitle="View your assigned property" onPress={() => router.push('/property' as never)} />
      </Card>
      {loading ? <ActivityIndicator color="#D4A84B" /> : residentUserId ? <ResidentVirtualAccount residentUserId={residentUserId} estateId={estateId} /> : <Text style={{ color: '#B9B9B9', fontSize: 12 }}>Sign in with your resident account to view payment account details.</Text>}
      <Card>
        <SectionTitle>Preferences & support</SectionTitle>
        <ListRow icon="bell-outline" title="Notifications" subtitle="Estate updates and alerts" onPress={() => router.push('/notifications' as never)} />
        <ListRow icon="shield-check-outline" title="Privacy & security" subtitle="Account security and privacy settings" />
        <ListRow icon="help-circle-outline" title="Help & support" subtitle="Get assistance from estate management" />
      </Card>
      <Card>
        <SectionTitle>Account access</SectionTitle>
        {!!logoutError && <Text style={{ color: '#FF9292', fontSize: 12, marginBottom: 8 }}>{logoutError}</Text>}
        <TouchableOpacity accessibilityRole="button" disabled={signingOut} onPress={async () => {
          setSigningOut(true); setLogoutError('');
          try {
            const { error } = await supabase.auth.signOut({ scope: 'local' });
            if (error) throw error;
            router.replace('/' as never);
          } catch (error) {
            setLogoutError(error instanceof Error ? error.message : 'Could not sign out. Please try again.');
          } finally { setSigningOut(false); }
        }} style={{ minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: '#74403A', backgroundColor: '#241615', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#F28B82', fontSize: 12, fontWeight: '900' }}>{signingOut ? 'SIGNING OUT…' : 'SIGN OUT'}</Text>
        </TouchableOpacity>
      </Card>
    </Screen>
  );
}
