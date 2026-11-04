import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { Screen, Card, SectionTitle, ListRow } from '../../src/components/ui';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import ResidentVirtualAccount from '../../components/ResidentVirtualAccount';

export default function ProfileScreen() {
  const router = useRouter();
  const [residentUserId, setResidentUserId] = useState('');
  const [estateId, setEstateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadResidentContext() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { if (mounted) setLoading(false); return; }
      const { data: memberships } = await supabase.from('estate_memberships')
        .select('estate_id, created_at')
        .eq('user_id', auth.user.id)
        .eq('membership_role', 'resident')
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (mounted) {
        setResidentUserId(auth.user.id);
        setEstateId(memberships?.[0]?.estate_id ?? null);
        setLoading(false);
      }
    }
    void loadResidentContext();
    return () => { mounted = false; };
  }, []);

  return (
    <Screen title="My Profile" subtitle="Your account and resident preferences">
      <Card>
        <SectionTitle>Account</SectionTitle>
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
    </Screen>
  );
}
