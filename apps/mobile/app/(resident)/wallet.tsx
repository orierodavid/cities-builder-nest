import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Screen, Card } from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import { theme } from '../../src/theme/theme';

function PaystackMark() {
  return <Svg width={34} height={34} viewBox="0 0 34 34">
    <Circle cx="17" cy="17" r="16" fill="#00C3F7" />
    <Path d="M9 12h16v3H9zm0 7h16v3H9z" fill="#072654" />
    <Path d="M12 8h10v3H12zm0 15h10v3H12z" fill="#072654" />
  </Svg>;
}
function SquadMark() {
  return <Svg width={34} height={34} viewBox="0 0 34 34">
    <Rect x="1" y="1" width="32" height="32" rx="10" fill="#E6B93F" />
    <Path d="M22.8 10.2c-1.6-1.5-3.5-2.2-6-2.2-4.5 0-7.5 2.4-7.5 6 0 3.4 2.6 4.6 6.5 5.4 2.6.5 3.5.9 3.5 1.8 0 1-1.1 1.5-2.8 1.5-2 0-3.9-.8-5.6-2.3l-2.8 3.3c2.1 2 5 3.1 8.3 3.1 4.7 0 7.8-2.3 7.8-6.1 0-3.3-2.4-4.6-6.4-5.4-2.7-.6-3.7-.9-3.7-1.9 0-.8.9-1.4 2.5-1.4 1.7 0 3.4.7 5 1.8z" fill="#171717" />
  </Svg>;
}

