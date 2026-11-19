import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

type AppLogoProps = { size?: number; compact?: boolean };

export default function AppLogo({ size = 96, compact = false }: AppLogoProps) {
  if (compact) {
    return (
      <View style={styles.compact}>
        <Image source={require('../../../assets/cb-nest-logo.png')} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel="CB Nest logo" />
        <View style={styles.compactText}>
          <Text style={styles.name}>CB NEST</Text>
          <Text style={styles.tagline}>ESTATE MANAGEMENT</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.stacked}>
      <Image source={require('../../../assets/cb-nest-logo.png')} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel="CB Nest logo" />
      <Text style={styles.name}>CB NEST</Text>
      <Text style={styles.tagline}>ESTATE MANAGEMENT</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stacked: { alignItems: 'center' },
  name: { color: '#F7F3EA', fontSize: 28, fontWeight: '900', letterSpacing: 3.1, marginTop: 8 },
  tagline: { color: '#D4A84B', fontSize: 9, fontWeight: '900', letterSpacing: 3.2, marginTop: 7 },
  compact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  compactText: { alignItems: 'flex-start' },
});
