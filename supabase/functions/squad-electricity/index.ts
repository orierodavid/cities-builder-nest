import { createClient } from "npm:@supabase/supabase-js@2";
const headers = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS", "Content-Type":"application/json" };
const response = (status:number, body:Record<string,unknown>) => new Response(JSON.stringify(body), { status, headers });
Deno.serve(async (req:Request) => {
 if (req.method === "OPTIONS") return new Response("ok", {headers});
 if (req.method !== "POST") return response(405,{error:"method_not_allowed"});
 const supabaseUrl=Deno.env.get("SUPABASE_URL");
 const anonKey=Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 const squadKey=Deno.env.get("SQUAD_SECRET_KEY");
 const environment=Deno.env.get("SQUAD_ENVIRONMENT") ?? "sandbox";
 if(!supabaseUrl || !anonKey || !serviceKey || !squadKey) return response(503,{error:"squad_electricity_not_configured"});
 const jwt=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"");
 if(!jwt) return response(401,{error:"authentication_required"});
 const client=createClient(supabaseUrl,anonKey,{auth:{autoRefreshToken:false,persistSession:false},global:{headers:{Authorization:`Bearer ${jwt}`}}});
 const {data:auth,error:authError}=await client.auth.getUser(jwt);
 if(authError || !auth.user) return response(401,{error:"invalid_session"});
 const admin=createClient(supabaseUrl,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
 const {data:members,error:memberError}=await admin.from("estate_memberships").select("estate_id").eq("user_id",auth.user.id).eq("membership_role","resident").eq("status","active");
 if(memberError) return response(503,{error:"membership_lookup_failed"});
 const estates=(members??[]).map((m)=>m.estate_id);
 if(!estates.length) return response(403,{error:"active_resident_membership_required"});
 let input:Record<string,unknown>;
 try { input=await req.json(); } catch { return response(400,{error:"invalid_json"}); }
 const base=environment==="live"?"https://api-d.squadco.com":"https://sandbox-api-d.squadco.com";
 const squad=async(path:string,method="GET",body?:Record<string,unknown>)=>{
  const r=await fetch(base+path,{method,headers:{Authorization:`Bearer ${squadKey}`,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
  let data:Record<string,unknown>={}; try { data=await r.json(); } catch {}
  return {r,data};
 };
 if(input.action==="providers"){
  const {r,data}=await squad("/vending/utilities/electricity/service-providers");
  if(!r.ok || data.success!==true || !Array.isArray(data.data)) return response(502,{error:"provider_list_unavailable"});
  return response(200,{providers:data.data.map((p:Record<string,unknown>)=>({code:p.code,name:p.name,logoUrl:p.logo_url??null}))});
 }
 if(input.action==="lookup"){
  const disco=String(input.discoCode??"").trim().toUpperCase();
  const meter=String(input.meterNumber??"").trim();
  const meterType=String(input.meterType??"");
  const estateId=String(input.estateId??"");
  if(!/^[A-Z0-9]{2,20}$/.test(disco) || !/^\d{6,20}$/.test(meter) || !["prepaid","postpaid"].includes(meterType) || !estates.includes(estateId)) return response(400,{error:"invalid_meter_details"});
  const {r,data}=await squad("/vending/utilities/electricity/lookup","POST",{provider:disco,meter_no:meter,meter_type:meterType});
  const details=data.data as Record<string,unknown>|undefined;
  if(!r.ok || data.success!==true || !details?.reference) return response(422,{error:"meter_validation_failed",message:typeof data.message==="string"?data.message:"Meter could not be validated."});
  const {data:record,error}=await admin.from("electricity_meter_validations").insert({
   resident_user_id:auth.user.id,estate_id:estateId,disco_code:disco,meter_number:meter,meter_type:meterType,
   provider_reference:String(details.reference),customer_name:typeof details.customer_name==="string"?details.customer_name:null,
   customer_address:typeof details.address==="string"?details.address:null,
   minimum_vend:details.minimum_vend==null?null:Number(details.minimum_vend),
   account_type:typeof details.account_type==="string"?details.account_type:null,
   outstanding_debt:details.outstanding_debt==null?null:Number(details.outstanding_debt),
   expires_at:new Date(Date.now()+15*60*1000).toISOString()
  }).select("id").single();
  if(error || !record) return response(503,{error:"meter_validation_save_failed"});
  return response(200,{validationId:record.id,customerName:details.customer_name??null,address:details.address??null,meterNumber:meter,meterType,provider:disco,minimumVend:details.minimum_vend??null,outstandingDebt:details.outstanding_debt??null,expiresInSeconds:900});
 }
 return response(400,{error:"unsupported_action"});
});