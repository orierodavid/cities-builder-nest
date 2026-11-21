import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, SectionTitle, Card, EmptyState } from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import { theme } from '../../src/theme/theme';

type Estate = { id: string; name: string };
type WalletTransaction = { id: string; entry_type: 'credit' | 'debit'; amount_kobo: number; source: string; description: string; created_at: string };
type VirtualAccount = {
  id: string;
  estate_id: string;
  provider: string;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  currency: string;
  status: 'pending' | 'active' | 'failed' | 'disabled' | string;
};

const providerLabel = (value: string) => value.replace(/[_-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function WalletScreen() {
  const router = useRouter();
  const [estates, setEstates] = useState<Estate[]>([]);
  const [accounts, setAccounts] = useState<VirtualAccount[]>([]);
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

    const [membershipResult, accountResult, balanceResult, transactionResult] = await Promise.all([
      supabase.from('estate_memberships')
        .select('estate_id, estate:estates(id,name)')
        .eq('user_id', user.id)
        .eq('membership_role', 'resident')
        .eq('status', 'active'),
      supabase.from('resident_virtual_accounts')
        .select('id,estate_id,provider,bank_name,account_number,account_name,currency,status')
        .eq('resident_user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.rpc('get_my_wallet_balance'),
      supabase.rpc('get_my_wallet_transactions', { p_limit: 20 }),
    ]);

    if (membershipResult.error || accountResult.error) {
      setError('Wallet details are temporarily unavailable. Please try again.');
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

  const estateName = (estateId: string) => estates.find((estate) => estate.id === estateId)?.name || 'Estate account';

  return (
    <Screen title="Wallet" subtitle="Manage your wallet funding accounts">
      <Card>
        <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>WALLET BALANCE</Text>
        <Text accessibilityLabel="Wallet balance" style={{ color: theme.text, fontSize: 28, fontWeight: '900', marginTop: 9 }}>
          {walletBalanceKobo === null ? 'Wallet not activated' : `₦${(walletBalanceKobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        </Text>
        <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginTop: 5 }}>
          {walletBalanceKobo === null
            ? 'Your wallet will appear here once your resident account is approved.'
            : walletStatus === 'active'
              ? 'Available balance is calculated from confirmed wallet transactions. Confirmed Squad payments appear here after server-side verification. Paystack is coming soon.'
              : `Your wallet is ${walletStatus || 'not available'}. Contact CB Nest support if you need help.`}
        </Text>
        <TouchableOpacity onPress={() => router.push('/payments' as never)} style={{ marginTop: 14, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: theme.gold, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: theme.goldSoft, fontWeight: '800' }}>VIEW PAYMENT HISTORY</Text>
        </TouchableOpacity>
      </Card>

      <SectionTitle>Add money</SectionTitle>
      <Card>
        <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 8 }}>Fund your CB Nest wallet securely with Squad.</Text>
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
        <Card><Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18 }}>No wallet transactions yet. Confirmed wallet funding and wallet payments will appear here.</Text></Card>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <SectionTitle>Virtual accounts</SectionTitle>
        <Text onPress={() => void load()} style={{ color: theme.goldSoft, fontSize: 12, fontWeight: '700', padding: 8 }}>REFRESH</Text>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 32, alignItems: 'center' }}>
          <ActivityIndicator color={theme.gold} />
          <Text style={{ color: theme.muted, marginTop: 10 }}>Loading your accounts…</Text>
        </View>
      ) : error && !accounts.length && !estates.length ? (
        <Card>
          <Text style={{ color: '#F2A5A5', fontSize: 13 }}>{error}</Text>
          <Text onPress={() => void load()} style={{ color: theme.goldSoft, fontWeight: '700', marginTop: 12 }}>Try again</Text>
        </Card>
      ) : (
        <>
          {accounts.length ? accounts.map((account) => (
            <Card key={account.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>{providerLabel(account.provider)}</Text>
                <Text style={{ color: account.status === 'active' ? '#79D6A1' : theme.goldSoft, fontSize: 10, fontWeight: '800' }}>{account.status.toUpperCase()}</Text>
              </View>
              <Text style={{ color: theme.muted, fontSize: 11, marginTop: 5 }}>{estateName(account.estate_id)} · {account.bank_name || 'Bank details pending'}</Text>
              {account.account_number ? <Text selectable style={{ color: theme.goldSoft, fontSize: 22, fontWeight: '900', letterSpacing: 1, marginTop: 12 }}>{account.account_number}</Text> : null}
              {account.account_name ? <Text selectable style={{ color: theme.text, fontSize: 12, marginTop: 5 }}>{account.account_name}</Text> : null}
              {!account.account_number && account.status === 'pending' ? <Text style={{ color: theme.muted, fontSize: 12, marginTop: 10 }}>Your bank account details are being confirmed.</Text> : null}
            </Card>
          )) : (
            <EmptyState icon="bank-outline" title="No virtual account yet" message="Paystack virtual accounts will be available after your Paystack account is registered and configured." />
          )}

          {estates.filter((estate) => !accounts.some((account) => account.estate_id === estate.id && account.provider === 'paystack' && (account.status === 'active' || account.status === 'pending'))).map((estate) => (
            <Card key={estate.id}>
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>{estate.name}</Text>
              <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginTop: 5 }}>Paystack dedicated accounts are not enabled yet. This option will be available after Paystack registration and configuration.</Text>
              <TouchableOpacity onPress={() => Alert.alert('Paystack coming soon', 'Paystack will be enabled after your account is registered and configured.')} disabled={true} style={{ marginTop: 14, minHeight: 46, borderRadius: 10, backgroundColor: theme.gold, alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                <Text style={{ color: '#071A3A', fontWeight: '900' }}>PAYSTACK — COMING SOON</Text>
              </TouchableOpacity>
            </Card>
          ))}
          {!estates.length ? <EmptyState icon="home-outline" title="No active estate membership" message="A virtual account can be requested after your resident membership is approved." /> : null}
        </>
      )}

      {!!notice && <Card><Text style={{ color: '#79D6A1', fontSize: 12 }}>{notice}</Text></Card>}
      {!!error && (accounts.length > 0 || estates.length > 0) ? <Card><Text accessibilityRole="alert" style={{ color: '#F2A5A5', fontSize: 12, lineHeight: 18 }}>{error}</Text></Card> : null}
      <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 17, marginTop: 8 }}>
        Virtual accounts are optional. Paystack account creation is not enabled yet and will be activated after registration and configuration.
      </Text>
    </Screen>
  );
}
