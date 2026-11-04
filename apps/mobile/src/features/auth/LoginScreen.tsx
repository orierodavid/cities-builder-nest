// src/features/auth/LoginScreen.tsx
// Black-and-gold login presentation. Authentication is supplied by the parent.
import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView,
  Platform, ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const C = {
  bg: '#050505', card: '#121212', field: '#1A1A1A', gold: '#D4AF37',
  goldBorder: 'rgba(212,175,55,0.35)', text: '#FFFFFF', muted: '#9A9A9A',
  dark: '#0A0A0A', error: '#E5484D',
};

type Props = {
  onSubmit: (identifier: string, password: string) => Promise<void> | void;
  onForgotPassword?: (identifier: string) => void;
  onCreateAccount?: () => void;
};

export function LoginScreen({ onSubmit, onForgotPassword, onCreateAccount }: Props) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<'id' | 'pw' | null>(null);

  const canSubmit = identifier.trim().length > 0 && password.length > 0 && !loading;
  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      await onSubmit(identifier.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.brandWrap}>
            <View style={s.logoRing}><MaterialCommunityIcons name="home-city" size={40} color={C.gold} /></View>
            <Text style={s.brand}>CB NEST</Text>
            <Text style={s.tagline}>Building Your Future, One Step at a Time.</Text>
          </View>
          <View style={s.card}>
            <Text style={s.title}>Welcome back</Text>
            <Text style={s.subtitle}>Sign in to access your estate services</Text>
            <Text style={s.label}>Email or phone number</Text>
            <View style={[s.field, focus === 'id' && s.fieldFocus]}>
              <MaterialCommunityIcons name="account-outline" size={20} color={C.muted} />
              <TextInput style={s.input} value={identifier} onChangeText={setIdentifier}
                placeholder="you@example.com or +234..." placeholderTextColor="#666"
                autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
                textContentType="username" onFocus={() => setFocus('id')} onBlur={() => setFocus(null)}
                returnKeyType="next" />
            </View>
            <Text style={s.label}>Password</Text>
            <View style={[s.field, focus === 'pw' && s.fieldFocus]}>
              <MaterialCommunityIcons name="lock-outline" size={20} color={C.muted} />
              <TextInput style={s.input} value={password} onChangeText={setPassword}
                placeholder="Enter your password" placeholderTextColor="#666"
                secureTextEntry={!show} autoCapitalize="none" textContentType="password"
                onFocus={() => setFocus('pw')} onBlur={() => setFocus(null)}
                onSubmitEditing={submit} returnKeyType="go" />
              <Pressable onPress={() => setShow(v => !v)} hitSlop={10}>
                <MaterialCommunityIcons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={C.muted} />
              </Pressable>
            </View>
            <Pressable onPress={() => onForgotPassword?.(identifier.trim())} style={s.forgot} hitSlop={8}>
              <Text style={s.forgotText}>Forgot password?</Text>
            </Pressable>
            {error ? <View style={s.errorBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color={C.error} />
              <Text style={s.errorText}>{error}</Text>
            </View> : null}
            <Pressable onPress={submit} disabled={!canSubmit}
              style={({ pressed }) => [s.button, !canSubmit && s.buttonDisabled, pressed && { opacity: 0.85 }]}>
              {loading ? <ActivityIndicator color={C.dark} /> : <Text style={s.buttonText}>Sign In</Text>}
            </Pressable>
          </View>
          {onCreateAccount ? <View style={s.bottomRow}>
            <Text style={s.bottomText}>Don't have an account?</Text>
            <Pressable onPress={onCreateAccount} hitSlop={8}><Text style={s.bottomLink}> Contact estate management</Text></Pressable>
          </View> : null}
          <Text style={s.footer}>A safer, smarter and more convenient community.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default LoginScreen;

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  brandWrap: { alignItems: 'center', marginBottom: 28 },
  logoRing: { width: 84, height: 84, borderRadius: 42, borderWidth: 1.5, borderColor: C.gold, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  brand: { color: C.gold, fontSize: 28, fontWeight: '800', letterSpacing: 1.5, marginTop: 14 },
  tagline: { color: C.muted, fontSize: 12, marginTop: 4, textAlign: 'center' },
  card: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.goldBorder, padding: 20 },
  title: { color: C.text, fontSize: 22, fontWeight: '800' },
  subtitle: { color: C.muted, fontSize: 13, marginTop: 4, marginBottom: 18 },
  label: { color: C.muted, fontSize: 12, marginBottom: 6, marginTop: 8 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.field, borderRadius: 12, borderWidth: 1, borderColor: '#2A2A2A', paddingHorizontal: 14, height: 50 },
  fieldFocus: { borderColor: C.gold },
  input: { flex: 1, color: C.text, fontSize: 14, height: '100%' },
  forgot: { alignSelf: 'flex-end', marginTop: 10 },
  forgotText: { color: C.gold, fontSize: 12, fontWeight: '600' },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, padding: 10, borderRadius: 10, backgroundColor: 'rgba(229,72,77,0.1)', borderWidth: 1, borderColor: 'rgba(229,72,77,0.4)' },
  errorText: { flex: 1, color: C.error, fontSize: 12 },
  button: { marginTop: 18, height: 52, borderRadius: 12, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: C.dark, fontSize: 16, fontWeight: '800' },
  bottomRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  bottomText: { color: C.muted, fontSize: 13 },
  bottomLink: { color: C.gold, fontSize: 13, fontWeight: '600' },
  footer: { color: '#555', fontSize: 11, textAlign: 'center', marginTop: 24 },
});
