import React,{useEffect,useState} from "react";
import {useRouter} from "expo-router";
import {ActivityIndicator,ScrollView,Text,TouchableOpacity,View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import ResidentUtilityHub from "../../components/ResidentUtilityHub";
import {supabase} from "../../lib/supabase";
import {theme} from "../../src/theme/theme";
export default function UtilitiesRoute(){
 const router=useRouter();const [estateId,setEstateId]=useState("");const [loading,setLoading]=useState(true);const [error,setError]=useState("");
 useEffect(()=>{let active=true;(async()=>{try{const {data:{user},error:ae}=await supabase.auth.getUser();if(ae||!user)throw new Error("Please sign in again.");const {data,error:qe}=await supabase.from("resident_units").select("estate_id").eq("resident_user_id",user.id).is("end_date",null).order("start_date",{ascending:false}).limit(2);if(qe)throw qe;const ids=[...new Set((data??[]).map(x=>x.estate_id).filter(Boolean))];if(ids.length!==1)throw new Error(ids.length?"Multiple active estate assignments found.":"No active apartment assignment found.");if(active)setEstateId(ids[0]);}catch(e){if(active)setError(e instanceof Error?e.message:"Utilities could not be opened.");}finally{if(active)setLoading(false)}})();return()=>{active=false}},[]);
 return <SafeAreaView style={{flex:1,backgroundColor:theme.bg}} edges={["top"]}><ScrollView contentContainerStyle={{padding:16,paddingBottom:110}} keyboardShouldPersistTaps="handled"><TouchableOpacity onPress={()=>router.replace("/(resident)" as never)} style={{paddingVertical:10}}><Text style={{color:theme.gold,fontWeight:"800"}}>‹ BACK</Text></TouchableOpacity>{loading?<View style={{minHeight:200,alignItems:"center",justifyContent:"center"}}><ActivityIndicator color={theme.gold}/><Text style={{color:theme.muted,marginTop:10}}>Loading your estate details…</Text></View>:error?<View style={{padding:18,backgroundColor:theme.card,borderRadius:14}}><Text style={{color:"#F2A5A5"}}>{error}</Text></View>:<ResidentUtilityHub estateId={estateId} onBack={()=>router.replace("/(resident)" as never)}/>}</ScrollView></SafeAreaView>
}
