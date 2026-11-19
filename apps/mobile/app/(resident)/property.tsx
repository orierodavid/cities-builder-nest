import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Screen, Card, SectionTitle, EmptyState } from '../../src/components/ui';
import { supabase } from '../../lib/supabase';
import { theme } from '../../src/theme/theme';

type EstateInfo={name:string;address:string;city:string;state:string};
type Assignment={unit_id:string;start_date:string;estate_id?:string|null;units?:{unit_code:string;unit_type:string|null;status:string;building_id:string;estate_id:string|null;buildings?:{name:string}|null}|null};
export default function PropertyScreen(){
 const [assignment,setAssignment]=useState<Assignment|null>(null);
 const [estate,setEstate]=useState<EstateInfo|null>(null);
 const [homeNumber,setHomeNumber]=useState('');
 const [houseNumber,setHouseNumber]=useState('');
 const [streetName,setStreetName]=useState('');
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{let active=true;(async()=>{
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError)throw authError;
   if(!user)throw new Error('Please sign in again.');
   const [{data:profile,error:profileError},{data:rows,error:queryError},{data:memberships,error:membershipError}]=await Promise.all([
    supabase.from('users').select('home_number,house_number,street_name').eq('id',user.id).maybeSingle(),
    supabase.from('resident_units').select('unit_id,start_date,estate_id').eq('resident_user_id',user.id).is('end_date',null).order('start_date',{ascending:false}).limit(1),
    supabase.from('estate_memberships').select('estate_id,status').eq('user_id',user.id).limit(20)
   ]);
   if(profileError)throw profileError;
   if(queryError)throw queryError;
   if(membershipError)throw membershipError;
   if(active){setHomeNumber(profile?.home_number||'');setHouseNumber(profile?.house_number||'');setStreetName(profile?.street_name||'');}
   const row=rows?.[0]||null;
   const activeMembership=memberships?.find((item:any)=>String(item.status||'').toLowerCase()==='active');
   const estateId=row?.estate_id||activeMembership?.estate_id||memberships?.[0]?.estate_id||null;
   let estateInfo:EstateInfo|null=null;
   if(estateId){
    const {data:estateRow,error:estateError}=await supabase.from('estates').select('name,address,city,state').eq('id',estateId).maybeSingle();
    if(estateError)throw estateError;
    estateInfo=estateRow as EstateInfo|null;
    if(active)setEstate(estateInfo);
   }
   if(!row){if(active)setAssignment(null);return;}
   const {data:unit,error:unitError}=await supabase.from('units').select('unit_code,unit_type,status,building_id,estate_id').eq('id',row.unit_id).maybeSingle();
   if(unitError)throw unitError;
   if(!unit){if(active)setAssignment(null);return;}
   const {data:building,error:buildingError}=await supabase.from('buildings').select('name').eq('id',unit.building_id).maybeSingle();
   if(buildingError)throw buildingError;
   if(!estateInfo&&(row.estate_id||unit.estate_id)){
    const {data:estateRow,error:estateError}=await supabase.from('estates').select('name,address,city,state').eq('id',row.estate_id||unit.estate_id).maybeSingle();
    if(estateError)throw estateError;
    estateInfo=estateRow as EstateInfo|null;
    if(active)setEstate(estateInfo);
   }
   if(active)setAssignment({...row,units:{...unit,buildings:building}});
  }catch(e){if(active)setError(e instanceof Error?e.message:'Property information could not be loaded.');}
  finally{if(active)setLoading(false);}
 })();return()=>{active=false}},[]);
 const unit=assignment?.units;
 const building=unit?.buildings;
 const displayEstate=estate||null;
 return <Screen title="My Property" subtitle="Your estate, home and occupancy details">
 {loading?<ActivityIndicator color={theme.gold}/>:error?<Card><Text style={{color:'#FF9292'}}>{error}</Text></Card>:<View style={{gap:12}}>
  {displayEstate&&<Card><SectionTitle>My Estate</SectionTitle><Text style={{color:theme.gold,fontSize:21,fontWeight:'900'}}>{displayEstate.name}</Text>{!!displayEstate.address&&<Text style={{color:theme.muted,fontSize:12,marginTop:7}}>{[displayEstate.address,displayEstate.city,displayEstate.state].filter(Boolean).join(', ')}</Text>}</Card>}
  {assignment&&unit?<Card><SectionTitle>Property information</SectionTitle><View style={{gap:7}}>
   <Text style={{color:theme.muted,fontSize:11}}>ESTATE</Text><Text style={{color:theme.text,fontSize:17,fontWeight:'800'}}>{displayEstate?.name||'Estate name unavailable'}</Text>
   <Text style={{color:theme.muted,fontSize:11,marginTop:9}}>BUILDING</Text><Text style={{color:theme.text,fontSize:15,fontWeight:'700'}}>{building?.name||'Building name unavailable'}</Text>
   <Text style={{color:theme.muted,fontSize:11,marginTop:9}}>APARTMENT / UNIT</Text><Text style={{color:theme.gold,fontSize:24,fontWeight:'900'}}>{unit.unit_code}</Text>
   <Text style={{color:theme.muted,fontSize:12}}>{unit.unit_type||'Residential unit'} · {unit.status.replace(/_/g,' ')}</Text>
   {!!homeNumber&&<><Text style={{color:theme.muted,fontSize:11,marginTop:9}}>APARTMENT / SUITE</Text><Text style={{color:theme.gold,fontSize:20,fontWeight:'900'}}>{homeNumber}</Text></>}
   {!!houseNumber&&<><Text style={{color:theme.muted,fontSize:11,marginTop:9}}>HOUSE NUMBER</Text><Text style={{color:theme.text,fontSize:14,fontWeight:'700'}}>{houseNumber}</Text></>}
   {!!streetName&&<><Text style={{color:theme.muted,fontSize:11,marginTop:9}}>STREET ADDRESS</Text><Text style={{color:theme.text,fontSize:14,fontWeight:'700'}}>{streetName}</Text></>}
   <Text style={{color:theme.muted,fontSize:11,marginTop:8}}>OCCUPANCY START DATE</Text><Text style={{color:theme.text,fontSize:13}}>{new Date(assignment.start_date+'T00:00:00').toLocaleDateString('en-NG')}</Text>
  </View></Card>:null}
  {!assignment&&!displayEstate&&!homeNumber&&!houseNumber&&!streetName&&<Card><EmptyState icon="home-city-outline" title="No property details" message="No estate or apartment is linked to this resident account. Please contact estate management."/></Card>}
  {!assignment&&(homeNumber||houseNumber||streetName)&&<Card><SectionTitle>Home address</SectionTitle><View style={{gap:7}}>{!!homeNumber&&<><Text style={{color:theme.muted,fontSize:11}}>APARTMENT / SUITE</Text><Text style={{color:theme.gold,fontSize:24,fontWeight:'900'}}>{homeNumber}</Text></>}{!!houseNumber&&<><Text style={{color:theme.muted,fontSize:11,marginTop:9}}>HOUSE NUMBER</Text><Text style={{color:theme.text,fontSize:15,fontWeight:'700'}}>{houseNumber}</Text></>}{!!streetName&&<><Text style={{color:theme.muted,fontSize:11,marginTop:9}}>STREET ADDRESS</Text><Text style={{color:theme.text,fontSize:15,fontWeight:'700'}}>{streetName}</Text></>}</View></Card>}
 </View>}
 </Screen>;
}
