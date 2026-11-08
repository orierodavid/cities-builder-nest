import { createClient } from "npm:@supabase/supabase-js@2";
const reply=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
async function signature(secret:string,raw:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-512"},false,["sign"]);const bytes=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return reply(405,{error:"method_not_allowed"});
 const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),secret=Deno.env.get("SQUAD_SECRET_KEY"),mode=Deno.env.get("SQUAD_ENVIRONMENT")??"sandbox";
 if(!url||!service||!secret)return reply(503,{error:"webhook_not_configured"});
 const raw=await req.text(),sent=req.headers.get("x-squad-encrypted-body")??req.headers.get("x-squad-signature")??"";
 if(!sent)return reply(401,{error:"missing_squad_signature"});
 const expected=await signature(secret,raw);
 if(!safeEqual(sent.toLowerCase().replace(/^sha512=/,""),expected))return reply(401,{error:"invalid_squad_signature"});
 let event:Record<string,unknown>;try{event=JSON.parse(raw)}catch{return reply(400,{error:"invalid_json"})}
 const eventBody=(event.Body&&typeof event.Body==="object"?event.Body:{}) as Record<string,unknown>;
 const ref=String(event.TransactionRef??eventBody.transaction_ref??"");
 if(!ref||ref.length>120)return reply(400,{error:"transaction_reference_missing"});
 const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
 const [{data:serviceRow,error:se},{data:rentRow,error:re}]=await Promise.all([
  admin.from("service_charge_payments").select("id,amount_kobo,currency,status,resident_user_id,verified_at").eq("provider_reference",ref).maybeSingle(),
  admin.from("rent_savings_contributions").select("id,amount_kobo,currency,status,resident_user_id,verified_at").eq("provider_reference",ref).maybeSingle()
 ]);
 if(se||re)return reply(503,{error:"payment_ledger_lookup_failed"});
 if(serviceRow&&rentRow)return reply(409,{error:"ambiguous_payment_reference"});
 const row=serviceRow??rentRow,table=serviceRow?"service_charge_payments":"rent_savings_contributions";
 if(!row)return reply(200,{received:true,ignored:true});
 if(row.status==="successful"&&row.verified_at)return reply(200,{received:true,duplicate:true});
 const base=mode==="live"?"https://api-d.squadco.com":"https://sandbox-api-d.squadco.com";
 const check=await fetch(`${base}/transaction/verify/${encodeURIComponent(ref)}`,{headers:{Authorization:`Bearer ${secret}`}});
 if(!check.ok)return reply(502,{error:"squad_verification_unavailable"});
 const verified=await check.json(),data=verified?.data;
 if(!verified?.success||!data)return reply(502,{error:"squad_verification_invalid_response"});
 const status=String(data.transaction_status??"").toLowerCase(),amount=Number(data.transaction_amount??data.amount),currency=String(data.transaction_currency_id??data.currency??"").toUpperCase(),verifiedRef=String(data.transaction_ref??"");
 if(!Number.isSafeInteger(amount)||amount<=0||!Number.isSafeInteger(Number(row.amount_kobo))||Number(row.amount_kobo)<=0||verifiedRef!==ref||amount!==Number(row.amount_kobo)||currency!=="NGN")return reply(409,{error:"verified_transaction_mismatch"});
 if(!["success","failed","abandoned","pending"].includes(status))return reply(409,{error:"verified_transaction_status_invalid"});
 const {data:authUser,error:userError}=await admin.auth.admin.getUserById(row.resident_user_id);
 if(userError||!authUser.user?.email||String(data.email??"").toLowerCase()!==authUser.user.email.toLowerCase())return reply(409,{error:"verified_customer_mismatch"});
 if(status!=="success"){
  if(["failed","abandoned"].includes(status)){
   const {error:failureUpdateError}=await admin.from(table).update({status:"failed"}).eq("id",row.id).eq("status","pending");
   if(failureUpdateError)return reply(500,{error:"payment_ledger_update_failed"});
  }
  return reply(200,{received:true,transactionStatus:status});
 }
 const {data:updated,error:updateError}=await admin.from(table).update({status:"successful",provider:"squad",verified_at:new Date().toISOString()}).eq("id",row.id).eq("status","pending").select("id").maybeSingle();
 if(updateError)return reply(500,{error:"payment_ledger_update_failed"});
 return reply(200,{received:true,processed:Boolean(updated)});
});