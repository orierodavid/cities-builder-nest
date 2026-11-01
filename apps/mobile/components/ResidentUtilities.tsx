import { useCallback,useEffect,useState } from "react";
import { ActivityIndicator,Text,TextInput,TouchableOpacity,View } from "react-native";
import { supabase } from "../lib/supabase";

type Charge={id:string;title:string;description:string|null;amount_kobo:number;due_date:string|null};
type Meter={id:string;meter_number:string;disco:string;meter_type:string;label:string|null};
const discos=[["ikeja_electric","Ikeja Electric"],["eko_electric","Eko Electric"],["abuja_electric","Abuja Electricity"],["kano_electric","Kano Electricity"],["port_harcourt_electric","Port Harcourt Electricity"],["jos_electric","Jos Electricity"],["kaduna_electric","Kaduna Electricity"],["ibadan_electric","Ibadan Electricity"],["enugu_electric","Enugu Electricity"],["benin_electric","Benin Electricity"],["yola_electric","Yola Electricity"]] as const;
const naira=(k:number)=>new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:2}).format(k/100);
export default function ResidentUtilities({estateId}:{estateId:string}){
 const [charges,setCharges]=useState<Charge[]>([]);const [meters,setMeters]=useState<Meter[]>([]);
 const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [notice,setNotice]=useState("");
 const [number,setNumber]=useState("");const [disco,setDisco]=useState<string>("ikeja_electric");const [type,setType]=useState<"prepaid"|"postpaid">("prepaid");const [label,setLabel]=useState("");
 const load=useCallback(async()=>{
  if(!estateId){setLoading(false);return;}setLoading(true);setError("");
  const {data:{user}}=await supabase.auth.getUser();if(!user){setError("Sign in again to view your bills.");setLoading(false);return;}
  const [{data:c,error:ce},{data:m,error:me}]=await Promise.all([
   supabase.from("estate_service_charges").select("id,title,description,amount_kobo,due_date").eq("estate_id",estateId).eq("is_active",true).order("due_date"),
   supabase.from("resident_electricity_meters").select("id,meter_number,disco,meter_type,label").eq("estate_id",estateId).order("created_at",{ascending:false})
  ]);
  if(ce||me)setError("Your utility information could not be loaded. Please refresh.");
  else{setCharges((c||[]) as Charge[]);setMeters((m||[]) as Meter[]);}
  setLoading(false);
 },[estateId]);
 useEffect(()=>{void load();},[load]);
 async function addMeter(){
  setBusy(true);setError("");setNotice("");const {data:{user}}=await supabase.auth.getUser();
  if(!user||!estateId){setError("Your estate membership could not be verified.");setBusy(false);return;}
  const {error:e}=await supabase.from("resident_electricity_meters").insert({resident_user_id:user.id,estate_id:estateId,meter_number:number.trim(),disco,meter_type:type,label:label.trim()||null});
  if(e){setError(e.code==="23505"?"This meter is already saved to your account.":"Meter could not be saved. Check the number and try again.");}
  else{setNumber("");setLabel("");setNotice("Meter saved. Recharge will be enabled when the electricity vending provider is connected.");await load();}
  setBusy(false);
 }
 const card={backgroundColor:"#211D15",borderColor:"#514326",borderWidth:1,borderRadius:14,padding:16,marginBottom:12} as const;
 const muted={color:"#B9B1A0",fontSize:13} as const;
 const field={backgroundColor:"#15130F",borderColor:"#514326",borderWidth:1,borderRadius:9,color:"#F7F1E5",padding:12,marginTop:7,marginBottom:10} as const;
 return <View style={{gap:12,paddingBottom:24}}>
  <View style={card}><Text style={{color:"#D4A84B",fontSize:11,fontWeight:"800",letterSpacing:1}}>SERVICE CHARGES</Text><Text style={{color:"#F7F1E5",fontSize:21,fontWeight:"800",marginTop:5}}>What you need to pay</Text><Text style={[muted,{marginTop:5}]}>Your Facility Manager sets these fees. You can view the amount and due date here.</Text></View>
  {loading?<ActivityIndicator color="#D4A84B"/>:charges.length?charges.map(c=><View key={c.id} style={card}><Text style={{color:"#F7F1E5",fontSize:16,fontWeight:"700"}}>{c.title}</Text>{!!c.description&&<Text style={[muted,{marginTop:4}]}>{c.description}</Text>}<Text style={{color:"#D4A84B",fontSize:23,fontWeight:"800",marginTop:10}}>{naira(c.amount_kobo)}</Text><Text style={muted}>Due: {c.due_date?new Date(c.due_date+"T00:00:00").toLocaleDateString():"Date not specified"}</Text><TouchableOpacity disabled style={{backgroundColor:"#514326",padding:12,borderRadius:9,marginTop:12,opacity:.65}}><Text style={{color:"#F7F1E5",textAlign:"center",fontWeight:"700"}}>Payment gateway not connected</Text></TouchableOpacity></View>):<View style={card}><Text style={{color:"#F7F1E5",fontWeight:"700"}}>No service charges published</Text><Text style={[muted,{marginTop:5}]}>Your estate has not published a service charge yet.</Text></View>}
  <View style={card}><Text style={{color:"#D4A84B",fontSize:11,fontWeight:"800",letterSpacing:1}}>ELECTRICITY</Text><Text style={{color:"#F7F1E5",fontSize:21,fontWeight:"800",marginTop:5}}>Your prepaid meters</Text><Text style={[muted,{marginTop:5}]}>Save your meter details so the correct account can be used when recharge vending is connected.</Text>
   <TextInput value={number} onChangeText={setNumber} keyboardType="number-pad" placeholder="Meter number" placeholderTextColor="#8E8779" style={field}/>
   <TextInput value={label} onChangeText={setLabel} placeholder="Nickname (e.g. Main apartment)" placeholderTextColor="#8E8779" style={field}/>
   <Text style={{color:"#F7F1E5",fontWeight:"700",marginBottom:7}}>Distribution company</Text>
   <View style={{flexDirection:"row",flexWrap:"wrap",gap:7,marginBottom:12}}>{discos.map(([id,name])=><TouchableOpacity key={id} onPress={()=>setDisco(id)} style={{padding:9,borderRadius:8,borderWidth:1,borderColor:disco===id?"#D4A84B":"#514326",backgroundColor:disco===id?"#514326":"#15130F"}}><Text style={{color:"#F7F1E5",fontSize:12}}>{name}</Text></TouchableOpacity>)}</View>
   <View style={{flexDirection:"row",gap:8,marginBottom:12}}>{(["prepaid","postpaid"] as const).map(v=><TouchableOpacity key={v} onPress={()=>setType(v)} style={{flex:1,padding:10,borderRadius:8,backgroundColor:type===v?"#514326":"#15130F",borderWidth:1,borderColor:type===v?"#D4A84B":"#514326"}}><Text style={{color:"#F7F1E5",textAlign:"center",fontWeight:"700"}}>{v.toUpperCase()}</Text></TouchableOpacity>)}</View>
   <TouchableOpacity disabled={busy||number.trim().length<6} onPress={()=>void addMeter()} style={{backgroundColor:"#D4A84B",padding:13,borderRadius:9,opacity:busy||number.trim().length<6?.55:1}}><Text style={{color:"#17130B",textAlign:"center",fontWeight:"800"}}>{busy?"Saving meter…":"Save meter"}</Text></TouchableOpacity>
   {!!error&&<Text style={{color:"#F28B82",marginTop:10}}>{error}</Text>}{!!notice&&<Text style={{color:"#9ED6A5",marginTop:10}}>{notice}</Text>}
  </View>
  {meters.map(m=><View key={m.id} style={card}><Text style={{color:"#F7F1E5",fontWeight:"700"}}>{m.label||"Saved meter"}</Text><Text style={muted}>{m.meter_number} · {discos.find(x=>x[0]===m.disco)?.[1]||m.disco} · {m.meter_type}</Text><Text style={{color:"#D4A84B",fontSize:12,fontWeight:"700",marginTop:9}}>RECHARGE AWAITS VENDING PROVIDER</Text></View>)}
  <Text style={[muted,{lineHeight:19}]}>No electricity payment is taken and no token is generated until a vetted vending provider and payment gateway are connected.</Text>
 </View>;
}
