import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function SplashScreen() {
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
        <View style={s.mark}><MaterialCommunityIcons name="home-city-outline" size={43} color="#D4A84B" /></View>
        <Text style={s.name}>CB NEST</Text>
        <Text style={s.tag}>CITIES BUILDER</Text>
        <View style={s.rule} />
        <Text style={s.promise}>A better way to live, manage and belong.</Text>
      </Animated.View>
      <View style={s.bottom}><View style={s.dot} /><Text style={s.loading}>PREPARING YOUR COMMUNITY</Text></View>
    </View>
  );
}
const s = StyleSheet.create({
  root:{flex:1,backgroundColor:'#080808',alignItems:'center',justifyContent:'center',padding:28,overflow:'hidden'},
  glowTop:{position:'absolute',width:310,height:310,borderRadius:155,borderWidth:1,borderColor:'#3B2E16',top:-190,alignSelf:'center'},
  brand:{alignItems:'center'},
  mark:{width:100,height:100,borderRadius:30,borderWidth:1.5,borderColor:'#80652F',backgroundColor:'#17130B',alignItems:'center',justifyContent:'center',shadowColor:'#D4A84B',shadowOpacity:.18,shadowRadius:24,elevation:8},
  name:{color:'#F5E8C9',fontSize:31,fontWeight:'900',letterSpacing:5,marginTop:22},
  tag:{color:'#D4A84B',fontSize:10,fontWeight:'900',letterSpacing:4,marginTop:7},
  rule:{width:54,height:2,backgroundColor:'#D4A84B',marginTop:24,marginBottom:17},
  promise:{color:'#B9B1A0',fontSize:12,letterSpacing:.3,textAlign:'center'},
  bottom:{position:'absolute',bottom:54,alignItems:'center',gap:10},
  dot:{width:6,height:6,borderRadius:3,backgroundColor:'#D4A84B'},
  loading:{color:'#82765F',fontSize:8,fontWeight:'900',letterSpacing:2.1}
});
