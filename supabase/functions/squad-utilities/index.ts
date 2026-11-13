import { createClient } from "npm:@supabase/supabase-js@2";

const headers = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS", "Content-Type":"application/json" };
const reply=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers});
const str=(v:unknown)=>typeof v==="string"?v.trim():"";
const services=new Set(["electricity","cable_tv","education","internet","betting"]);
const productServices=new Set(["cable_tv","education","internet"]);
const BILLER_CACHE_TTL_MS=10*60*1000;
let billerCache:{expiresAt:number;billers:Record<string,unknown>[]} | null=null;
let billerCachePromise:Promise<{r:Response;data:Record<string,unknown>;rawBody:string;networkError?:boolean}>|null=null;
const serviceCodes:Record<string,string>={electricity:"ELECTRICITY",cable_tv:"CABLE",education:"EDUCATION",internet:"INTERNET",betting:"BETTING"};
const toKobo=(n:number)=>Math.round(n*100);

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers});
 if(req.method!=="POST")return reply(405,{error:"method_not_allowed"});
 const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY")??Deno.env.get("SUPABASE_PUBLISHABLE_KEY"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),squadKey=Deno.env.get("SQUAD_SECRET_KEY"),mode=Deno.env.get("SQUAD_ENVIRONMENT")??"sandbox";
 if(!url||!anon||!serviceKey||!squadKey)return reply(503,{error:"utilities_not_configured"});
 const jwt=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"");
 if(!jwt)return reply(401,{error:"authentication_required"});
 const userClient=createClient(url,anon,{auth:{autoRefreshToken:false,persistSession:false},global:{headers:{Authorization:`Bearer ${jwt}`}}});
 const {data:auth,error:authError}=await userClient.auth.getUser(jwt);
 if(authError||!auth.user)return reply(401,{error:"invalid_session"});
 const admin=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
 const {data:members,error:memberError}=await admin.from("estate_memberships").select("estate_id").eq("user_id",auth.user.id).eq("membership_role","resident").eq("status","active");
 if(memberError)return reply(503,{error:"membership_lookup_failed"});
 const estates=(members??[]).map(x=>x.estate_id);
 if(!estates.length)return reply(403,{error:"active_resident_membership_required"});
 let input:Record<string,unknown>;try{input=await req.json()}catch{return reply(400,{error:"invalid_json"})}
 const action=str(input.action),service=str(input.service),provider=str(input.provider).toUpperCase();
 const base=mode==="live"?"https://api-d.squadco.com":"https://sandbox-api-d.squadco.com";
 const squad=async(path:string,method="GET",body?:Record<string,unknown>):Promise<{r:Response;data:Record<string,unknown>;rawBody:string;networkError?:boolean}>=>{
  try{
   const finalUrl=new URL(path,base).toString();
   const requestHeaders={Authorization:`Bearer ${squadKey}`,"Content-Type":"application/json"};
   console.info("[squad-utilities] outgoing request",JSON.stringify({url:finalUrl,method,headers:{Authorization:"Bearer [MASKED]","Content-Type":"application/json"}}));
   const r=await fetch(finalUrl,{method,headers:requestHeaders,...(body?{body:JSON.stringify(body)}:{})});
   const raw=await r.text();
   let data:Record<string,unknown>={};
   if(raw){try{const parsed=JSON.parse(raw);if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))data=parsed as Record<string,unknown>;else data={response_type:Array.isArray(parsed)?"array":typeof parsed};}catch{data={message:"Squad returned a non-JSON response."};}}
   if(!r.ok)console.error("[squad-utilities] upstream failure",JSON.stringify({url:base+path,method,status:r.status,responseBody:raw}));
   else console.info("[squad-utilities] upstream success",JSON.stringify({url:base+path,method,status:r.status}));
   return {r,data,rawBody:raw};
  }catch(error){
   const detail=error instanceof Error?{name:error.name,message:error.message.slice(0,240)}:{name:"UnknownError"};
   console.error("[squad-utilities] upstream request failed",JSON.stringify({path,method,detail}));
   return {r:new Response(null,{status:502}),data:{message:detail.message??"Squad utility service is temporarily unreachable."},rawBody:JSON.stringify(detail),networkError:true};
  }
 };
 const nested=(d:Record<string,unknown>)=>d.data&&typeof d.data==="object"&&!Array.isArray(d.data)?d.data as Record<string,unknown>:d;
 const rowsAt=(v:unknown):Record<string,unknown>[]=>Array.isArray(v)?v as Record<string,unknown>[]:[];
 const billerRows=(d:Record<string,unknown>)=>rowsAt(nested(d).billers);
 const getCachedBillers=async()=>{
  if(billerCache&&billerCache.expiresAt>Date.now())return {ok:true as const,billers:billerCache.billers};
  if(!billerCachePromise){
   billerCachePromise=squad("/v1/service/billers","GET").finally(()=>{billerCachePromise=null;});
  }
  const result=await billerCachePromise;
  if(!result.r.ok)return {ok:false as const,result};
  const billers=billerRows(result.data);
  billerCache={billers,expiresAt:Date.now()+BILLER_CACHE_TTL_MS};
  return {ok:true as const,billers};
 };
 const productRows=(d:Record<string,unknown>)=>rowsAt(nested(d).products).length?rowsAt(nested(d).products):rowsAt(nested(d).bouquets).length?rowsAt(nested(d).bouquets):rowsAt(d.products).length?rowsAt(d.products):rowsAt(d.bouquets);
 const message=(d:Record<string,unknown>,fallback:string)=>str(d.message)||fallback;

 if(action==="billers"){
  if(!services.has(service))return reply(400,{error:"unsupported_utility_service"});
  const catalogue=await getCachedBillers();
  if(!catalogue.ok){
   const {r,data,rawBody,networkError}=catalogue.result;
   const upstreamMessage=message(data,"Squad provider catalogue request failed.");
   return reply(r.status,{error:"billers_unavailable",message:upstreamMessage,upstream:{url:base+"/v1/service/billers",method:"GET",status:r.status,message:upstreamMessage,body:rawBody,networkError:!!networkError}});
  }
  const groups=catalogue.billers;
  const group=groups.find(x=>str(x.code).toUpperCase()===serviceCodes[service]);
  const rawProviders=rowsAt(group?.providers);
  console.info("[squad-utilities] biller catalogue",JSON.stringify({service:serviceCodes[service],groupCodes:groups.map(x=>str(x.code).toUpperCase()).filter(Boolean),matchedGroup:Boolean(group),providerCount:rawProviders.length}));
  const providers=rawProviders.map(x=>({code:str(x.code),name:str(x.name)||str(x.code),type:x.type??null,total_rate_percent:x.total_rate_percent??null,total_rate_cap:x.total_rate_cap??null})).filter(x=>x.code&&x.name);
  return reply(200,{billers:providers,service:serviceCodes[service],providerCount:providers.length,cachedUntil:billerCache?.expiresAt??null});
 }
 if(action==="products"){
  if(!productServices.has(service)||!provider)return reply(400,{error:"invalid_product_request"});
  const {r,data,rawBody}=service==="cable_tv" ? await squad("/v1/service/cable/bouquet-list","POST",{provider}) : await squad("/v1/service/products","POST",{service:serviceCodes[service],provider});
  if(!r.ok)return reply(502,{error:"products_unavailable",message:message(data,"Products could not be loaded."),upstream:{url:base+"/v1/service/products",status:r.status,body:rawBody}});
  return reply(200,{products:productRows(data)});
 }
 if(action==="lookup"){
  if(!services.has(service)||!provider)return reply(400,{error:"invalid_lookup_request"});
  const estateId=str(input.estateId),identifier=str(input.customerIdentifier),meterType=str(input.meterType).toLowerCase();
  if(!estates.includes(estateId)||!/^[A-Za-z0-9@._+-]{5,40}$/.test(identifier)||(service==="electricity"&&!["prepaid","postpaid"].includes(meterType)))return reply(400,{error:"invalid_customer_details"});
  const productCode=str(input.productCode);
  const body:Record<string,unknown>=service==="cable_tv" ? {provider,smartcard_number:identifier} : {service:serviceCodes[service],provider,customer_identifier:identifier};
  if(service==="electricity")body.meter_type=meterType;
  if(service==="education"&&productCode)body.product_code=productCode;
  if(service==="education"&&!productCode)return reply(400,{error:"product_required_for_lookup",message:"Select an examination product before verifying the account."});
  const {r,data,rawBody}=service==="cable_tv" ? await squad("/v1/service/cable/lookup","POST",body) : await squad("/v1/service/lookup","POST",body);
  const details=(data.data&&typeof data.data==="object"?data.data:data) as Record<string,unknown>;
  const token=str(details.validation_token)||str(details.reference);
  if(!r.ok||!token)return reply(422,{error:"customer_lookup_failed",message:message(data,"Could not retrieve account information. Check the provider and customer number."),upstream:{url:base+"/v1/service/lookup",status:r.status,body:rawBody}});
  const {data:saved,error}=await admin.from("utility_validations").insert({
   resident_user_id:auth.user.id,estate_id:estateId,service,provider,customer_identifier:identifier,
   meter_type:service==="electricity"?meterType:null,validation_token:token,customer_name:str(details.customer_name)||null,minimum_vend:details.minimum_vend==null?null:Number(details.minimum_vend),
   expires_at:new Date(Date.now()+10*60*1000).toISOString(),status:"validated"
  }).select("id").single();
  if(error||!saved)return reply(503,{error:"lookup_save_failed"});
  return reply(200,{validationId:saved.id,service,provider,customerIdentifier:identifier,customerName:details.customer_name??null,minimumVend:details.minimum_vend??null,accountDetails:details,expiresAt:new Date(Date.now()+10*60*1000).toISOString()});
 }
 if(action==="vend"){
  const validationId=str(input.validationId),phone=str(input.phone),email=str(input.email),productCode=str(input.productCode),amount=Number(input.amount);
  if(!validationId||!/^\+?[0-9]{8,15}$/.test(phone)||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))return reply(400,{error:"invalid_purchase_details"});
  const {data:v,error:ve}=await admin.from("utility_validations").select("*").eq("id",validationId).eq("resident_user_id",auth.user.id).eq("status","validated").gt("expires_at",new Date().toISOString()).maybeSingle();
  if(ve||!v)return reply(409,{error:"lookup_expired_or_already_used"});
  if(v.service==="electricity"&&(!Number.isFinite(amount)||amount<100||(v.minimum_vend!=null&&amount<Number(v.minimum_vend))))return reply(400,{error:"invalid_electricity_amount"});
  let selectedProduct:Record<string,unknown>|null=null;
  if(productServices.has(v.service)){
   if(!productCode)return reply(400,{error:"select_product"});
   const {r:pr,data:pd}=await squad("/v1/service/products","POST",{service:serviceCodes[v.service],provider:v.provider});
   if(!pr.ok)return reply(502,{error:"products_unavailable",message:message(pd,"Could not verify selected product.")});
   selectedProduct=productRows(pd).find(p=>str(p.code)===productCode)??null;
   if(!selectedProduct)return reply(400,{error:"invalid_product_code"});
  }
  if(v.service==="betting"&&(!Number.isFinite(amount)||amount<100))return reply(400,{error:"invalid_betting_amount"});
  // Claim the single-use lookup before calling Squad to prevent concurrent duplicate vends.
  const {data:claimed,error:claimError}=await admin.from("utility_validations").update({status:"used",used_at:new Date().toISOString()}).eq("id",v.id).eq("status","validated").select("id").maybeSingle();
  if(claimError||!claimed)return reply(409,{error:"lookup_already_consumed"});
  const ref=`CBN-${crypto.randomUUID()}`;
  const rawProductAmount=Number(selectedProduct?.kobo_amount??selectedProduct?.amount_kobo??selectedProduct?.amount??selectedProduct?.price??0);
  const productAmount=Number(selectedProduct?.kobo_amount??selectedProduct?.amount_kobo)?rawProductAmount/100:rawProductAmount;
  const purchaseAmount=productServices.has(v.service)?productAmount:amount;
  const {data:tx,error:txError}=await admin.from("utility_transactions").insert({
   resident_user_id:auth.user.id,estate_id:v.estate_id,validation_id:v.id,service:v.service,provider:v.provider,
   customer_identifier:v.customer_identifier,merchant_reference:ref,amount_kobo:toKobo(purchaseAmount),currency:"NGN",
   status:"pending",provider_status:"SUBMITTING",product_code:productCode||null
  }).select("id").single();
  if(txError||!tx)return reply(503,{error:"transaction_record_failed"});
  const vendBody:Record<string,unknown>=v.service==="cable_tv" ? {provider:v.provider,reference:v.validation_token,bouquet_code:productCode,phone_number:phone,email} : {validation_token:v.validation_token,merchant_reference:ref,customer:{phone_number:phone,...(email?{email}:{})}};
  if(v.service!=="cable_tv"){if(productServices.has(v.service))vendBody.products=[{code:productCode,quantity:1}];else vendBody.amount=productServices.has(v.service)?purchaseAmount:amount;}
  try{
   const {r,data,rawBody}=v.service==="cable_tv" ? await squad("/v1/service/cable/vend","POST",vendBody) : await squad("/v1/service/vend","POST",vendBody);
   const result=(data.data&&typeof data.data==="object"?data.data:data) as Record<string,unknown>;
   const ps=str(result.processed_status??result.status??data.status).toUpperCase();
   const status=r.status===202||ps==="PENDING"||(v.service==="cable_tv"&&r.ok&&data.success===true&&!ps)?"pending":r.ok&&data.success===true&&["SUCCESS","SUCCESSFUL"].includes(ps)?"successful":"failed";
   await admin.from("utility_transactions").update({status,provider_status:ps||String(r.status),provider_response:data,receipt:result.token??result.receipt??null,updated_at:new Date().toISOString()}).eq("id",tx.id);
   const transaction={merchantReference:ref,status,amountKobo:toKobo(purchaseAmount),receipt:result.token??result.receipt??null,message:message(data,status==="pending"?"Purchase is processing.":"Purchase could not be completed.")};
   if(!r.ok&&r.status!==202)return reply(422,{error:"vend_failed",message:message(data,"The utility purchase failed."),upstream:{url:base+"/v1/service/vend",status:r.status,body:rawBody},transaction});
   return reply(status==="pending"?202:200,{transaction});
  }catch{
   await admin.from("utility_transactions").update({provider_status:"SUBMISSION_UNKNOWN",updated_at:new Date().toISOString()}).eq("id",tx.id);
   return reply(202,{transaction:{merchantReference:ref,status:"pending"},message:"Purchase submitted; confirmation is pending. Do not submit it again."});
  }
 }
 if(action==="status"){
  const reference=str(input.merchantReference);
  if(!reference)return reply(400,{error:"merchant_reference_required"});
  const {data:row,error}=await admin.from("utility_transactions").select("*").eq("resident_user_id",auth.user.id).eq("merchant_reference",reference).maybeSingle();
  if(error||!row)return reply(404,{error:"transaction_not_found"});
  if(row.status==="pending"){
   const {data:validation}=await admin.from("utility_validations").select("validation_token").eq("id",row.validation_id).eq("resident_user_id",auth.user.id).maybeSingle();\n   const providerReference=row.service==="cable_tv"?str(validation?.validation_token):reference;\n   const {r,data}=await squad(`/v1/service/transactions/${encodeURIComponent(providerReference)}`);
   if(r.ok){
    const result=(data.data&&typeof data.data==="object"?data.data:data) as Record<string,unknown>;
    const ps=str(result.processed_status??result.status).toUpperCase();
    const status=ps==="SUCCESS"?"successful":["FAILED","FAILURE"].includes(ps)?"failed":"pending";
    const {data:updated}=await admin.from("utility_transactions").update({status,provider_status:ps||"PENDING",provider_response:data,receipt:result.token??result.receipt??row.receipt,updated_at:new Date().toISOString()}).eq("id",row.id).eq("status","pending").select("*").maybeSingle();
    if(updated)return reply(200,{transaction:updated});
   }
  }
  return reply(200,{transaction:row});
 }
 if(action==="history"){
  const {data,error}=await admin.from("utility_transactions").select("id,service,provider,customer_identifier,merchant_reference,product_code,amount_kobo,currency,status,provider_status,receipt,created_at").eq("resident_user_id",auth.user.id).order("created_at",{ascending:false}).limit(50);
  if(error)return reply(503,{error:"history_unavailable"});
  return reply(200,{transactions:data??[]});
 }
 return reply(400,{error:"unsupported_action"});
});
