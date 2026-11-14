import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { createEstateEvent, updateEstateEvent } from "./estate-event-mutations.repository.js";
function mockClient(responses: unknown[][]) {
 const calls: Array<{sql:string;values:unknown[]}> = [];
 const client = { query: async (sql:string, values:unknown[] = []) => { calls.push({sql,values}); return {rows:responses[calls.length-1] ?? [],rowCount:0} as QueryResult; } } as unknown as PoolClient;
 return {client,calls};
}
const event = {id:"ev1",estate_id:"e1",title:"Town Hall",description:"Details",venue:"Main Hall",venue_id:"v1",venue_approval_status:"pending",starts_at:"2030-01-01T10:00:00Z",ends_at:"2030-01-01T11:00:00Z",status:"draft",created_by:"u1",created_at:"now",updated_at:"now"};
test("event creation checks venue availability and records pending approval", async()=>{
 const venue={id:"v1",name:"Main Hall",location:"Block A",status:"available"};
 const {client,calls}=mockClient([[venue],[event]]);
 const result=await createEstateEvent(client,{estateId:"e1",creatorUserId:"u1",title:"Town Hall",description:"Details",venueId:"v1",venueLabel:"Main Hall",startsAt:event.starts_at,endsAt:event.ends_at,status:"published",requestedAt:"now"});
 assert.deepEqual(result,{kind:"created",event});
 assert.deepEqual(calls[0].values,["v1","e1"]);
 assert.match(calls[1].sql,/INSERT INTO public\.estate_events/);
 assert.deepEqual(calls[1].values,["e1","Town Hall","Details","Main Hall · Block A","v1","pending","now",true,event.starts_at,event.ends_at,"draft","u1"]);
});
test("event creation rejects a venue that is unavailable",async()=>{
 const {client,calls}=mockClient([[{id:"v1",name:"Hall",location:null,status:"booked"}]]);
 const result=await createEstateEvent(client,{estateId:"e1",creatorUserId:"u1",title:"Town Hall",description:"",venueId:"v1",venueLabel:"Hall",startsAt:event.starts_at,endsAt:event.ends_at,status:"draft",requestedAt:"now"});
 assert.deepEqual(result,{kind:"venue_unavailable"}); assert.equal(calls.length,1);
});
test("home event is immediately approved and can be published",async()=>{
 const published={...event,venue:"Home / Private Residence",venue_id:null,venue_approval_status:"approved",status:"published"};
 const {client,calls}=mockClient([[published]]);
 const result=await createEstateEvent(client,{estateId:"e1",creatorUserId:"u1",title:"Town Hall",description:"",venueId:"home",venueLabel:"Home / Private Residence",startsAt:event.starts_at,endsAt:event.ends_at,status:"published",requestedAt:"now"});
 assert.deepEqual(result,{kind:"created",event:published}); assert.equal(calls.length,1);
 assert.deepEqual(calls[0].values,["e1","Town Hall","","Home / Private Residence",null,"approved",null,false,event.starts_at,event.ends_at,"published","u1"]);
});
test("event update locks the event and blocks publishing while venue approval is pending",async()=>{
 const {client,calls}=mockClient([[{venue_approval_status:"pending"}]]);
 const result=await updateEstateEvent(client,{estateId:"e1",eventId:"ev1",title:"Town Hall",description:"",venue:"Hall",startsAt:event.starts_at,endsAt:event.ends_at,status:"published",updatedAt:"now"});
 assert.deepEqual(result,{kind:"venue_pending"}); assert.equal(calls.length,1); assert.match(calls[0].sql,/FOR UPDATE/);
});
test("event update writes only within the estate and returns the updated event",async()=>{
 const updated={...event,title:"Updated"};
 const {client,calls}=mockClient([[{venue_approval_status:"approved"}],[updated]]);
 const result=await updateEstateEvent(client,{estateId:"e1",eventId:"ev1",title:"Updated",description:"",venue:"Hall",startsAt:event.starts_at,endsAt:event.ends_at,status:"published",updatedAt:"later"});
 assert.deepEqual(result,{kind:"updated",event:updated}); assert.equal(calls.length,2); assert.match(calls[1].sql,/WHERE estate_id = \$1 AND id = \$2/);
});
test("event update returns not_found when RLS or estate scope hides the event",async()=>{
 const {client,calls}=mockClient([[]]);
 const result=await updateEstateEvent(client,{estateId:"e1",eventId:"missing",title:"Updated",description:"",venue:"Hall",startsAt:event.starts_at,endsAt:event.ends_at,status:"draft",updatedAt:"later"});
 assert.deepEqual(result,{kind:"not_found"}); assert.equal(calls.length,1);
});
