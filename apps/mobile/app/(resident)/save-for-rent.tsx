import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Screen } from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import RentSavings from '../../components/RentSavings';
import { theme } from '../../src/theme/theme';

export default function SaveForRentScreen() {
  const [residentUserId, setResidentUserId] = useState('');
  const [estateId, setEstateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [contextError, setContextError] = useState('');

  const loadResidentContext = useCallback(async () => {
    setLoading(true);
    setContextError('');
    setResidentUserId('');
    setEstateId(null);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) throw new Error('Your session has expired. Please sign in again.');

      const { data: memberships, error: membershipError } = await supabase.from('estate_memberships')
        .select('estate_id, created_at')
        .eq('user_id', auth.user.id)
        .eq('membership_role', 'resident')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (membershipError) throw membershipError;
      const activeEstateId = memberships?.find(item => !!item.estate_id)?.estate_id;
      if (!activeEstateId) {
        throw new Error('Your account does not have an active Resident estate membership. Contact your estate manager before creating a rent savings goal.');
      }

      setResidentUserId(auth.user.id);
      setEstateId(activeEstateId);
    } catch (error) {
      setContextError(error instanceof Error ? error.message : 'Your Resident account details could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadResidentContext(); }, [loadResidentContext]);

  return (
    <Screen title="Save for Rent" subtitle="Create and manage your rent savings goals">
      {loading ? <ActivityIndicator color={theme.gold} /> : residentUserId && estateId ? (
        <RentSavings residentUserId={residentUserId} estateId={estateId} />
      ) : (
        <View style={{ paddingVertical: 18, gap: 12 }}>
          <Text accessibilityRole="alert" style={{ color: '#F0C766', fontSize: 13, lineHeight: 20 }}>
            {contextError || 'Your active Resident estate membership could not be verified.'}
          </Text>
          <TouchableOpacity onPress={() => void loadResidentContext()} style={{ minHeight: 46, borderRadius: 10, backgroundColor: theme.gold, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#080808', fontWeight: '800' }}>TRY AGAIN</Text>
          </TouchableOpacity>
        </View>
      )}
    </Screen>
  );
}
