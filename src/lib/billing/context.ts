import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { RuntimeConfig } from '../config';
export interface BillingContext { userId:string; token:string; plan:'monthly'|'yearly'; expiresAt:number; customerId?:string; subscriptionId?:string; localStatus?:'active'|'canceled'; periodEnd?:number; cancelAtPeriodEnd?:boolean; }
export interface BillingPersistence { get(userId:string):Promise<BillingContext|null>; claim(value:BillingContext):Promise<BillingContext>; save(value:BillingContext):Promise<void>; findCustomer(id:string):Promise<BillingContext|null>; }
export function billingPersistence(config:RuntimeConfig):BillingPersistence {
 if(config.mode==='local') {mkdirSync(dirname(config.sqlitePath),{recursive:true});const db=new DatabaseSync(config.sqlitePath);db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS billing_context(user_id TEXT PRIMARY KEY,data TEXT NOT NULL);');
 const get=(id:string)=>{const row=db.prepare('SELECT data FROM billing_context WHERE user_id=?').get(id) as {data:string}|undefined;return row?JSON.parse(row.data) as BillingContext:null;};
 const save=(v:BillingContext)=>{db.prepare('INSERT INTO billing_context VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data').run(v.userId,JSON.stringify(v));};
 return {async get(id){return get(id);},async save(v){save(v);},async claim(v){db.exec('BEGIN IMMEDIATE');try{const old=get(v.userId);const next=old&&old.expiresAt>Date.now()?old:{...v,customerId:old?.customerId};save(next);db.exec('COMMIT');return next;}catch(e){db.exec('ROLLBACK');throw e;}},async findCustomer(id){const rows=db.prepare('SELECT data FROM billing_context').all() as {data:string}[];return rows.map(r=>JSON.parse(r.data) as BillingContext).find(v=>v.customerId===id)??null;}};
 }
 const client=createClient(config.supabaseUrl,config.supabaseServiceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
 async function rpc(action:string,value:unknown):Promise<BillingContext|null>{const {data,error}=await client.rpc('billing_context_operation',{action,value});if(error)throw new Error('Billing persistence unavailable');return data as BillingContext|null;}
 return {get:id=>rpc('get',{userId:id}),claim:async v=>(await rpc('claim',v))!,save:async v=>{await rpc('save',v);},findCustomer:id=>rpc('customer',{customerId:id})};
}