export default function WalletScreen() {
  const router = useRouter();
  const [balanceKobo, setBalanceKobo] = useState<number | null>(null);
  const [walletStatus, setWalletStatus] = useState<string | null>(null);
  const [pendingChargeKobo, setPendingChargeKobo] = useState<number | null>(null);
  const [pendingChargeLoading, setPendingChargeLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [funding, setFunding] = useState(false);
  const [message, setMessage] = useState('');

  const loadBalance = useCallback(async () => {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    setPendingChargeLoading(true);
    if (authError || !user) {
      setMessage('Please sign in again to view your wallet.');
      setLoading(false);
      setPendingChargeLoading(false);
      return;
    }
    const [walletResult, membershipResult, assignmentResult] = await Promise.all([
      supabase.rpc('get_my_wallet_balance'),
      supabase.from('estate_memberships').select('estate_id').eq('user_id', user.id).eq('membership_role', 'resident').eq('status', 'active'),
      supabase.from('resident_units').select('unit_id').eq('resident_user_id', user.id).is('end_date', null).order('created_at', { ascending: false }).limit(1),
    ]);
    const { data, error } = walletResult;
    if (error) {
      setMessage('Wallet balance is temporarily unavailable.');
      setPendingChargeLoading(false);
      setLoading(false);
      return;
    }
    const wallet = Array.isArray(data) ? data[0] : null;
    setBalanceKobo(wallet ? Number(wallet.balance_kobo) : null);
    setWalletStatus(wallet?.status ?? null);

    try {
      const { data: pendingTotal, error: pendingError } = await supabase.rpc('get_my_pending_service_charge_total');
      if (pendingError) throw pendingError;
      const value = Array.isArray(pendingTotal) ? pendingTotal[0] : pendingTotal;
      setPendingChargeKobo(value === null || value === undefined ? 0 : Number(value));
    } catch {
      setPendingChargeKobo(null);
    } finally {
      setPendingChargeLoading(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadBalance(); }, [loadBalance]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') void loadBalance();
    });
    return () => sub.remove();
  }, [loadBalance]);

  const topUpWithSquad = async () => {
    const naira = Number(amount.replace(/,/g, '').trim());
    const amountKobo = Math.round(naira * 100);
    if (!Number.isFinite(naira) || !Number.isSafeInteger(amountKobo) || amountKobo < 10000 || amountKobo > 100000000000) {
      setMessage('Enter an amount between ₦100 and ₦1,000,000,000.');
      return;
    }
    setFunding(true);
    setMessage('');
    try {
      const { data, error } = await supabase.functions.invoke('squad-wallet-checkout', { body: { amountKobo } });
      if (error) throw new Error('Squad top up is temporarily unavailable.');
      if (typeof data?.transactionReference !== 'string' || !data.transactionReference) {
        throw new Error('We could not confirm the payment attempt. Please check your wallet before trying again.');
      }
      if (data.checkoutUrl && (typeof data.checkoutUrl !== 'string' || !data.checkoutUrl.startsWith('https://'))) {
        throw new Error('The payment link could not be validated.');
      }
      if (typeof data.checkoutUrl === 'string') {
        router.push({ pathname: '/payment-checkout', params: {
          checkoutUrl: data.checkoutUrl,
          reference: data.transactionReference,
          paymentType: 'wallet_funding',
          amountKobo: String(data.amountKobo ?? amountKobo),
          feeKobo: '0',
          totalAmountKobo: String(data.amountKobo ?? amountKobo),
        } });
      } else if (data?.status === 'pending') {
        router.push({ pathname: '/payment-checkout', params: {
          checkoutUrl: '', reference: data.transactionReference, paymentType: 'wallet_funding',
          amountKobo: String(data.amountKobo ?? amountKobo), feeKobo: '0',
          totalAmountKobo: String(data.amountKobo ?? amountKobo),
        } });
      } else {
        throw new Error('Squad could not start the payment. Please try again.');
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Top up could not be started.');
    } finally {
      setFunding(false);
    }
  };

  const pendingCharge = pendingChargeKobo === null ? '—' : `₦${(pendingChargeKobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const balance = balanceKobo === null ? '—' : `₦${(balanceKobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Screen title="Wallet">
      <Card>
        <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>WALLET BALANCE</Text>
        <Text accessibilityLabel="Wallet balance" style={{ color: theme.text, fontSize: 30, fontWeight: '900', marginTop: 9 }}>
          {loading ? 'Loading…' : balance}
        </Text>
        <TouchableOpacity onPress={() => void loadBalance()} disabled={loading} style={{ alignSelf: 'flex-start', marginTop: 10 }}>
          <Text style={{ color: theme.goldSoft, fontSize: 12, fontWeight: '700' }}>Refresh balance</Text>
        </TouchableOpacity>
      </Card>
      <Card>
        <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>PENDING CHARGE</Text>
        <Text accessibilityLabel="Pending service charge" style={{ color: '#E53935', fontSize: 24, fontWeight: '900', marginTop: 8 }}>
          {pendingChargeLoading ? 'Loading…' : pendingCharge}
        </Text>
        <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 16, marginTop: 5 }}>Outstanding amount from your estate service charges.</Text>
      </Card>

      <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800', marginTop: 8 }}>Top up wallet</Text>
      <Card>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="Enter amount (minimum ₦100)"
          placeholderTextColor={theme.muted}
          accessibilityLabel="Top up amount in naira"
          style={{ color: theme.text, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 13, fontSize: 14 }}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 16 }}>
          <PaystackMark />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>Paystack Virtual Account</Text>
            <Text style={{ color: theme.muted, fontSize: 11, marginTop: 3 }}>Not Available</Text>
          </View>
          <Text style={{ color: theme.muted, fontSize: 10, fontWeight: '800' }}>NOT AVAILABLE</Text>
        </View>
        <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 14 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
          <SquadMark />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>Squad</Text>
            <Text style={{ color: theme.muted, fontSize: 11, marginTop: 3 }}>Secure wallet top up</Text>
          </View>
          <Text style={{ color: '#79D6A1', fontSize: 10, fontWeight: '800' }}>AVAILABLE</Text>
        </View>
        <TouchableOpacity
          onPress={() => void topUpWithSquad()}
          disabled={funding || loading || walletStatus !== 'active'}
          style={{ marginTop: 16, minHeight: 48, borderRadius: 10, backgroundColor: theme.gold, alignItems: 'center', justifyContent: 'center', opacity: funding || loading || walletStatus !== 'active' ? 0.55 : 1 }}
        >
          {funding ? <ActivityIndicator color="#071A3A" /> : <Text style={{ color: '#071A3A', fontWeight: '900' }}>TOP UP WITH SQUAD</Text>}
        </TouchableOpacity>
        {walletStatus !== 'active' && !loading ? <Text style={{ color: theme.muted, fontSize: 11, marginTop: 9 }}>Wallet top up is unavailable until your wallet is active.</Text> : null}
      </Card>
      {!!message && <Text accessibilityRole="alert" style={{ color: '#F2A5A5', fontSize: 12, lineHeight: 18 }}>{message}</Text>}
    </Screen>
  );
}
