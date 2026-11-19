import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../src/theme/theme';
import AppLogo from '../src/features/shared/AppLogo';

export default function SplashScreen() {
  const insets = useSafeAreaInsets();
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
        <AppLogo size={38} />
        <View style={s.rule} />
        <Text style={s.promise}>A better way to live, manage and belong.</Text>
      </Animated.View>
      <View style={[s.bottom, { bottom: Math.max(54, insets.bottom + 24) }]}><View style={s.dot} /><Text style={s.loading}>PREPARING YOUR COMMUNITY</Text></View>
    </View>
  );
}
const s = StyleSheet.create({
  root:{flex:1,backgroundColor:'#050505',alignItems:'center',justifyContent:'center',padding:28},
  brand:{alignItems:'center'},
  rule:{width:44,height:2,backgroundColor:theme.gold,marginTop:15,marginBottom:11},
  promise:{color:theme.muted,fontSize:11,letterSpacing:.2,textAlign:'center'},
  bottom:{position:'absolute',alignItems:'center',gap:10},
  dot:{width:5,height:5,borderRadius:3,backgroundColor:theme.gold},
  loading:{color:theme.goldSoft,fontSize:8,fontWeight:'900',letterSpacing:1.8}
});
