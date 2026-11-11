import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../src/theme/theme';

export default function SplashScreen() {
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(0.92)).current;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const entrance = Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 850, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
    ]);
    entrance.start();
  }, [fade, pulse]);
  return (
    <View style={s.root}>
      <View style={s.glowTop} />
      <Animated.View style={[s.brand, { opacity: fade, transform: [{ scale: pulse }] }]}>
        <Image source={require('../IMG_9873.png')} style={s.logo} resizeMode="contain" accessibilityLabel="CB Nest Ltd logo" />
        <Text style={s.name}>CB NEST LTD</Text>
        <Text style={s.tag}>...BUILDING YOUR FUTURE</Text>
        <View style={s.rule} />
        <Text style={s.promise}>A better way to live, manage and belong.</Text>
      </Animated.View>
      <View style={[s.bottom, { bottom: Math.max(54, insets.bottom + 24) }]}><View style={s.dot} /><Text style={s.loading}>PREPARING YOUR COMMUNITY</Text></View>
    </View>
  );
}
const s = StyleSheet.create({
  root:{flex:1,backgroundColor:theme.bg,alignItems:'center',justifyContent:'center',padding:28,overflow:'hidden'},
  glowTop:{position:'absolute',width:310,height:310,borderRadius:155,borderWidth:1,borderColor:theme.border,top:-190,alignSelf:'center'},
  brand:{alignItems:'center'},
  logo:{width:260,height:130,maxWidth:'100%'},
  name:{color:theme.text,fontSize:31,fontWeight:'900',letterSpacing:5,marginTop:22},
  tag:{color:theme.darkBrown,fontSize:10,fontWeight:'900',letterSpacing:4,marginTop:7},
  rule:{width:54,height:2,backgroundColor:theme.gold,marginTop:24,marginBottom:17},
  promise:{color:theme.muted,fontSize:12,letterSpacing:.3,textAlign:'center'},
  bottom:{position:'absolute',bottom:54,alignItems:'center',gap:10},
  dot:{width:6,height:6,borderRadius:3,backgroundColor:'#D4A84B'},
  loading:{color:theme.olive,fontSize:8,fontWeight:'900',letterSpacing:2.1}
});
