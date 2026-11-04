import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { Screen, Card, SectionTitle, ListRow } from '../../src/components/ui';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import ResidentVirtualAccount from '../../components/ResidentVirtualAccount';
import { theme } from '../../src/theme/theme';

type ResidentProfile = {
  full_name: string | null;
  email: string;
  estateName: string;
  buildingName: string;
  unitCode: string;
};

export default function ProfileScreen() {
  const router = useRouter();
  const [residentUserId, setResidentUserId] = useState('');
  const [estateId, setEstateId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ResidentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  async function loadProfile() {
    setLoading(true);
    setError('');
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) throw new Error('Your session has expired. Please sign in again.');

      const [{ data: userProfile, error: profileError }, { data: assignment, error: assignmentError }] = await Promise.all([
        supabase.from('users').select('full_name').eq('id', auth.user.id).maybeSingle(),
        supabase.from('resident_units')
          .select('estate_id, units(unit_code, buildings(name, estates(name)))')
          .eq('resident_user_id', auth.user.id)
          .is('end_date', null)
          .order('start_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (profileError) throw profileError;
      if (assignmentError) throw assignmentError;

      const unit = assignment?.units as any;
      const building = unit?.buildings;
      const estate = building?.estates;
      setResidentUserId(auth.user.id);
      setEstateId(assignment?.estate_id ?? null);
      setProfile({
        full_name: userProfile?.full_name ?? null,
        email: auth.user.email ?? '',
        estateName: estate?.name ?? 'Estate not assigned',
        buildingName: building?.name ?? '',
        unitCode: unit?.unit_code ?? '',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your profile could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadProfile(); }, []);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    const { error: signOutError } = await supabase.auth.signOut();
    setSigningOut(false);
    if (signOutError) {
      Alert.alert('Could not log out', signOutError.message);
      return;
    }
    router.replace('/' as never);
  }

  return (
    <Screen title="My Profile" subtitle="Your account and resident preferences">
      {loading ? (
        <View style={{ paddingVertical: 28, alignItems: 'center' }}>
          <ActivityIndicator color={theme.gold} />
          <Text style={{ color: theme.muted, marginTop: 10 }}>Loading your profile…</Text>
        </View>
      ) : error ? (
        <Card>
          <Text accessibilityRole="alert" style={{ color: '#F2A5A5', fontSize: 13 }}>{error}</Text>
          <Text onPress={() => void loadProfile()} style={{ color: theme.goldSoft, fontWeight: '700', marginTop: 12 }}>Try again</Text>
        </Card>
      ) : (
        <>
          <Card>
            <View style={{ alignItems: 'center', paddingVertical: 12 }}>
              <View style={{ width: 68, height: 68, borderRadius: 34, borderWidth: 1.5, borderColor: theme.gold, backgroundColor: '#211B10', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: theme.gold, fontSize: 25, fontWeight: '900' }}>
                  {(profile?.full_name || profile?.email || 'R').trim().charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={{ color: theme.text, fontSize: 19, fontWeight: '800', marginTop: 10 }}>{profile?.full_name || 'Resident'}</Text>
              <Text style={{ color: theme.muted, fontSize: 12, marginTop: 4 }}>{profile?.email}</Text>
              <Text style={{ color: theme.goldSoft, fontSize: 11, fontWeight: '700', marginTop: 8 }}>{profile?.estateName}</Text>
              {!!(profile?.buildingName || profile?.unitCode) && (
                <Text style={{ color: theme.muted, fontSize: 11, marginTop: 3 }}>
                  {[profile?.buildingName, profile?.unitCode ? 'Unit ' + profile.unitCode : ''].filter(Boolean).join(' · ')}
                </Text>
              )}
            </View>
          </Card>
          <Card>
            <SectionTitle>Account</SectionTitle>
            <ListRow icon="account-outline" title="Personal details" subtitle="Name and sign-in email" onPress={() => Alert.alert('Personal details', [profile?.full_name || 'Name not provided', profile?.email || 'Email unavailable'].join('\n'))} />
            <ListRow icon="home-city-outline" title="My property" subtitle="View your assigned property" onPress={() => router.push('/property' as never)} />
            <ListRow icon="receipt" title="Payment history" subtitle="View confirmed service-charge payments" onPress={() => router.push('/payments' as never)} />
          </Card>
          {residentUserId ? <ResidentVirtualAccount residentUserId={residentUserId} estateId={estateId} /> : null}
          <Card>
            <SectionTitle>Preferences & support</SectionTitle>
            <ListRow icon="bell-outline" title="Notifications" subtitle="Estate updates and alerts" onPress={() => router.push('/notifications' as never)} />
            <ListRow icon="shield-check-outline" title="Privacy & security" subtitle="Review your account security" onPress={() => Alert.alert('Privacy & security', 'Your account is protected by your CB Nest sign-in. Contact your estate administrator if you need help with account access or personal-data corrections.')} />
            <ListRow icon="help-circle-outline" title="Help & support" subtitle="Get assistance with your estate account" onPress={() => Alert.alert('Help & support', 'For assistance with your estate account, contact your estate management team.')} />
          </Card>
          <Card>
            <ListRow icon="logout" title={signingOut ? 'Signing out…' : 'Log out'} subtitle="Sign out of this device" onPress={() => void signOut()} />
          </Card>
        </>
      )}
    </Screen>
  );
}
