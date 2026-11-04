import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import RentSavings from '../../components/RentSavings';

export default function SaveForRentScreen() {
  const router = useRouter();
  const [residentUserId, setResidentUserId] = useState('');
  const [estateId, setEstateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadResidentContext() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { if (mounted) setLoading(false); return; }
      const { data: memberships, error } = await supabase.from('estate_memberships')
        .select('estate_id, created_at')
        .eq('user_id', auth.user.id)
        .eq('membership_role', 'resident')
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (mounted) {
        setResidentUserId(auth.user.id);
        setEstateId(error ? null : memberships?.[0]?.estate_id ?? null);
        setLoading(false);
      }
    }
    void loadResidentContext();
    return () => { mounted = false; };
  }, []);

  return (
    <Screen title="Save for Rent" subtitle="Create and manage your rent savings goals" back>
      {loading ? <ActivityIndicator color="#D4A84B" /> : residentUserId ? (
        <RentSavings residentUserId={residentUserId} estateId={estateId} onBack={() => router.back()} />
      ) : (
        <Text style={{ color: '#B9B9B9', fontSize: 12 }}>Please sign in with your resident account to create a rent savings goal.</Text>
      )}
    </Screen>
  );
}
