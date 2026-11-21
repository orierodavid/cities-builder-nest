import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, SectionTitle, Card } from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import { theme } from '../../src/theme/theme';

export default function WalletScreen() {
  const router = useRouter();
  const [walletBalanceKobo, setWalletBalanceKobo] = useState<number | null>(null);
  const [walletStatus, setWalletStatus] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [fundingAmount, setFundingAmount] = useState('');
  const [fundingBusy, setFundingBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setError('Your session could not be verified. Please sign in again.');
      setLoading(false);
      return;
    }

    const [balanceResult, transactionResult] = await Promise.all([
      supabase.rpc('get_my_wallet_balance'),
      supabase.rpc('get_my_wallet_transactions', { p_limit: 20 }),
    ]);

    if (balanceResult.error || transactionResult.error) {
      setError('Wallet details are temporarily unavailable. Please try again.');
      setLoading(false);
      return;
    }

    const wallet = Array.isArray(balanceResult.data) ? balanceResult.data[0] : null;
    setWalletBalanceKobo(wallet ? Number(wallet.balance_kobo) : null);
    setWalletStatus(wallet?.status ?? null);
    setTransactions((transactionResult.data || []) as WalletTransaction[]);
    setLoading(false);
      return;
    }

    const estateRows = (membershipResult.data || []).flatMap((row: any) => {
      const estate = Array.isArray(row.estate) ? row.estate[0] : row.estate;
      return estate?.id ? [{ id: estate.id, name: estate.name || 'Your estate' }] : [];
    });
    setEstates([...new Map(estateRows.map((estate) => [estate.id, estate])).values()]);
    setAccounts((accountResult.data || []) as VirtualAccount[]);
    const wallet = Array.isArray(balanceResult.data) ? balanceResult.data[0] : null;
    setWalletBalanceKobo(wallet ? Number(wallet.balance_kobo) : null);
    setWalletStatus(wallet?.status ?? null);
    setTransactions((transactionResult.data || []) as WalletTransaction[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);



  const fundWallet = async () => {
    if (fundingBusy) return;
    const naira = Number(fundingAmount.replace(/,/g, '').trim());
    const amountKobo = Math.round(naira * 100);
    if (!Number.isFinite(naira) || !Number.isSafeInteger(amountKobo) || amountKobo < 10000 || amountKobo > 100000000000) {
      setError('Enter an amount between ₦100 and ₦1,000,000,000.');
      return;
    }
    setFundingBusy(true);
    setError('');
    setNotice('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('squad-wallet-checkout', { body: { amountKobo } });
      if (invokeError) throw new Error(typeof data?.message === 'string' ? data.message : 'Squad wallet funding is not currently available.');
      if (typeof data?.checkoutUrl === 'string' && data.checkoutUrl.startsWith('https://')) {
        await Linking.openURL(data.checkoutUrl);
        setNotice('Squad checkout opened. Your wallet balance updates only after the payment is verified.');
      } else if (data?.status === 'pending') {
        setNotice('Your payment request is being confirmed. Refresh your wallet shortly.');
      } else {
        throw new Error('Squad did not return a checkout link.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not start wallet funding.');
    } finally {
      setFundingBusy(false);
    }
  };

  return (
    <Screen title="Wallet" subtitle="Fund your balance and view wallet transactions">
      <Card>
        <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>WALLET BALANCE</Text>
        <Text accessibilityLabel="Wallet balance" style={{ color: theme.text, fontSize: 28, fontWeight: '900', marginTop: 9 }}>
          {walletBalanceKobo === null ? 'Wallet not activated' : `₦${(walletBalanceKobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        </Text>
        <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginTop: 5 }}>
          {walletBalanceKobo === null
            ? 'Your wallet will appear here once your resident account is approved.'
            : walletStatus === 'active'
              ? 'Available balance includes only confirmed wallet funding and wallet adjustments. Save for Rent contributions are tracked separately and never appear in this balance. Squad payments appear here only after server-side verification.'
              : `Your wallet is ${walletStatus || 'not available'}. Contact CB Nest support if you need help.`}
        </Text>
        <TouchableOpacity onPress={() => router.push('/payments' as never)} style={{ marginTop: 14, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: theme.gold, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: theme.goldSoft, fontWeight: '800' }}>VIEW PAYMENT HISTORY</Text>
        </TouchableOpacity>
      </Card>

      <SectionTitle>Add money</SectionTitle>
      <Card>
        <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 8 }}>Fund your CB Nest wallet securely with Squad. You do not need a virtual account.</Text>
        <TextInput
          value={fundingAmount}
          onChangeText={setFundingAmount}
          keyboardType="decimal-pad"
          placeholder="Amount in naira (minimum ₦100)"
          placeholderTextColor={theme.muted}
          style={{ color: theme.text, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 12, fontSize: 15 }}
          accessibilityLabel="Wallet funding amount in naira"
        />
        <TouchableOpacity onPress={() => void fundWallet()} disabled={fundingBusy} style={{ marginTop: 12, minHeight: 46, borderRadius: 10, backgroundColor: theme.gold, alignItems: 'center', justifyContent: 'center', opacity: fundingBusy ? 0.65 : 1 }}>
          {fundingBusy ? <ActivityIndicator color="#071A3A" /> : <Text style={{ color: '#071A3A', fontWeight: '900' }}>CONTINUE WITH SQUAD</Text>}
        </TouchableOpacity>
      </Card>

      <SectionTitle>Wallet transactions</SectionTitle>
      {transactions.length ? transactions.map((transaction) => (
        <Card key={transaction.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700', flex: 1, marginRight: 12 }}>{transaction.description}</Text>
            <Text style={{ color: transaction.entry_type === 'credit' ? '#79D6A1' : theme.text, fontSize: 14, fontWeight: '900' }}>
              {transaction.entry_type === 'credit' ? '+' : '−'}₦{(Number(transaction.amount_kobo) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>
          <Text style={{ color: theme.muted, fontSize: 11, marginTop: 6 }}>{new Date(transaction.created_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}</Text>
        </Card>
      )) : (
        <Card><Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18 }}>No wallet transactions yet. Confirmed wallet funding and wallet payments will appear here. Save for Rent contributions are recorded separately.</Text></Card>
      )}

      {!!notice && <Card><Text style={{ color: '#79D6A1', fontSize: 12 }}>{notice}</Text></Card>}
      {!!error ? <Card><Text accessibilityRole="alert" style={{ color: '#F2A5A5', fontSize: 12, lineHeight: 18 }}>{error}</Text></Card> : null}
    </Screen>
  );
}
