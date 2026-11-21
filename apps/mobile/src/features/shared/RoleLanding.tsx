import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../../theme/theme';
import AppLogo from './AppLogo';
import { supabase } from '../../../lib/supabase';
import { readDashboardCache, writeDashboardCache, clearDashboardCache } from '../../lib/dashboard-cache';
import { subscribeConnectionRestored } from '../../lib/connection-events';
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
export type Role = 'resident' | 'security';
type Tile = {label:string;icon:IconName;route:string};
type Action = {label:string;icon:IconName;route:string;variant:'gold'|'light'};
type RoleConfig = {greeting:string;badge?:string;tagline?:string;welcomeTitle?:string;welcomeText?:string;actions?:Action[];tiles:Tile[];columns:2|3;footer?:Tile};
const CONFIG:Record<Role,RoleConfig>={
resident:{greeting:'Hello,',tagline:'Building Your Future, One Step at a Time.',welcomeTitle:'Welcome to CB Nest',welcomeText:'A safer, smarter and more convenient community.',columns:3,tiles:[
{label:'Wallet',icon:'wallet-outline',route:'/(resident)/wallet'},{label:'Visitor Management',icon:'account-multiple-outline',route:'/visitors'},{label:'Create & Manage Events',icon:'calendar-star',route:'/events'},{label:'Service Charges',icon:'cash-multiple',route:'/service-charges'},{label:'Electricity & Utilities',icon:'lightning-bolt-circle',route:'/utilities'},{label:'Support',icon:'headset',route:'/(resident)/support'},{label:'Payment History',icon:'file-document-outline',route:'/payments'},{label:'Save for Rent',icon:'wallet-outline',route:'/save-for-rent'},{label:'Maintenance Requests',icon:'tools',route:'/maintain'},{label:'Estate Announcements',icon:'bullhorn-outline',route:'/announcements'}],footer:{label:'My Account',icon:'account-circle-outline',route:'/profile'}},
security:{greeting:'Good Morning,',badge:'Security',columns:2,actions:[{label:'Scan Visitor Code',icon:'qrcode-scan',route:'/scan',variant:'gold'},{label:'Enter Access Code',icon:'keyboard-outline',route:'/enter-code',variant:'light'}],tiles:[{label:'Event Guest Verification',icon:'account-check-outline',route:'/event-guests'},{label:'Vehicle Registration',icon:'car-outline',route:'/vehicles'},{label:'Visitor Entry Records',icon:'login',route:'/entry-records'},{label:'Visitor Exit Records',icon:'logout',route:'/exit-records'},{label:'Incident Reporting',icon:'shield-alert-outline',route:'/incidents'},{label:'Emergency Alerts',icon:'alarm-light-outline',route:'/emergency'}],footer:{label:'Shift Handover',icon:'clipboard-text-outline',route:'/handover'}}}
const C={bg:theme.bg,card:theme.card,cardAlt:'#181818',gold:theme.gold,goldBorder:theme.border,text:theme.text,muted:theme.muted,dark:'#0A0A0A'};
type Props={role:Role;name?:string;unit?:string;hasUnread?:boolean};
export function RoleLanding({role,name:providedName,unit:providedUnit,hasUnread}:Props){
 const router=useRouter(); const cfg=CONFIG[role]; const [signingOut,setSigningOut]=useState(false);
 const { width: windowWidth } = useWindowDimensions();
 const carouselCardWidth = Math.max(240, windowWidth - 56);
 const carouselRef = useRef<React.ElementRef<typeof ScrollView>>(null);
 const [carouselIndex, setCarouselIndex] = useState(0);
 const imageCarouselRef = useRef<React.ElementRef<typeof ScrollView>>(null);
 const imageCarouselCardWidth = Math.max(220, Math.min(300, windowWidth * 0.76));
 const [imageCarouselIndex, setImageCarouselIndex] = useState(0);
 const [walletBalanceKobo,setWalletBalanceKobo]=useState<number|null>(null); const [walletBalanceLoading,setWalletBalanceLoading]=useState(role==='resident');
 const [residentName,setResidentName]=useState(providedName||''); const [residentUnit,setResidentUnit]=useState(providedUnit||''); const [profileLoading,setProfileLoading]=useState(role==='resident'); const [profileError,setProfileError]=useState('');
 const go=(route:string)=>router.push((role==='resident' && (route==='/wallet'||route==='/support') ? `/(resident)${route}` : route) as never);
 const loadWalletBalance=async()=>{
  if(role!=='resident')return;
  setWalletBalanceLoading(true);
  try{
   const {data:{session},error:sessionError}=await supabase.auth.getSession();
   if(sessionError)throw sessionError;
   if(!session?.user)throw new Error('Session unavailable');
   const {data,error}=await supabase.rpc('get_my_wallet_balance');
   if(error)throw error;
   const wallet=Array.isArray(data)?data[0]:null;
   setWalletBalanceKobo(wallet?Number(wallet.balance_kobo):null);
  }catch{
   setWalletBalanceKobo(null);
  }finally{
   setWalletBalanceLoading(false);
  }
 };
 useEffect(()=>{if(role==='resident')void loadWalletBalance();},[role]);
 useEffect(()=>{
  if(role!=='resident')return;
  const timer=setInterval(()=>{
   setCarouselIndex(current=>(current+1)%2);
  },5000);
  return ()=>clearInterval(timer);
 },[role]);
 useEffect(()=>{
  if(role==='resident')carouselRef.current?.scrollTo({x:carouselIndex*(carouselCardWidth+10),animated:true});
 },[role,carouselIndex,carouselCardWidth]);
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
    .select('full_name,home_number,house_number,street_name').eq('id',user.id).maybeSingle();
   if(profileQueryError)throw profileQueryError;
   const homeNumber=String(profile?.home_number||'').trim();
    const houseNumber=String(profile?.house_number||'').trim();
   const streetName=String(profile?.street_name||'').trim();
   if(homeNumber||houseNumber||streetName){
    setResidentName(profile?.full_name?.trim()||providedName||String(user.user_metadata?.full_name||user.user_metadata?.name||'').trim());
    const unitLabel=[homeNumber,houseNumber,streetName].filter(Boolean).join(' · ')||providedUnit||'';
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
 useEffect(()=>{
  let active=true;
  const timeout=setTimeout(()=>{if(active&&role==='resident'){setProfileError('Connection is taking longer than expected. Check your internet connection and retry.');setProfileLoading(false);}},12000);
  const unsubscribe=subscribeConnectionRestored(()=>{if(role==='resident')void loadResidentDetails();});
  void loadResidentDetails().finally(()=>clearTimeout(timeout));
  return ()=>{active=false;clearTimeout(timeout);unsubscribe();};
 },[role,providedName]);
 const signOut=async()=>{if(signingOut)return;setSigningOut(true);try{const {data:{user}}=await supabase.auth.getUser();if(user)await clearDashboardCache(role,user.id);const {error}=await supabase.auth.signOut();if(error)throw error;router.replace('/' as never);}catch(error){Alert.alert('Could not log out','Please try again.');}finally{setSigningOut(false);}};
 const tileBasis=cfg.columns===3?'31%':'48%';
 if(role==='resident'&&profileLoading&&!residentName&&!residentUnit){
  return <SafeAreaView style={s.safe} edges={['top']}><ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
   <AppLogo size={34} compact />
   <View style={s.skeletonTagline}/>
   <View style={s.greetRow}><View style={s.avatar}><View style={s.skeletonAvatarInner}/></View><View style={{flex:1,gap:7}}><View style={[s.skeletonLine,{width:'22%'}]}/><View style={[s.skeletonLine,{width:'58%',height:16}]}/><View style={[s.skeletonLine,{width:'43%'}]}/></View><MaterialCommunityIcons name="bell-outline" size={24} color={C.text}/></View>
   {role==='resident'?<View style={s.walletCard}><Text style={s.walletEyebrow}>WALLET BALANCE</Text><View style={s.walletAmountRow}><View style={[s.skeletonLine,{width:'48%',height:22}]}/><View style={[s.skeletonLine,{width:72,height:32}]}/></View></View>:null}
   <View style={s.carouselSkeleton}><View style={[s.skeletonLine,{width:'45%'}]}/><View style={[s.skeletonLine,{width:'78%',marginTop:9}]}/></View>
   <View style={s.grid}>{cfg.tiles.map((tile)=><View key={tile.label} style={[s.tile,{width:tileBasis}]}><MaterialCommunityIcons name={tile.icon} size={26} color={C.gold}/><View style={[s.skeletonTileLabel,{width:'82%'}]}/></View>)}</View>
   {cfg.footer?<View style={s.footer}><MaterialCommunityIcons name={cfg.footer.icon} size={20} color={C.gold}/><View style={[s.skeletonTileLabel,{width:88}]}/></View>:null}
   <View style={s.signOut}><MaterialCommunityIcons name="logout" size={19} color={C.gold}/><View style={[s.skeletonTileLabel,{width:58}]}/></View>
  </ScrollView></SafeAreaView>;
 }
 return <SafeAreaView style={s.safe} edges={['top']}><ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
 <AppLogo size={34} compact />
 {cfg.tagline?<Text style={s.tagline}>{cfg.tagline}</Text>:null}{cfg.badge?<View style={s.badge}><Text style={s.badgeText}>{cfg.badge}</Text></View>:null}
 <View style={s.greetRow}><View style={s.avatar}><MaterialCommunityIcons name="account" size={28} color={C.gold}/></View><View style={{flex:1}}><Text style={s.greet}>{cfg.greeting}</Text>{role==='resident'&&profileLoading?<ActivityIndicator color={C.gold} size="small"/>:null}{(residentName||providedName)?<Text style={s.name}>{residentName||providedName}</Text>:role==='resident'&&!profileLoading?<Text style={s.name}>Name unavailable</Text>:null}{(residentUnit||providedUnit)?<Text style={s.unit}>{residentUnit||providedUnit}</Text>:role==='resident'&&!profileLoading?<Text style={s.unit}>Apartment assignment not found</Text>:null}{!!profileError&&<Pressable onPress={()=>void loadResidentDetails()}><Text style={s.error}>{profileError.includes('Connection is taking longer')?profileError:'Resident details could not be loaded. Tap to retry.'}</Text></Pressable>}</View><Pressable onPress={()=>go('/notifications')} hitSlop={10}><MaterialCommunityIcons name="bell-outline" size={24} color={C.text}/>{hasUnread?<View style={s.dot}/>:null}</Pressable></View>
 {role==='resident'?<View style={s.walletCard}>
  <Text style={s.walletEyebrow}>WALLET BALANCE</Text>
  <View style={s.walletAmountRow}>
   <Text style={s.walletAmount}>{walletBalanceLoading?'Loading balance…':walletBalanceKobo===null?'Wallet not activated':`₦${(walletBalanceKobo/100).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2})}`}</Text>
   <Pressable onPress={()=>go('/wallet')} accessibilityRole="button" accessibilityLabel="Top up wallet" style={({pressed})=>[s.topUpButton,pressed&&{opacity:0.82}]}>
    <MaterialCommunityIcons name="plus" size={16} color={C.dark}/><Text style={s.topUpText}>Top Up</Text>
   </Pressable>
  </View>
  <Pressable onPress={()=>go('/wallet')} style={s.walletFooter} accessibilityRole="button" accessibilityLabel="View wallet and transactions"><Text style={s.walletHint}>View wallet and transactions</Text><MaterialCommunityIcons name="chevron-right" size={18} color={C.gold}/></Pressable>
 </View>:null}
 {role==='resident'?<View style={s.carouselWrap}>
  <ScrollView ref={carouselRef} horizontal pagingEnabled decelerationRate="fast" snapToInterval={carouselCardWidth+10} onMomentumScrollEnd={event=>setCarouselIndex(Math.max(0,Math.min(1,Math.round(event.nativeEvent.contentOffset.x/(carouselCardWidth+10)))))} showsHorizontalScrollIndicator={false} contentContainerStyle={s.carouselContent}>
   <View style={[s.carouselCard,{width:carouselCardWidth}]}>
    <Text style={s.bannerEyebrow}>COMMUNITY SPOTLIGHT</Text>
    <Text style={s.carouselTitle}>A safer, smarter and more connected community.</Text>
    <Text style={s.carouselSubtext}>Welcome to CB Nest.</Text>
   </View>
   <View style={[s.carouselCard,s.carouselCardSecondary,{width:carouselCardWidth}]}>
    <Text style={s.bannerEyebrow}>PROMOTE YOUR BUSINESS</Text>
    <Text style={s.carouselTitle}>Advertise with CB Nest</Text>
    <Text style={s.carouselSubtext}>Contact our team to discuss availability, pricing and duration.</Text>
   </View>
  </ScrollView>
  <View style={s.carouselDots}><View style={carouselIndex===0?s.carouselDotActive:s.carouselDot}/><View style={carouselIndex===1?s.carouselDotActive:s.carouselDot}/></View>
  <View style={s.imageCarouselSection}>
   <View style={s.imageCarouselHeading}><Text style={s.imageCarouselHeadingText}>AROUND YOUR COMMUNITY</Text><Text style={s.imageCarouselHint}>Community highlights and updates</Text></View>
   <ScrollView ref={imageCarouselRef} horizontal pagingEnabled decelerationRate="fast" snapToInterval={imageCarouselCardWidth+10} onMomentumScrollEnd={event=>setImageCarouselIndex(Math.max(0,Math.min(2,Math.round(event.nativeEvent.contentOffset.x/(imageCarouselCardWidth+10)))))} showsHorizontalScrollIndicator={false} contentContainerStyle={s.carouselContent}>
    <View style={[s.imageCarouselCard,{width:imageCarouselCardWidth}]}><View style={s.imagePlaceholder}><MaterialCommunityIcons name="image-outline" size={30} color={C.gold}/><Text style={s.imagePlaceholderText}>Community image</Text></View><Text style={s.imageCarouselTitle}>Life in your community</Text><Text style={s.imageCarouselCaption}>A place to share what makes your estate special.</Text></View>
    <View style={[s.imageCarouselCard,{width:imageCarouselCardWidth}]}><View style={s.imagePlaceholder}><MaterialCommunityIcons name="image-outline" size={30} color={C.gold}/><Text style={s.imagePlaceholderText}>Community image</Text></View><Text style={s.imageCarouselTitle}>Estate news and events</Text><Text style={s.imageCarouselCaption}>Stay connected with what is happening around you.</Text></View>
    <View style={[s.imageCarouselCard,{width:imageCarouselCardWidth}]}><View style={s.imagePlaceholder}><MaterialCommunityIcons name="image-outline" size={30} color={C.gold}/><Text style={s.imagePlaceholderText}>Community image</Text></View><Text style={s.imageCarouselTitle}>Local businesses</Text><Text style={s.imageCarouselCaption}>Discover services and businesses in your community.</Text></View>
   </ScrollView>
   <View style={s.carouselDots}><View style={imageCarouselIndex===0?s.carouselDotActive:s.carouselDot}/><View style={imageCarouselIndex===1?s.carouselDotActive:s.carouselDot}/><View style={imageCarouselIndex===2?s.carouselDotActive:s.carouselDot}/></View>
  </View>
  </View>:cfg.welcomeTitle?<View style={s.banner}><Text style={s.bannerTitle}>{cfg.welcomeTitle}</Text><Text style={s.bannerText}>{cfg.welcomeText}</Text></View>:null}
 {cfg.actions?.map(a=><Pressable key={a.label} onPress={()=>go(a.route)} style={({pressed})=>[s.action,a.variant==='gold'?s.actionGold:s.actionLight,pressed&&{opacity:0.85}]}><MaterialCommunityIcons name={a.icon} size={24} color={C.dark}/><Text style={s.actionText}>{a.label}</Text><MaterialCommunityIcons name="chevron-right" size={22} color={C.dark}/></Pressable>)}
 <View style={s.grid}>{cfg.tiles.map(tile=><Pressable key={tile.label} onPress={()=>go(tile.route)} style={({pressed})=>[s.tile,{width:tileBasis},pressed&&{opacity:0.8}]}><MaterialCommunityIcons name={tile.icon} size={26} color={C.gold}/><Text style={s.tileText} numberOfLines={2}>{tile.label}</Text></Pressable>)}</View>
 {cfg.footer?<Pressable onPress={()=>go(cfg.footer!.route)} style={({pressed})=>[s.footer,pressed&&{opacity:0.8}]}><MaterialCommunityIcons name={cfg.footer.icon} size={20} color={C.gold}/><Text style={s.footerText}>{cfg.footer.label}</Text></Pressable>:null}
 <Pressable accessibilityRole="button" accessibilityLabel="Log out of CB Nest" disabled={signingOut} onPress={signOut} style={({pressed})=>[s.signOut,pressed&&{opacity:0.8},signingOut&&{opacity:0.65}]}>{signingOut?<ActivityIndicator color={C.gold}/>:<MaterialCommunityIcons name="logout" size={19} color={C.gold}/>}<Text style={s.signOutText}>{signingOut?'Signing out…':'Log Out'}</Text></Pressable>
 </ScrollView></SafeAreaView>
}
export default RoleLanding;
const s=StyleSheet.create({safe:{flex:1,backgroundColor:C.bg},walletCard:{marginTop:14,padding:14,minHeight:102,borderRadius:14,backgroundColor:C.card,borderWidth:1,borderColor:C.goldBorder},walletHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},walletEyebrow:{color:C.muted,fontSize:10,fontWeight:'800',letterSpacing:1.2},walletAmount:{color:C.text,fontSize:24,fontWeight:'900'},walletAmountRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,marginTop:8},topUpButton:{minHeight:36,paddingHorizontal:13,borderRadius:9,backgroundColor:C.gold,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4},topUpText:{color:C.dark,fontSize:12,fontWeight:'800'},walletFooter:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:5},walletHint:{color:C.gold,fontSize:10,fontWeight:'600'},carouselWrap:{marginTop:14},carouselContent:{gap:10},carouselCard:{minHeight:112,padding:14,borderRadius:14,backgroundColor:C.cardAlt,borderWidth:1,borderColor:C.goldBorder,justifyContent:'center'},carouselCardSecondary:{backgroundColor:'#141414'},carouselTitle:{color:C.text,fontSize:15,fontWeight:'800',lineHeight:20,marginTop:5},carouselSubtext:{color:C.muted,fontSize:10,lineHeight:15,marginTop:4},carouselDots:{flexDirection:'row',justifyContent:'center',alignItems:'center',gap:5,marginTop:7},imageCarouselSection:{marginTop:15},imageCarouselHeading:{marginBottom:8},imageCarouselHeadingText:{color:C.gold,fontSize:10,fontWeight:'900',letterSpacing:1.2},imageCarouselHint:{color:C.muted,fontSize:10,marginTop:3},imageCarouselCard:{padding:10,borderRadius:14,backgroundColor:C.card,borderWidth:1,borderColor:C.goldBorder},imagePlaceholder:{height:96,borderRadius:10,backgroundColor:'#1B1B1B',borderWidth:1,borderColor:C.goldBorder,alignItems:'center',justifyContent:'center',gap:5},imagePlaceholderText:{color:C.muted,fontSize:9,fontWeight:'600'},imageCarouselTitle:{color:C.text,fontSize:12,fontWeight:'800',marginTop:9},imageCarouselCaption:{color:C.muted,fontSize:10,lineHeight:14,marginTop:3},carouselDotActive:{width:14,height:5,borderRadius:3,backgroundColor:C.gold},carouselDot:{width:5,height:5,borderRadius:3,backgroundColor:C.muted},carouselSkeleton:{marginTop:14,minHeight:112,padding:14,borderRadius:14,backgroundColor:C.cardAlt,borderWidth:1,borderColor:C.goldBorder,justifyContent:'center'},skeletonTagline:{height:10,width:210,alignSelf:'center',borderRadius:6,backgroundColor:C.muted,opacity:0.25,marginTop:6},skeletonAvatarInner:{width:26,height:26,borderRadius:13,backgroundColor:C.goldBorder,opacity:0.45},skeletonLine:{height:10,borderRadius:6,backgroundColor:C.muted,opacity:0.28},skeletonTileLabel:{height:8,borderRadius:5,backgroundColor:C.muted,opacity:0.3},scroll:{padding:16,paddingBottom:120},tagline:{color:C.muted,fontSize:11,textAlign:'center',marginTop:4},badge:{alignSelf:'center',marginTop:8,paddingHorizontal:14,paddingVertical:3,borderRadius:999,borderWidth:1,borderColor:C.gold},badgeText:{color:C.gold,fontSize:11,fontWeight:'600'},greetRow:{flexDirection:'row',alignItems:'center',gap:12,marginTop:18},avatar:{width:48,height:48,borderRadius:24,borderWidth:1.5,borderColor:C.gold,backgroundColor:C.card,alignItems:'center',justifyContent:'center'},greet:{color:C.muted,fontSize:12},name:{color:C.text,fontSize:16,fontWeight:'700'},unit:{color:C.muted,fontSize:11},error:{color:'#FF9292',fontSize:10,marginTop:4},dot:{position:'absolute',top:-2,right:-2,width:8,height:8,borderRadius:4,backgroundColor:'#E5484D'},banner:{marginTop:14,padding:14,minHeight:100,justifyContent:'center',borderRadius:14,backgroundColor:C.cardAlt,borderWidth:1,borderColor:C.goldBorder},bannerEyebrow:{color:C.gold,fontSize:9,fontWeight:'800',letterSpacing:1.5,marginBottom:8},bannerTitle:{color:C.text,fontSize:20,fontWeight:'800'},bannerText:{color:C.muted,fontSize:12,marginTop:4},bannerDivider:{height:1,backgroundColor:C.goldBorder,marginTop:14,marginBottom:12},adTitle:{color:C.gold,fontSize:14,fontWeight:'800'},adText:{color:C.muted,fontSize:11,lineHeight:16,marginTop:4},action:{flexDirection:'row',alignItems:'center',gap:12,padding:16,borderRadius:12,marginTop:14},actionGold:{backgroundColor:C.gold},actionLight:{backgroundColor:'#171717',borderWidth:1,borderColor:C.goldBorder},actionText:{flex:1,color:C.gold,fontSize:15,fontWeight:'700'},grid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:10,marginTop:16},tile:{minHeight:88,paddingVertical:14,paddingHorizontal:8,borderRadius:14,backgroundColor:C.card,borderWidth:1,borderColor:C.goldBorder,alignItems:'center',justifyContent:'center',gap:8},tileText:{color:C.text,fontSize:11,fontWeight:'600',textAlign:'center'},footer:{marginTop:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,paddingVertical:12,borderRadius:12,backgroundColor:C.card,borderWidth:1,borderColor:C.goldBorder},footerText:{color:C.text,fontSize:13,fontWeight:'600'},signOut:{marginTop:12,marginBottom:18,minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9,borderRadius:12,borderWidth:1,borderColor:C.goldBorder,backgroundColor:C.card,paddingVertical:12},signOutText:{color:C.gold,fontSize:13,fontWeight:'700'}});
