import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../../theme/theme';
import { supabase } from '../../../lib/supabase';
import { readDashboardCache, writeDashboardCache, clearDashboardCache } from '../../lib/dashboard-cache';
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
export type Role = 'resident' | 'security';
type Tile = {label:string;icon:IconName;route:string};
type Action = {label:string;icon:IconName;route:string;variant:'gold'|'light'};
type RoleConfig = {greeting:string;badge?:string;tagline?:string;welcomeTitle?:string;welcomeText?:string;actions?:Action[];tiles:Tile[];columns:2|3;footer?:Tile};
const CONFIG:Record<Role,RoleConfig>={
resident:{greeting:'Hello,',tagline:'Building Your Future, One Step at a Time.',welcomeTitle:'Welcome to CB Nest',welcomeText:'A safer, smarter and more convenient community.',columns:3,tiles:[
{label:'My Property',icon:'home-outline',route:'/property'},{label:'Visitor Management',icon:'account-multiple-outline',route:'/visitors'},{label:'Generate Access Code',icon:'qrcode',route:'/access-code'},{label:'Create & Manage Events',icon:'calendar-star',route:'/events'},{label:'Service Charges',icon:'cash-multiple',route:'/service-charges'},{label:'Utilities',icon:'lightning-bolt-circle',route:'/utilities'},{label:'Make Payment',icon:'credit-card-outline',route:'/service-charges'},{label:'Payment History',icon:'file-document-outline',route:'/payments'},{label:'Save for Rent',icon:'wallet-outline',route:'/save-for-rent'},{label:'Maintenance Requests',icon:'tools',route:'/maintain'},{label:'Estate Announcements',icon:'bullhorn-outline',route:'/announcements'}],footer:{label:'My Account',icon:'account-circle-outline',route:'/profile'}},
security:{greeting:'Good Morning,',badge:'Security',columns:2,actions:[{label:'Scan Visitor Code',icon:'qrcode-scan',route:'/scan',variant:'gold'},{label:'Enter Access Code',icon:'keyboard-outline',route:'/enter-code',variant:'light'}],tiles:[{label:'Event Guest Verification',icon:'account-check-outline',route:'/event-guests'},{label:'Vehicle Registration',icon:'car-outline',route:'/vehicles'},{label:'Visitor Entry Records',icon:'login',route:'/entry-records'},{label:'Visitor Exit Records',icon:'logout',route:'/exit-records'},{label:'Incident Reporting',icon:'shield-alert-outline',route:'/incidents'},{label:'Emergency Alerts',icon:'alarm-light-outline',route:'/emergency'}],footer:{label:'Shift Handover',icon:'clipboard-text-outline',route:'/handover'}}}
const C={bg:theme.bg,card:theme.card,cardAlt:'#181818',gold:theme.gold,goldBorder:theme.border,text:theme.text,muted:theme.muted,dark:'#0A0A0A'};
type Props={role:Role;name?:string;unit?:string;hasUnread?:boolean};
export function RoleLanding({role,name:providedName,unit:providedUnit,hasUnread}:Props){
 const router=useRouter(); const cfg=CONFIG[role]; const [signingOut,setSigningOut]=useState(false);
 const [residentName,setResidentName]=useState(providedName||''); const [residentUnit,setResidentUnit]=useState(providedUnit||''); const [profileLoading,setProfileLoading]=useState(role==='resident'); const [profileError,setProfileError]=useState('');
 const go=(route:string)=>router.push(route as never);
 const loadResidentDetails=async()=>{
  if(role!=='resident')return;
  setProfileError('');
  try{
   // The cached session is sufficient for the profile query; avoid an extra
   // auth network round trip on every dashboard mount.
   const {data:{session},error:sessionError}=await supabase.auth.getSession();
   if(sessionError)throw sessionError;
   const user=session?.user;
   if(!user)throw new Error('Your session has expired. Please sign in again.');
   const cached=await readDashboardCache<{name?:string;unit?:string}>('resident',user.id);
   if(cached){
    setResidentName(cached.name||providedName||'');
    setResidentUnit(cached.unit||providedUnit||'');
    setProfileLoading(false);
   }
   const {data:profile,error:profileQueryError}=await supabase.from('users')
    .select('full_name,home_number,street_name').eq('id',user.id).maybeSingle();
   if(profileQueryError)throw profileQueryError;
   const homeNumber=String(profile?.home_number||'').trim();
   const streetName=String(profile?.street_name||'').trim();
   if(homeNumber||streetName){
    setResidentName(profile?.full_name?.trim()||providedName||String(user.user_metadata?.full_name||user.user_metadata?.name||'').trim());
    const unitLabel=[homeNumber,streetName].filter(Boolean).join(' · ')||providedUnit||'';
    setResidentUnit(unitLabel);
    await writeDashboardCache('resident',user.id,{name:profile?.full_name?.trim()||providedName||String(user.user_metadata?.full_name||user.user_metadata?.name||'').trim(),unit:unitLabel});
    return;
   }
   // Legacy residents without self-reported home details retain their existing
   // building/unit assignment display while management completes their profile.
   const {data:rows,error:assignmentError}=await supabase.from('resident_units')
    .select('unit_id,start_date,estate_id').eq('resident_user_id',user.id).is('end_date',null)
    .order('start_date',{ascending:false}).limit(1);
   if(assignmentError)throw assignmentError;
   const row=rows?.[0];
   let unitLabel='';
   if(row){
    const {data:unit,error:unitError}=await supabase.from('units').select('unit_code,building_id,estate_id').eq('id',row.unit_id).maybeSingle();
    if(unitError)throw unitError;
    if(unit){
     const [{data:building,error:buildingError},{data:estate,error:estateError}]=await Promise.all([
      supabase.from('buildings').select('name').eq('id',unit.building_id).maybeSingle(),
      supabase.from('estates').select('name').eq('id',row.estate_id||unit.estate_id).maybeSingle()
     ]);
     if(buildingError)throw buildingError;
     if(estateError)throw estateError;
     unitLabel=[estate?.name,building?.name,unit.unit_code?('Unit '+unit.unit_code):null].filter(Boolean).join(' · ');
    }
   }
   setResidentName(profile?.full_name?.trim()||providedName||String(user.user_metadata?.full_name||user.user_metadata?.name||'').trim());
   setResidentUnit(unitLabel||providedUnit||'');
   await writeDashboardCache('resident',user.id,{name:profile?.full_name?.trim()||providedName||String(user.user_metadata?.full_name||user.user_metadata?.name||'').trim(),unit:unitLabel||providedUnit||''});
  }catch(e){setProfileError(e instanceof Error?e.message:'Resident details could not be loaded.');}
  finally{setProfileLoading(false);}
 };
 useEffect(()=>{void loadResidentDetails();},[role,providedName]);
 const signOut=async()=>{if(signingOut)return;setSigningOut(true);try{const {data:{user}}=await supabase.auth.getUser();if(user)await clearDashboardCache(role,user.id);const {error}=await supabase.auth.signOut();if(error)throw error;router.replace('/' as never);}catch(error){Alert.alert('Could not log out','Please try again.');}finally{setSigningOut(false);}};
 const tileBasis=cfg.columns===3?'31%':'48%';
 if(role==='resident'&&profileLoading&&!residentName&&!residentUnit){
  return <SafeAreaView style={s.safe} edges={['top']}><View style={s.skeletonPage}>
   <View style={s.skeletonBrand}><View style={s.skeletonLogo}/><View style={s.skeletonBrandLine}/></View>
   <View style={s.skeletonProfile}><View style={s.skeletonAvatar}/><View style={{flex:1,gap:8}}><View style={[s.skeletonLine,{width:'34%'}]}/><View style={[s.skeletonLine,{width:'68%',height:16}]}/><View style={[s.skeletonLine,{width:'48%'}]}/></View></View>
   <View style={s.skeletonBanner}><View style={[s.skeletonLine,{width:'58%',height:19}]}/><View style={[s.skeletonLine,{width:'82%'}]}/></View>
   <View style={s.skeletonGrid}>{Array.from({length:8}).map((_,i)=><View key={i} style={s.skeletonTile}><View style={s.skeletonIcon}/><View style={[s.skeletonLine,{width:'78%'}]}/></View>)}</View>
  </View></SafeAreaView>;
 }
 return <SafeAreaView style={s.safe} edges={['top']}><ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
 <View style={s.brandRow}><MaterialCommunityIcons name="home-city" size={26} color={C.gold}/><Text style={s.brand}>CB NEST</Text></View>
 {cfg.tagline?<Text style={s.tagline}>{cfg.tagline}</Text>:null}{cfg.badge?<View style={s.badge}><Text style={s.badgeText}>{cfg.badge}</Text></View>:null}
 <View style={s.greetRow}><View style={s.avatar}><MaterialCommunityIcons name="account" size={28} color={C.gold}/></View><View style={{flex:1}}><Text style={s.greet}>{cfg.greeting}</Text>{role==='resident'&&profileLoading?<ActivityIndicator color={C.gold} size="small"/>:null}{(residentName||providedName)?<Text style={s.name}>{residentName||providedName}</Text>:role==='resident'&&!profileLoading?<Text style={s.name}>Name unavailable</Text>:null}{(residentUnit||providedUnit)?<Text style={s.unit}>{residentUnit||providedUnit}</Text>:role==='resident'&&!profileLoading?<Text style={s.unit}>Apartment assignment not found</Text>:null}{!!profileError&&<Pressable onPress={()=>void loadResidentDetails()}><Text style={s.error}>Resident details could not be loaded. Tap to retry.</Text></Pressable>}</View><Pressable onPress={()=>go('/notifications')} hitSlop={10}><MaterialCommunityIcons name="bell-outline" size={24} color={C.text}/>{hasUnread?<View style={s.dot}/>:null}</Pressable></View>
 {cfg.welcomeTitle?<View style={s.banner}><Text style={s.bannerTitle}>{cfg.welcomeTitle}</Text><Text style={s.bannerText}>{cfg.welcomeText}</Text></View>:null}
 {cfg.actions?.map(a=><Pressable key={a.label} onPress={()=>go(a.route)} style={({pressed})=>[s.action,a.variant==='gold'?s.actionGold:s.actionLight,pressed&&{opacity:0.85}]}><MaterialCommunityIcons name={a.icon} size={24} color={C.dark}/><Text style={s.actionText}>{a.label}</Text><MaterialCommunityIcons name="chevron-right" size={22} color={C.dark}/></Pressable>)}
 <View style={s.grid}>{cfg.tiles.map(tile=><Pressable key={tile.label} onPress={()=>go(tile.route)} style={({pressed})=>[s.tile,{width:tileBasis},pressed&&{opacity:0.8}]}><MaterialCommunityIcons name={tile.icon} size={26} color={C.gold}/><Text style={s.tileText} numberOfLines={2}>{tile.label}</Text></Pressable>)}</View>
 {cfg.footer?<Pressable onPress={()=>go(cfg.footer!.route)} style={({pressed})=>[s.footer,pressed&&{opacity:0.8}]}><MaterialCommunityIcons name={cfg.footer.icon} size={20} color={C.gold}/><Text style={s.footerText}>{cfg.footer.label}</Text></Pressable>:null}
 <Pressable accessibilityRole="button" accessibilityLabel="Log out of CB Nest" disabled={signingOut} onPress={signOut} style={({pressed})=>[s.signOut,pressed&&{opacity:0.8},signingOut&&{opacity:0.65}]}>{signingOut?<ActivityIndicator color={C.gold}/>:<MaterialCommunityIcons name="logout" size={19} color={C.gold}/>}<Text style={s.signOutText}>{signingOut?'Signing out…':'Log Out'}</Text></Pressable>
 </ScrollView></SafeAreaView>
}
export default RoleLanding;
const s=StyleSheet.create({safe:{flex:1,backgroundColor:C.bg},skeletonPage:{flex:1,padding:16,paddingTop:28},skeletonBrand:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10,marginBottom:28},skeletonLogo:{width:27,height:27,borderRadius:8,backgroundColor:'#29251B'},skeletonBrandLine:{width:112,height:17,borderRadius:8,backgroundColor:'#29251B'},skeletonProfile:{flexDirection:'row',alignItems:'center',gap:12,marginBottom:22},skeletonAvatar:{width:48,height:48,borderRadius:24,backgroundColor:'#252525',borderWidth:1,borderColor:C.goldBorder},skeletonLine:{height:10,borderRadius:6,backgroundColor:'#252525'},skeletonBanner:{height:128,borderRadius:16,backgroundColor:C.cardAlt,borderWidth:1,borderColor:C.goldBorder,padding:18,justifyContent:'center',gap:12,marginBottom:16},skeletonGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:10},skeletonTile:{width:'48%',height:88,borderRadius:14,backgroundColor:C.card,borderWidth:1,borderColor:C.goldBorder,alignItems:'center',justifyContent:'center',gap:12},skeletonIcon:{width:26,height:26,borderRadius:8,backgroundColor:'#29251B'},scroll:{padding:16,paddingBottom:120},brandRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},brand:{color:C.gold,fontSize:22,fontWeight:'800',letterSpacing:1},tagline:{color:C.muted,fontSize:11,textAlign:'center',marginTop:4},badge:{alignSelf:'center',marginTop:8,paddingHorizontal:14,paddingVertical:3,borderRadius:999,borderWidth:1,borderColor:C.gold},badgeText:{color:C.gold,fontSize:11,fontWeight:'600'},greetRow:{flexDirection:'row',alignItems:'center',gap:12,marginTop:18},avatar:{width:48,height:48,borderRadius:24,borderWidth:1.5,borderColor:C.gold,backgroundColor:C.card,alignItems:'center',justifyContent:'center'},greet:{color:C.muted,fontSize:12},name:{color:C.text,fontSize:16,fontWeight:'700'},unit:{color:C.muted,fontSize:11},error:{color:'#FF9292',fontSize:10,marginTop:4},dot:{position:'absolute',top:-2,right:-2,width:8,height:8,borderRadius:4,backgroundColor:'#E5484D'},banner:{marginTop:16,padding:18,minHeight:130,justifyContent:'flex-end',borderRadius:16,backgroundColor:C.cardAlt,borderWidth:1,borderColor:C.goldBorder},bannerTitle:{color:C.text,fontSize:20,fontWeight:'800'},bannerText:{color:C.muted,fontSize:12,marginTop:4},action:{flexDirection:'row',alignItems:'center',gap:12,padding:16,borderRadius:12,marginTop:14},actionGold:{backgroundColor:C.gold},actionLight:{backgroundColor:'#171717',borderWidth:1,borderColor:C.goldBorder},actionText:{flex:1,color:C.gold,fontSize:15,fontWeight:'700'},grid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:10,marginTop:16},tile:{minHeight:88,paddingVertical:14,paddingHorizontal:8,borderRadius:14,backgroundColor:C.card,borderWidth:1,borderColor:C.goldBorder,alignItems:'center',justifyContent:'center',gap:8},tileText:{color:C.text,fontSize:11,fontWeight:'600',textAlign:'center'},footer:{marginTop:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,paddingVertical:12,borderRadius:12,backgroundColor:C.card,borderWidth:1,borderColor:C.goldBorder},footerText:{color:C.text,fontSize:13,fontWeight:'600'},signOut:{marginTop:12,marginBottom:18,minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9,borderRadius:12,borderWidth:1,borderColor:C.goldBorder,backgroundColor:C.card,paddingVertical:12},signOutText:{color:C.gold,fontSize:13,fontWeight:'700'}});
