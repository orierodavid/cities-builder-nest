import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

type Props = { size?: number; compact?: boolean };

export default function BrandMark({ size = 96, compact = false }: Props) {
  if (compact) {
    return (
      <View style={s.compact}>
        <Image source={require('../../../IMG_9873.png')} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel="CB Nest logo" />
        <View style={s.compactText}>
          <Text style={s.name}>CB NEST</Text>
          <Text style={s.tagline}>ESTATE MANAGEMENT</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={s.stacked}>
      <Image source={require('../../../IMG_9873.png')} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel="CB Nest logo" />
      <Text style={s.name}>CB NEST</Text>
      <Text style={s.tagline}>ESTATE MANAGEMENT</Text>
    </View>
  );
}

const s = StyleSheet.create({
  stacked: { alignItems: 'center' },
  name: { color: '#F7F3EA', fontSize: 28, fontWeight: '900', letterSpacing: 3.1, marginTop: 8 },
  tagline: { color: '#D4A84B', fontSize: 9, fontWeight: '900', letterSpacing: 3.2, marginTop: 7 },
  compact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  compactText: { alignItems: 'flex-start' },
});
