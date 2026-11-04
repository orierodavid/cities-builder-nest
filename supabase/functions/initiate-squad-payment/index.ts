import { createClient } from "npm:@supabase/supabase-js@2";
const headers = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const reply=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers});
const makeRef=()=>`CBNEST${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().replaceAll("-","").slice(0,12).toUpperCase()}`;
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers}); if(req.method!=="POST")return reply(405,{error:"method_not_allowed"});
 const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY")??Deno.env.get("SUPABASE_PUBLISHABLE_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),secret=Deno.env.get("SQUAD_SECRET_KEY"),mode=Deno.env.get("SQUAD_ENVIRONMENT")??"sandbox";
 if(!url||!anon||!service||!secret)return reply(503,{error:"squad_payment_not_configured"});
 if(!["sandbox","live"].includes(mode))return reply(503,{error:"invalid_squad_environment"});
 const token=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,""); if(!token)return reply(401,{error:"authentication_required"});
 const user=createClient(url,anon,{auth:{autoRefreshToken:false,persistSession:false},global:{headers:{Authorization:`Bearer ${token}`}}});
 const {data:auth,error:authErr}=await user.auth.getUser(token); if(authErr||!auth.user)return reply(401,{error:"invalid_session"});
 const {data:legal,error:legalErr}=await user.rpc("get_legal_consent_status"); if(legalErr)return reply(503,{error:"legal_consent_check_unavailable"}); if(legal?.requiresAcceptance)return reply(403,{error:"legal_consent_required"});
 let body:Record<string,unknown>;try{body=await req.json()}catch{return reply(400,{error:"invalid_json"})}
 const type=body.paymentType,chargeId=typeof body.chargeId==="string"?body.chargeId:"",goalId=typeof body.goalId==="string"?body.goalId:"",requested=Number(body.amountKobo);
 if(!["service_charge","rent_savings"].includes(String(type)))return reply(400,{error:"invalid_payment_type"});
 if(type==="service_charge"&&(!chargeId||goalId))return reply(400,{error:"invalid_service_charge"});
 if(type==="rent_savings"&&(!goalId||chargeId||!Number.isSafeInteger(requested)||requested<10000||requested>100000000000))return reply(400,{error:"invalid_savings_contribution"});
 const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
 const [{data:profile,error:pe},{data:members,error:me}]=await Promise.all([admin.from("users").select("full_name").eq("id",auth.user.id).maybeSingle(),admin.from("estate_memberships").select("estate_id").eq("user_id",auth.user.id).eq("membership_role","resident").eq("status","active")]);
 if(pe||me)return reply(503,{error:"resident_context_unavailable"}); if(!profile?.full_name||!auth.user.email||!members?.length)return reply(403,{error:"active_resident_profile_required"});
 const ref=makeRef();let estateId="",amountKobo=0,ledgerId="",table="";
 if(type==="service_charge"){
  const {data:charge,error}=await admin.from("estate_service_charges").select("id,estate_id,amount_kobo,is_active").eq("id",chargeId).maybeSingle();
  if(error)return reply(503,{error:"charge_lookup_failed"});if(!charge||!charge.is_active||!members.some((m)=>m.estate_id===charge.estate_id))return reply(404,{error:"active_estate_charge_not_found"});
  const {data:paid}=await admin.from("service_charge_payments").select("id").eq("charge_id",charge.id).eq("resident_user_id",auth.user.id).eq("status","successful").maybeSingle();if(paid)return reply(409,{error:"service_charge_already_paid"});
  estateId=charge.estate_id;amountKobo=Number(charge.amount_kobo);table="service_charge_payments";
  const {data:row,error:ie}=await admin.from(table).insert({charge_id:charge.id,estate_id:estateId,resident_user_id:auth.user.id,amount_kobo:amountKobo,currency:"NGN",status:"pending",provider:"squad",provider_reference:ref}).select("id").single();
  if(ie||!row)return reply(409,{error:"payment_record_create_failed"});ledgerId=row.id;
 }else{
  const {data:goal,error}=await admin.from("rent_savings_goals").select("id,estate_id,status,target_date").eq("id",goalId).eq("resident_user_id",auth.user.id).maybeSingle();
  if(error)return reply(503,{error:"savings_goal_lookup_failed"});if(!goal||goal.status!=="active"||!goal.estate_id||!members.some((m)=>m.estate_id===goal.estate_id))return reply(404,{error:"active_savings_goal_not_found"});
  if(goal.target_date&&new Date(`${goal.target_date}T00:00:00Z`).getTime()<=Date.now())return reply(409,{error:"savings_goal_term_ended"});
  estateId=goal.estate_id;amountKobo=requested;table="rent_savings_contributions";
  const {data:row,error:ie}=await admin.from(table).insert({goal_id:goal.id,resident_user_id:auth.user.id,estate_id:estateId,amount_kobo:amountKobo,currency:"NGN",status:"pending",provider:"squad",provider_reference:ref}).select("id").single();
  if(ie||!row)return reply(409,{error:"contribution_record_create_failed"});ledgerId=row.id;
 }
 const base=mode==="live"?"https://api-d.squadco.com":"https://sandbox-api-d.squadco.com";
 try{
  const response=await fetch(`${base}/transaction/initiate`,{method:"POST",headers:{Authorization:`Bearer ${secret}`,"Content-Type":"application/json"},body:JSON.stringify({email:auth.user.email,amount:amountKobo,currency:"NGN",customer_name:profile.full_name,initiate_type:"inline",transaction_ref:ref,payment_channels:["card","bank","ussd","transfer"],pass_charge:false,metadata:{app:"cities-builder-nest",payment_type:type,ledger_id:ledgerId,resident_user_id:auth.user.id,estate_id:estateId}})});
  const result=await response.json(),checkout=result?.data?.checkout_url??result?.checkout_url;
  if(!response.ok||!result?.success||typeof checkout!=="string"||!checkout.startsWith("https://")){await admin.from(table).update({status:"failed"}).eq("id",ledgerId);return reply(502,{error:"squad_checkout_initialization_failed"})}
  return reply(200,{checkoutUrl:checkout,transactionReference:ref,amountKobo,currency:"NGN",environment:mode});
 }catch{await admin.from(table).update({status:"failed"}).eq("id",ledgerId);return reply(502,{error:"squad_unreachable"})}
});