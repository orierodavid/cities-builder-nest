import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../src/theme/theme';
import AppLogo from '../src/features/shared/AppLogo';

export default function SplashScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const logoSize = Math.round(Math.min(width * 0.34, 160));
  const pulse = useRef(new Animated.Value(0.97)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const entrance = Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 550, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]);
    entrance.start();
  }, [fade, pulse]);

  return (
    <View style={s.root}>
      <Animated.View style={[s.brand, { opacity: fade, transform: [{ scale: pulse }] }]}>
        <AppLogo size={logoSize} />
        <View style={s.rule} />
        <Text style={s.promise}>Building Smarter, Safer Communities, One Step at a Time.</Text>
      </Animated.View>
      <View style={[s.bottom, { bottom: Math.max(54, insets.bottom + 24) }]}>
        <View style={s.dot} />
        <Text style={s.loading}>PREPARING YOUR COMMUNITY</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', padding: 28 },
  brand: { alignItems: 'center' },
  rule: { width: 44, height: 2, backgroundColor: theme.gold, marginTop: 15, marginBottom: 11 },
  promise: { color: '#9A9A9A', fontSize: 11, letterSpacing: 0.2, textAlign: 'center' },
  bottom: { position: 'absolute', alignItems: 'center', gap: 10 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.gold },
  loading: { color: theme.goldSoft, fontSize: 8, fontWeight: '900', letterSpacing: 1.8 },
});
