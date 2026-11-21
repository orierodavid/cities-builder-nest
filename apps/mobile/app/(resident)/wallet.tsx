import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, SectionTitle, Card } from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import { theme } from '../../src/theme/theme';

type ResidentEstate = { id: string; name: string };
type VirtualAccount = {
  id: string;
  estate_id: string;
  provider: string;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  currency: string;
  status: string;
};
type WalletTransaction = {
  id: string;
  entry_type: 'credit' | 'debit';
  amount_kobo: number;
  source: string;
  description: string;
  created_at: string;
};

export default function WalletScreen() {
  const router = useRouter();
  const [walletBalanceKobo, setWalletBalanceKobo] = useState<number | null>(null);
  const [walletStatus, setWalletStatus] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [estates, setEstates] = useState<ResidentEstate[]>([]);
  const [virtualAccounts, setVirtualAccounts] = useState<VirtualAccount[]>([]);
  const [accountBusyEstate, setAccountBusyEstate] = useState<string | null>(null);
  const [accountConsent, setAccountConsent] = useState(false);
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

    const [balanceResult, transactionResult, membershipResult, accountResult] = await Promise.all([
      supabase.rpc('get_my_wallet_balance'),
      supabase.rpc('get_my_wallet_transactions', { p_limit: 20 }),
      supabase.from('estate_memberships')
        .select('estate_id, estate:estates(id, name)')
        .eq('user_id', user.id)
        .eq('membership_role', 'resident')
        .eq('status', 'active'),
      supabase.from('resident_virtual_accounts')
        .select('id, estate_id, provider, bank_name, account_number, account_name, currency, status')
        .eq('resident_user_id', user.id),
    ]);
    if (balanceResult.error || transactionResult.error || membershipResult.error || accountResult.error) {
      setError('Wallet details are temporarily unavailable. Please try again.');
      setLoading(false);
      return;
    }

    const wallet = Array.isArray(balanceResult.data) ? balanceResult.data[0] : null;
    setWalletBalanceKobo(wallet ? Number(wallet.balance_kobo) : null);
    setWalletStatus(wallet?.status ?? null);
    setTransactions((transactionResult.data || []) as WalletTransaction[]);
    const estateRows = (membershipResult.data || []).flatMap((row: any) => {
      const estate = Array.isArray(row.estate) ? row.estate[0] : row.estate;
      return estate?.id ? [{ id: estate.id, name: estate.name || 'Your estate' }] : [];
    });
    setEstates([...new Map(estateRows.map((estate) => [estate.id, estate])).values()]);
    setVirtualAccounts((accountResult.data || []) as VirtualAccount[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => subscription.remove();
  }, [load]);

  const createVirtualAccount = async (estateId: string) => {
    if (accountBusyEstate || !accountConsent) return;
    setAccountBusyEstate(estateId);
    setError('');
    setNotice('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('create-resident-virtual-account', {
        body: { provider: 'paystack', estateId, consent: true },
      });
      if (invokeError) {
        const detail = typeof data?.message === 'string' ? data.message : typeof data?.error === 'string' ? data.error : '';
        throw new Error(detail || 'Virtual account creation is not currently available.');
      }
      const account = data?.virtualAccount as VirtualAccount | undefined;
      if (account) {
        setVirtualAccounts((current) => [...current.filter((item) => item.id !== account.id), account]);
      }
      if (data?.pending === true || account?.status === 'pending') {
        setNotice('Your virtual account request is pending provider confirmation. Refresh shortly.');
      } else if (account?.status === 'active') {
        setNotice('Your virtual account is ready. Use the displayed account details for transfers.');
      } else {
        setNotice('The virtual account request was received. Refresh to check its status.');
      }
      setAccountConsent(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not request a virtual account.');
    } finally {
      setAccountBusyEstate(null);
    }
  };

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
        setNotice('Your payment request is still being confirmed. Refresh your wallet shortly.');
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
          {loading ? 'Loading…' : walletBalanceKobo === null ? 'Wallet not activated' : `₦${(walletBalanceKobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        </Text>
        <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginTop: 5 }}>
          {walletBalanceKobo === null
            ? 'Your wallet will appear here once your resident account is approved.'
            : walletStatus === 'active'
              ? 'Available balance includes only confirmed wallet funding and wallet adjustments. Save for Rent contributions are tracked separately and never appear in this balance. Squad payments appear here only after server-side verification.'
              : `Your wallet is ${walletStatus || 'not available'}. Contact CB Nest support if you need help.`}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <TouchableOpacity onPress={() => router.push('/payments' as never)} style={{ flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: theme.gold, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: theme.goldSoft, fontWeight: '800' }}>PAYMENT HISTORY</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void load()} disabled={loading} style={{ minWidth: 92, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: theme.goldSoft, fontWeight: '800' }}>REFRESH</Text>
          </TouchableOpacity>
        </View>
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
        <TouchableOpacity onPress={() => void fundWallet()} disabled={fundingBusy || walletStatus !== 'active'} style={{ marginTop: 12, minHeight: 46, borderRadius: 10, backgroundColor: theme.gold, alignItems: 'center', justifyContent: 'center', opacity: fundingBusy || walletStatus !== 'active' ? 0.65 : 1 }}>
          {fundingBusy ? <ActivityIndicator color="#071A3A" /> : <Text style={{ color: '#071A3A', fontWeight: '900' }}>CONTINUE WITH SQUAD</Text>}
        </TouchableOpacity>
      </Card>

      <SectionTitle>Virtual accounts</SectionTitle>
      <Card>
        <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginBottom: 12 }}>
          Virtual accounts are a separate wallet-funding option for bank transfers. Squad checkout remains available above. You can request a dedicated account when a supported provider is configured; no account is created just by viewing this page.
        </Text>
        {estates.length === 0 ? (
          <Text style={{ color: theme.muted, fontSize: 12 }}>An active resident-estate membership is required before a virtual account can be requested.</Text>
        ) : estates.map((estate) => {
          const account = virtualAccounts.find((item) => item.estate_id === estate.id && item.provider === 'paystack');
          return (
            <View key={estate.id} style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 12, marginTop: 8 }}>
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>{estate.name}</Text>
              {account?.status === 'active' ? (
                <View style={{ marginTop: 10 }}>
                  <Text style={{ color: theme.goldSoft, fontSize: 11, fontWeight: '800' }}>PAYSTACK VIRTUAL ACCOUNT</Text>
                  <Text style={{ color: theme.text, fontSize: 13, marginTop: 7 }}>Bank: {account.bank_name || '—'}</Text>
                  <Text selectable style={{ color: theme.text, fontSize: 20, fontWeight: '900', marginTop: 4 }}>{account.account_number || '—'}</Text>
                  <Text style={{ color: theme.muted, fontSize: 12, marginTop: 4 }}>Account name: {account.account_name || '—'}</Text>
                  <Text style={{ color: theme.muted, fontSize: 11, marginTop: 3 }}>Currency: {account.currency || 'NGN'}</Text>
                </View>
              ) : account?.status === 'pending' ? (
                <Text style={{ color: theme.goldSoft, fontSize: 12, marginTop: 8 }}>Account request pending provider confirmation.</Text>
              ) : account?.status === 'failed' ? (
                <Text style={{ color: '#F2A5A5', fontSize: 12, marginTop: 8 }}>The previous request could not be completed. You can retry when the provider is configured.</Text>
              ) : (
                <Text style={{ color: theme.muted, fontSize: 12, marginTop: 8 }}>No dedicated account created yet.</Text>
              )}
              {account?.status !== 'active' && (
                <TouchableOpacity
                  onPress={() => void createVirtualAccount(estate.id)}
                  disabled={accountBusyEstate !== null || !accountConsent || account?.status === 'pending'}
                  style={{ marginTop: 10, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: theme.gold, alignItems: 'center', justifyContent: 'center', opacity: accountBusyEstate !== null || !accountConsent || account?.status === 'pending' ? 0.5 : 1 }}
                >
                  {accountBusyEstate === estate.id ? <ActivityIndicator color={theme.goldSoft} /> : <Text style={{ color: theme.goldSoft, fontWeight: '800' }}>{account?.status === 'failed' ? 'RETRY VIRTUAL ACCOUNT REQUEST' : 'REQUEST VIRTUAL ACCOUNT'}</Text>}
                </TouchableOpacity>
              )}
            </View>
          );
        })}
        {estates.length > 0 && virtualAccounts.every((account) => account.status !== 'active') && (
          <TouchableOpacity onPress={() => setAccountConsent((value) => !value)} style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 14, gap: 9 }}>
            <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 1, borderColor: theme.gold, backgroundColor: accountConsent ? theme.gold : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {accountConsent ? <Text style={{ color: '#071A3A', fontWeight: '900', fontSize: 13 }}>✓</Text> : null}
            </View>
            <Text style={{ color: theme.muted, flex: 1, fontSize: 11, lineHeight: 17 }}>I consent to the selected provider creating a dedicated virtual account using my resident profile details.</Text>
          </TouchableOpacity>
        )}
        <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 16, marginTop: 10 }}>
          Provider availability is checked securely when you request an account. If credentials or provider approval are not in place, CB Nest will not create an account.
        </Text>
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
        <Card><Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18 }}>{loading ? 'Loading wallet transactions…' : 'No wallet transactions yet. Confirmed wallet funding and wallet payments will appear here. Save for Rent contributions are recorded separately.'}</Text></Card>
      )}

      {!!notice && <Card><Text style={{ color: '#79D6A1', fontSize: 12 }}>{notice}</Text></Card>}
      {!!error && <Card><Text accessibilityRole="alert" style={{ color: '#F2A5A5', fontSize: 12, lineHeight: 18 }}>{error}</Text></Card>}
    </Screen>
  );
}
