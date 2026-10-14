import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { SupabaseStore } from '../src/lib/store/supabase';
const enabled=process.env.DEVILS_SUPABASE_INTEGRATION_SANDBOX==='true' && ['DEVILS_SUPABASE_URL','DEVILS_SUPABASE_ANON_KEY','DEVILS_SUPABASE_SERVICE_ROLE_KEY','DEVILS_SUPABASE_TEST_USER_A_TOKEN','DEVILS_SUPABASE_TEST_USER_B_TOKEN'].every(name=>!!process.env[name]);
// These are issued sandbox access tokens for two existing invited users. Missing
// bindings mean SKIPPED, not successful auth or policy verification.
describe.skipIf(!enabled)('Supabase sandbox auth and independent RLS',()=>{
 it('verifies two users, isolates direct reads and denies generated-data mutations',async()=>{
   const url=process.env.DEVILS_SUPABASE_URL!;const key=process.env.DEVILS_SUPABASE_ANON_KEY!;
   const a=createClient(url,key,{global:{headers:{Authorization:`Bearer ${process.env.DEVILS_SUPABASE_TEST_USER_A_TOKEN!}`}},auth:{persistSession:false,autoRefreshToken:false}});
   const b=createClient(url,key,{global:{headers:{Authorization:`Bearer ${process.env.DEVILS_SUPABASE_TEST_USER_B_TOKEN!}`}},auth:{persistSession:false,autoRefreshToken:false}});
   const admin=createClient(url,process.env.DEVILS_SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
   const ua=await a.auth.getUser(process.env.DEVILS_SUPABASE_TEST_USER_A_TOKEN!);const ub=await b.auth.getUser(process.env.DEVILS_SUPABASE_TEST_USER_B_TOKEN!);
   expect(ua.error).toBeNull();expect(ub.error).toBeNull();expect(ua.data.user!.id).not.toBe(ub.data.user!.id);
   const userId=ua.data.user!.id;const store=new SupabaseStore(a,admin,userId);const other=new SupabaseStore(b,admin,ub.data.user!.id);const now=new Date().toISOString();
   if(!await store.getProfile(userId))await store.putProfile({id:userId,email:ua.data.user!.email!,disabled:false,deletionState:'none',createdAt:now});
   const session=await store.createSession(userId,{mode:'business',topic:'startup',title:'Sandbox policy verification'},now);
   try {
     expect((await a.from('sessions').select('data').eq('id',session.id)).data).toHaveLength(1);
     expect((await b.from('sessions').select('data').eq('id',session.id)).data).toEqual([]);
     await expect(other.getSession(ub.data.user!.id,session.id)).rejects.toMatchObject({code:'NOT_FOUND'});
     expect((await a.from('sessions').update({data:{...session,revision:999}}).eq('id',session.id)).error).not.toBeNull();
     expect((await b.from('sessions').delete().eq('id',session.id)).error).not.toBeNull();
     expect((await a.from('invites').upsert({user_id:userId,data:{userId,enabled:true,expiresAt:'2999-01-01'}})).error).not.toBeNull();
     expect((await a.rpc('app_store',{p_method:'deleteSession',p_args:{userId,sessionId:session.id},p_owner:userId})).error).not.toBeNull();
     const reserve={userId,sessionId:session.id,operationId:'sandbox-operation',expectedRevision:0,fingerprint:'sandbox',now,leaseExpiresAt:new Date(Date.now()+60000).toISOString()};
     expect((await store.reserveTurn(reserve)).kind).toBe('reserved');expect((await store.reserveTurn(reserve)).kind).toBe('duplicate');
     expect((await b.from('turn_operations').select('data').eq('session_id',session.id)).data).toEqual([]);
     await store.cancelTurn(userId,session.id,reserve.operationId);
   } finally {await store.deleteSession(userId,session.id);}
 },30000);
});
