import { useCallback,useEffect,useState } from "react";
import { ActivityIndicator,Text,TouchableOpacity,View } from "react-native";
import { supabase } from "../lib/supabase";

type Charge={id:string;title:string;description:string|null;amount_kobo:number;due_date:string|null};
const naira=(k:number)=>new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:2}).format(k/100);

export default function ResidentUtilities({estateId}:{estateId:string}){
 const [charges,setCharges]=useState<Charge[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const load=useCallback(async()=>{
  if(!estateId){setCharges([]);setLoading(false);return;}
  setLoading(true);setError("");
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){setError("Sign in again to view your service charges.");setLoading(false);return;}
  const {data,error:queryError}=await supabase.from("estate_service_charges")
   .select("id,title,description,amount_kobo,due_date")
   .eq("estate_id",estateId).eq("is_active",true).order("due_date",{ascending:true});
  if(queryError)setError("Your service charges could not be loaded. Please refresh.");
  else setCharges((data||[]) as Charge[]);
  setLoading(false);
 },[estateId]);
 useEffect(()=>{void load();},[load]);
 const card={backgroundColor:"#211D15",borderColor:"#514326",borderWidth:1,borderRadius:14,padding:16,marginBottom:12} as const;
 const muted={color:"#B9B1A0",fontSize:13} as const;
 return <View style={{gap:12,paddingBottom:24}}>
  <View style={card}>
   <Text style={{color:"#D4A84B",fontSize:11,fontWeight:"800",letterSpacing:1}}>ESTATE BILLING</Text>
   <Text style={{color:"#F7F1E5",fontSize:21,fontWeight:"800",marginTop:5}}>Service charges</Text>
   <Text style={[muted,{marginTop:5}]}>Your Facility Manager determines the service fee. Published amounts and due dates are shown below.</Text>
  </View>
  {loading?<ActivityIndicator color="#D4A84B"/>:error?<View style={card}><Text style={{color:"#F28B82"}}>{error}</Text><TouchableOpacity onPress={()=>void load()} style={{marginTop:12}}><Text style={{color:"#D4A84B",fontWeight:"700"}}>TRY AGAIN</Text></TouchableOpacity></View>:charges.length?charges.map(c=><View key={c.id} style={card}>
   <Text style={{color:"#F7F1E5",fontSize:16,fontWeight:"700"}}>{c.title}</Text>
   {!!c.description&&<Text style={[muted,{marginTop:4}]}>{c.description}</Text>}
   <Text style={{color:"#D4A84B",fontSize:23,fontWeight:"800",marginTop:10}}>{naira(c.amount_kobo)}</Text>
   <Text style={muted}>Due: {c.due_date?new Date(c.due_date+"T00:00:00").toLocaleDateString():"Date not specified"}</Text>
   <View style={{backgroundColor:"#514326",padding:12,borderRadius:9,marginTop:12}}>
    <Text style={{color:"#F7F1E5",textAlign:"center",fontWeight:"700"}}>View payment options in Service Charges</Text>
   </View>
  </View>):<View style={card}>
   <Text style={{color:"#F7F1E5",fontWeight:"700"}}>No service charges published</Text>
   <Text style={[muted,{marginTop:5}]}>Your estate has not published a service charge yet.</Text>
  </View>}
  <Text style={[muted,{lineHeight:19}]}>Only your Facility Manager can set or change these fees. A charge is marked as paid only after your payment is confirmed.</Text>
 </View>;
}
