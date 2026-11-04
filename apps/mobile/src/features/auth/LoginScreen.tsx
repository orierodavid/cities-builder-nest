import React, { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const C = {
  bg: '#080808', panel: '#121212', field: '#0B0B0B', gold: '#D4A84B',
  goldSoft: '#F1D28A', border: '#40331E', text: '#F7F3EA', muted: '#A7A095',
  danger: '#F28B82',
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
  const canSubmit = identifier.trim().length > 0 && password.length > 0 && !loading;
  const submit = async () => {
    if (!canSubmit) return;
    setError(null); setLoading(true);
    try { await onSubmit(identifier.trim(), password); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign in. Please try again.'); }
    finally { setLoading(false); }
  };
  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.brand}>
            <View style={s.logo}><MaterialCommunityIcons name="home-city-outline" size={37} color={C.gold} /></View>
            <Text style={s.wordmark}>CB NEST</Text>
            <Text style={s.kicker}>CITIES BUILDER</Text>
          </View>
          <View style={s.card}>
            <Text style={s.eyebrow}>YOUR COMMUNITY, CONNECTED</Text>
            <Text style={s.title}>Welcome home.</Text>
            <Text style={s.subtitle}>Sign in to manage your home, stay informed and access your estate services.</Text>
            <Text style={s.label}>EMAIL ADDRESS</Text>
            <View style={s.inputWrap}>
              <MaterialCommunityIcons name="email-outline" size={19} color={C.muted} />
              <TextInput accessibilityLabel="Email address" style={s.input} value={identifier} onChangeText={setIdentifier}
                placeholder="name@example.com" placeholderTextColor="#777" autoCapitalize="none"
                autoCorrect={false} keyboardType="email-address" textContentType="username" returnKeyType="next" />
            </View>
            <View style={s.passwordHead}>
              <Text style={s.label}>PASSWORD</Text>
              <Pressable onPress={() => onForgotPassword?.(identifier.trim())} hitSlop={8}><Text style={s.forgot}>Forgot password?</Text></Pressable>
            </View>
            <View style={s.inputWrap}>
              <MaterialCommunityIcons name="lock-outline" size={19} color={C.muted} />
              <TextInput accessibilityLabel="Password" style={s.input} value={password} onChangeText={setPassword}
                placeholder="Enter your password" placeholderTextColor="#777" secureTextEntry={!show}
                autoCapitalize="none" textContentType="password" onSubmitEditing={submit} returnKeyType="go" />
              <Pressable onPress={() => setShow(v => !v)} hitSlop={10}><MaterialCommunityIcons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={C.muted} /></Pressable>
            </View>
            {!!error && <View style={s.errorBox}><MaterialCommunityIcons name="alert-circle-outline" size={17} color={C.danger}/><Text style={s.error}>{error}</Text></View>}
            <View style={s.signInActions}>
              <Pressable onPress={submit} disabled={!canSubmit} style={({ pressed }) => [s.button, s.signInButton, !canSubmit && s.disabled, pressed && { opacity: .86 }]}>
                {loading ? <ActivityIndicator color="#17130B" /> : <><Text style={s.buttonText}>SIGN IN</Text><MaterialCommunityIcons name="arrow-right" size={19} color="#17130B"/></>}
              </Pressable>
            </View>
            {onCreateAccount && <Pressable onPress={onCreateAccount} style={s.contact}><Text style={s.contactText}>Need access? <Text style={s.contactGold}>Contact estate management</Text></Text></Pressable>}
          </View>
          <View style={s.security}><MaterialCommunityIcons name="shield-check-outline" size={16} color={C.gold}/><Text style={s.securityText}>SECURE ACCESS TO YOUR ESTATE</Text></View>
          <Text style={s.footer}>BUILDING YOUR FUTURE, ONE COMMUNITY AT A TIME.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export default LoginScreen;
const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg},
  scroll:{flexGrow:1,justifyContent:'center',paddingHorizontal:22,paddingVertical:32},
  brand:{alignItems:'center',marginBottom:27},
  logo:{width:76,height:76,borderRadius:24,borderWidth:1,borderColor:'#6A542B',backgroundColor:'#17130B',alignItems:'center',justifyContent:'center'},
  wordmark:{color:C.text,fontSize:27,fontWeight:'900',letterSpacing:4,marginTop:13},
  kicker:{color:C.gold,fontSize:9,fontWeight:'900',letterSpacing:3.3,marginTop:5},
  card:{width:'100%',maxWidth:450,alignSelf:'center',backgroundColor:C.panel,borderWidth:1,borderColor:C.border,borderRadius:22,padding:22},
  eyebrow:{color:C.gold,fontSize:9,fontWeight:'900',letterSpacing:1.7},
  title:{color:C.text,fontSize:30,fontWeight:'900',letterSpacing:-.8,marginTop:10},
  subtitle:{color:C.muted,fontSize:12,lineHeight:19,marginTop:7,marginBottom:19},
  label:{color:'#D9CBAE',fontSize:9,fontWeight:'900',letterSpacing:1.2,marginBottom:8},
  inputWrap:{minHeight:54,flexDirection:'row',alignItems:'center',gap:11,paddingHorizontal:13,borderRadius:12,borderWidth:1,borderColor:'#3B352B',backgroundColor:C.field,marginBottom:16},
  input:{flex:1,minWidth:0,color:C.text,fontSize:13,paddingVertical:13},
  passwordHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  forgot:{color:C.gold,fontSize:10,fontWeight:'800',marginBottom:8},
  button:{minHeight:54,borderRadius:12,backgroundColor:C.gold,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9,marginTop:5},
  buttonText:{color:'#17130B',fontSize:12,fontWeight:'900',letterSpacing:1},
  disabled:{opacity:.45},
  errorBox:{flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'#2A1715',borderRadius:10,padding:11,marginBottom:10},
  error:{flex:1,color:C.danger,fontSize:11,lineHeight:16},
  contact:{alignItems:'center',paddingTop:18},
  contactText:{color:C.muted,fontSize:11},
  contactGold:{color:C.gold,fontWeight:'800'},
  security:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,marginTop:23},
  securityText:{color:'#9A8B6B',fontSize:8,fontWeight:'900',letterSpacing:1.4},
  footer:{color:'#5F594E',fontSize:8,fontWeight:'800',letterSpacing:1.1,textAlign:'center',marginTop:24}
});
