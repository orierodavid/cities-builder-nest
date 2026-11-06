import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { supabase } from "../lib/supabase";

type Provider = { code: string; name: string };
type Validation = { validationId: string; customerName: string | null; address: string | null; meterNumber: string; meterType: string; provider: string; minimumVend: number | null; outstandingDebt: number | null; expiresInSeconds: number };
const money = (n: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(n);
const card = { backgroundColor: "#171717", borderColor: "#3A3020", borderWidth: 1, borderRadius: 15, padding: 15 } as const;
const field = { minHeight: 47, borderWidth: 1, borderColor: "#494133", borderRadius: 10, paddingHorizontal: 12, color: "#FFFFFF", backgroundColor: "#101010", fontSize: 13 } as const;

export default function ResidentElectricity({ estateId, onBack }: { estateId: string; onBack: () => void }) {
 const [providers,setProviders]=useState<Provider[]>([]),[provider,setProvider]=useState("");
 const [meter,setMeter]=useState(""),[type,setType]=useState<"prepaid"|"postpaid">("prepaid");
 const [validation,setValidation]=useState<Validation|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState(true);
 const invoke=useCallback(async(body:Record<string,unknown>)=>{const {data,error}=await supabase.functions.invoke("squad-electricity",{body});if(error||!data||data.error)throw new Error("Electricity meter services are temporarily unavailable. Please try again.");return data;},[]);
 const load=useCallback(async()=>{setLoading(true);setMessage("");try{const data=await invoke({action:"providers"});const rows=Array.isArray(data.providers)?data.providers as Provider[]:[];setProviders(rows);if(rows.length)setProvider(current=>current||rows[0].code);if(!rows.length)setMessage("No electricity providers are currently available.");}catch(e){setProviders([]);setMessage("Electricity companies could not be loaded. Please try again.");}finally{setLoading(false);}},[invoke]);
 useEffect(()=>{void load();},[load]);
 const validate=async()=>{if(!estateId){setMessage("Select your estate first.");return;}if(!/^\d{6,20}$/.test(meter.trim())){setMessage("Enter a valid meter number (6–20 digits).");return;}setBusy(true);setMessage("");setValidation(null);try{const data=await invoke({action:"lookup",estateId,discoCode:provider,meterNumber:meter.trim(),meterType:type});setValidation(data as Validation);setError(false);setMessage("Meter validated. Review the customer details before continuing.");}catch(e){setError(true);setMessage("We could not validate this meter. Check the details and try again.");}finally{setBusy(false);}};
 const selected=providers.find(p=>p.code===provider),minimum=Number(validation?.minimumVend||0),value=Number(amount.replace(/,/g,""));
 const amountValid=Number.isFinite(value)&&value>0&&value<=1000000&&value>=minimum;
 const label={color:"#F1D28A",fontSize:11,fontWeight:"800" as const,marginTop:12,marginBottom:6};
 return <View style={{gap:13,paddingBottom:28,backgroundColor:"#080808"}}>
  <TouchableOpacity onPress={onBack}><Text style={{color:"#D4A84B",fontSize:11,fontWeight:"900",paddingVertical:5}}>‹  BACK TO HOME</Text></TouchableOpacity>
  <View style={card}><Text style={{color:"#D4A84B",fontSize:10,fontWeight:"900",letterSpacing:1.7}}>RESIDENT UTILITIES</Text><Text style={{color:"#FFFFFF",fontSize:25,fontWeight:"900",marginTop:7}}>Electricity</Text><Text style={{color:"#B9B9B9",fontSize:12,lineHeight:19,marginTop:5}}>Choose your electricity company and check the registered meter details.</Text></View>
  <View style={card}>
   <Text style={{color:"#D4A84B",fontSize:11,fontWeight:"900",letterSpacing:1}}>1 · METER DETAILS</Text>
   <Text style={label}>Electricity company</Text>
   {loading?<ActivityIndicator color="#D4A84B"/>:providers.length?providers.map(p=><TouchableOpacity key={p.code} onPress={()=>{setProvider(p.code);setValidation(null);}} style={{minHeight:44,justifyContent:"center",paddingHorizontal:12,marginBottom:7,borderRadius:9,borderWidth:1,borderColor:provider===p.code?"#D4A84B":"#494133",backgroundColor:provider===p.code?"#302719":"#101010"}}><Text style={{color:provider===p.code?"#F1D28A":"#FFFFFF",fontSize:12,fontWeight:"800"}}>{p.name}</Text></TouchableOpacity>):<TouchableOpacity onPress={()=>void load()}><Text style={{color:"#D4A84B"}}>RETRY LOADING PROVIDERS</Text></TouchableOpacity>}
   <Text style={label}>Meter type</Text><View style={{flexDirection:"row",gap:9}}>{(["prepaid","postpaid"] as const).map(t=><TouchableOpacity key={t} onPress={()=>{setType(t);setValidation(null);}} style={{flex:1,minHeight:43,borderRadius:9,borderWidth:1,borderColor:type===t?"#D4A84B":"#494133",backgroundColor:type===t?"#302719":"#101010",alignItems:"center",justifyContent:"center"}}><Text style={{color:type===t?"#F1D28A":"#B9B9B9",fontWeight:"800",textTransform:"capitalize"}}>{t}</Text></TouchableOpacity>)}</View>
   <Text style={label}>Meter number</Text><TextInput accessibilityLabel="Electricity meter number" value={meter} onChangeText={v=>{setMeter(v.replace(/\D/g,"").slice(0,20));setValidation(null);}} keyboardType="number-pad" maxLength={20} placeholder="Enter meter number" placeholderTextColor="#777" style={field}/>
   <TouchableOpacity onPress={()=>void validate()} disabled={busy||loading||!provider||meter.length<6} style={{minHeight:48,borderRadius:10,backgroundColor:"#D4A84B",alignItems:"center",justifyContent:"center",marginTop:15,opacity:busy||loading||!provider||meter.length<6?.55:1}}>{busy?<ActivityIndicator color="#17130B"/>:<Text style={{color:"#17130B",fontSize:12,fontWeight:"900"}}>VALIDATE METER</Text>}</TouchableOpacity>
  </View>
  {validation&&<View style={card}>
   <Text style={{color:"#D4A84B",fontSize:11,fontWeight:"900",letterSpacing:1}}>2 · METER DETAILS</Text>
   <Text style={{color:"#FFFFFF",fontSize:18,fontWeight:"900",marginTop:10}}>{validation.customerName||"Customer name unavailable"}</Text>
   {!!validation.address&&<Text style={{color:"#B9B9B9",fontSize:12,marginTop:4}}>{validation.address}</Text>}
   <View style={{height:1,backgroundColor:"#3A3020",marginVertical:12}}/>
   {[["Electricity company",selected?.name||validation.provider],["Meter number",validation.meterNumber],["Meter type",validation.meterType],...(validation.outstandingDebt!=null?[["Outstanding debt",money(Number(validation.outstandingDebt))]]:[])].map(([k,v])=><View key={k} style={{flexDirection:"row",justifyContent:"space-between",paddingVertical:5,gap:10}}><Text style={{color:"#AFA89A",fontSize:11}}>{k}</Text><Text style={{color:"#F7F1E5",fontSize:11,fontWeight:"800",flexShrink:1,textAlign:"right"}}>{v}</Text></View>)}
   <Text style={{color:"#B9B1A0",fontSize:11,lineHeight:18,marginTop:15}}>Electricity purchases are not available yet. You can use this screen to check your meter details.</Text>\n  </View>}
  {!!message&&<View style={{borderRadius:10,padding:12,backgroundColor:error?"#2B1717":"#17251B"}}><Text style={{color:error?"#F28B82":"#8ED6A5",fontSize:11,lineHeight:17}}>{message}</Text></View>}
  <Text style={{color:"#777",fontSize:10,lineHeight:16}}>Meter details are checked before any electricity purchase can be made.</Text>
 </View>;
}
