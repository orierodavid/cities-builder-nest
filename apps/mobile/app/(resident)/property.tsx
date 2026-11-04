import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Screen, Card, SectionTitle, EmptyState } from '../../src/components/ui';
import { supabase } from '../../lib/supabase';
import { theme } from '../../src/theme/theme';

type Assignment={unit_id:string;start_date:string;units?:{unit_code:string;unit_type:string|null;status:string;buildings?:{name:string;estates?:{name:string;address:string;city:string;state:string}|null}|null}|null};
export default function PropertyScreen(){
 const [assignment,setAssignment]=useState<Assignment|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 useEffect(()=>{let active=true;(async()=>{try{
  const {data:{user},error:authError}=await supabase.auth.getUser();if(authError)throw authError;if(!user)throw new Error('Please sign in again.');
  const {data,error:queryError}=await supabase.from('resident_units').select('unit_id,start_date,units(unit_code,unit_type,status,buildings(name,estates(name,address,city,state)))').eq('resident_user_id',user.id).is('end_date',null).order('start_date',{ascending:false}).limit(1).maybeSingle();
  if(queryError)throw queryError;if(active)setAssignment(data as Assignment|null);
 }catch(e){if(active)setError(e instanceof Error?e.message:'Property information could not be loaded.');}finally{if(active)setLoading(false);}})();return()=>{active=false}},[]);
 const unit=assignment?.units;const building=unit?.buildings;const estate=building?.estates;
 return <Screen title="My Property" subtitle="Your assigned home and occupancy details">
 {loading?<ActivityIndicator color={theme.gold}/>:error?<Card><Text style={{color:'#FF9292'}}>{error}</Text></Card>:!assignment||!unit?<Card><EmptyState icon="home-city-outline" title="No apartment assigned" message="No active apartment assignment is linked to this resident account. Please contact estate management to verify the allocation."/></Card>:<Card><SectionTitle>Property information</SectionTitle><View style={{gap:7}}>
 <Text style={{color:theme.muted,fontSize:11}}>ESTATE</Text><Text style={{color:theme.text,fontSize:17,fontWeight:'800'}}>{estate?.name||'Estate name unavailable'}</Text>
 <Text style={{color:theme.muted,fontSize:11,marginTop:9}}>BUILDING</Text><Text style={{color:theme.text,fontSize:15,fontWeight:'700'}}>{building?.name||'Building name unavailable'}</Text>
 <Text style={{color:theme.muted,fontSize:11,marginTop:9}}>APARTMENT / UNIT</Text><Text style={{color:theme.gold,fontSize:24,fontWeight:'900'}}>{unit.unit_code}</Text>
 <Text style={{color:theme.muted,fontSize:12}}>{unit.unit_type||'Residential unit'} · {unit.status.replace(/_/g,' ')}</Text>
 {!!estate?.address&&<Text style={{color:theme.muted,fontSize:12,marginTop:8}}>{[estate.address,estate.city,estate.state].filter(Boolean).join(', ')}</Text>}
 <Text style={{color:theme.muted,fontSize:11,marginTop:8}}>OCCUPANCY START DATE</Text><Text style={{color:theme.text,fontSize:13}}>{new Date(assignment.start_date+'T00:00:00').toLocaleDateString('en-NG')}</Text>
 </View></Card>}
 </Screen>;
}
