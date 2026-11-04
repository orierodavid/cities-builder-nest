import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ResidentElectricity from '../../components/ResidentElectricity';
import { supabase } from '../../lib/supabase';
import { theme } from '../../src/theme/theme';

export default function ResidentElectricityRoute() {
  const router = useRouter();
  const [estateId, setEstateId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) throw new Error('Please sign in again to access electricity services.');

        const { data: assignments, error: assignmentError } = await supabase
          .from('resident_units')
          .select('estate_id')
          .eq('resident_user_id', user.id)
          .is('end_date', null)
          .order('start_date', { ascending: false })
          .limit(2);
        if (assignmentError) throw assignmentError;

        const ids = [...new Set((assignments || []).map((row) => row.estate_id).filter(Boolean))];
        if (ids.length !== 1) {
          throw new Error(ids.length === 0
            ? 'No active apartment assignment was found. Please contact your estate manager.'
            : 'More than one active estate assignment was found. Please contact your estate manager.');
        }
        if (active) setEstateId(ids[0]);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Your estate details could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(resident)' as never); }} accessibilityRole="button" accessibilityLabel="Go back" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 }}><Ionicons name="chevron-back" size={24} color={theme.gold} /><Text style={{ color: theme.gold, fontSize: 12, fontWeight: '800' }}>BACK</Text></TouchableOpacity>
        {loading ? (
          <View style={{ minHeight: 220, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={theme.gold} />
            <Text style={{ color: theme.muted, marginTop: 12 }}>Loading your estate details…</Text>
          </View>
        ) : error ? (
          <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 14, padding: 18 }}>
            <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800' }}>Electricity services unavailable</Text>
            <Text style={{ color: '#F2A5A5', fontSize: 13, lineHeight: 20, marginTop: 9 }}>{error}</Text>
          </View>
        ) : (
          <ResidentElectricity estateId={estateId} onBack={() => router.replace('/(resident)' as never)} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
