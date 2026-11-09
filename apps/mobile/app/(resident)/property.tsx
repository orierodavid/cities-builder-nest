import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Screen, Card, SectionTitle, EmptyState } from '../../src/components/ui';
import { supabase } from '../../lib/supabase';
import { theme } from '../../src/theme/theme';

type Assignment={unit_id:string;start_date:string;units?:{unit_code:string;unit_type:string|null;status:string;buildings?:{name:string;estates?:{name:string;address:string;city:string;state:string}|null}|null}|null};
export default function PropertyScreen(){
 const [assignment,setAssignment]=useState<Assignment|null>(null);const [homeNumber,setHomeNumber]=useState('');const [streetName,setStreetName]=useState('');const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 useEffect(()=>{let active=true;(async()=>{try{
  const {data:{user},error:authError}=await supabase.auth.getUser();if(authError)throw authError;if(!user)throw new Error('Please sign in again.');
  const [{data:profile,error:profileError},{data:rows,error:queryError}]=await Promise.all([
   supabase.from('users').select('home_number,street_name').eq('id',user.id).maybeSingle(),
   supabase.from('resident_units').select('unit_id,start_date,estate_id').eq('resident_user_id',user.id).is('end_date',null).order('start_date',{ascending:false}).limit(1)
  ]);
  if(profileError)throw profileError;if(queryError)throw queryError;
  if(active){setHomeNumber(profile?.home_number||'');setStreetName(profile?.street_name||'');}
  const row=rows?.[0];if(!row){if(active)setAssignment(null);return;}
  const {data:unit,error:unitError}=await supabase.from('units').select('unit_code,unit_type,status,building_id,estate_id').eq('id',row.unit_id).maybeSingle();if(unitError)throw unitError;if(!unit){if(active)setAssignment(null);return;}
  const [{data:building,error:buildingError},{data:estate,error:estateError}]=await Promise.all([supabase.from('buildings').select('name').eq('id',unit.building_id).maybeSingle(),supabase.from('estates').select('name,address,city,state').eq('id',row.estate_id||unit.estate_id).maybeSingle()]);
  if(buildingError)throw buildingError;if(estateError)throw estateError;if(active)setAssignment({...row,units:{...unit,buildings:{name:building?.name||'Building name unavailable',estates:estate}}} as Assignment);
 }catch(e){if(active)setError(e instanceof Error?e.message:'Property information could not be loaded.');}finally{if(active)setLoading(false);}})();return()=>{active=false}},[]); const unit=assignment?.units;const building=unit?.buildings;const estate=building?.estates;
 return <Screen title="My Property" subtitle="Your assigned home and occupancy details">
 {loading?<ActivityIndicator color={theme.gold}/>:error?<Card><Text style={{color:'#FF9292'}}>{error}</Text></Card>:!assignment||!unit?(homeNumber||streetName?<Card><SectionTitle>Property information</SectionTitle><View style={{gap:7}}>{!!homeNumber&&<><Text style={{color:theme.muted,fontSize:11}}>HOME NUMBER / APARTMENT</Text><Text style={{color:theme.gold,fontSize:24,fontWeight:'900'}}>{homeNumber}</Text></>}{!!streetName&&<><Text style={{color:theme.muted,fontSize:11,marginTop:9}}>STREET NAME</Text><Text style={{color:theme.text,fontSize:15,fontWeight:'700'}}>{streetName}</Text></>}<Text style={{color:theme.muted,fontSize:11,marginTop:8}}>These details were provided during registration. Contact estate management if they need correction.</Text></View></Card>:<Card><EmptyState icon="home-city-outline" title="No apartment details" message="No home address or active apartment assignment is linked to this resident account. Please contact estate management."/></Card>):<Card><SectionTitle>Property information</SectionTitle><View style={{gap:7}}>
 <Text style={{color:theme.muted,fontSize:11}}>ESTATE</Text><Text style={{color:theme.text,fontSize:17,fontWeight:'800'}}>{estate?.name||'Estate name unavailable'}</Text>
 <Text style={{color:theme.muted,fontSize:11,marginTop:9}}>BUILDING</Text><Text style={{color:theme.text,fontSize:15,fontWeight:'700'}}>{building?.name||'Building name unavailable'}</Text>
 <Text style={{color:theme.muted,fontSize:11,marginTop:9}}>APARTMENT / UNIT</Text><Text style={{color:theme.gold,fontSize:24,fontWeight:'900'}}>{unit.unit_code}</Text>
 <Text style={{color:theme.muted,fontSize:12}}>{unit.unit_type||'Residential unit'} · {unit.status.replace(/_/g,' ')}</Text>
 {!!estate?.address&&<Text style={{color:theme.muted,fontSize:12,marginTop:8}}>{[estate.address,estate.city,estate.state].filter(Boolean).join(', ')}</Text>}
 {!!homeNumber&&<><Text style={{color:theme.muted,fontSize:11,marginTop:9}}>HOME NUMBER / APARTMENT</Text><Text style={{color:theme.gold,fontSize:20,fontWeight:'900'}}>{homeNumber}</Text></>}{!!streetName&&<><Text style={{color:theme.muted,fontSize:11,marginTop:9}}>STREET NAME</Text><Text style={{color:theme.text,fontSize:14,fontWeight:'700'}}>{streetName}</Text></>}
 <Text style={{color:theme.muted,fontSize:11,marginTop:8}}>OCCUPANCY START DATE</Text><Text style={{color:theme.text,fontSize:13}}>{new Date(assignment.start_date+'T00:00:00').toLocaleDateString('en-NG')}</Text>
 </View></Card>}
 </Screen>;
}
