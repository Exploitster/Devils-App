import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SupabaseStore } from '../src/lib/store/supabase';

// Explicit opt-in: creates synthetic confirmed users WITHOUT sending email.
// Cleanup touches only IDs created by this invocation; existing users are untouched.
if (!process.argv.includes('--sandbox')) throw new Error('Use --sandbox only with a dedicated development project.');
try { process.loadEnvFile('.env.local'); } catch {}
const url=process.env.DEVILS_SUPABASE_URL;
const anon=process.env.DEVILS_SUPABASE_ANON_KEY;
const privileged=process.env.DEVILS_SUPABASE_SERVICE_ROLE_KEY;
if(!url||!anon||!privileged)throw new Error('Supabase configuration is missing.');
const admin=createClient(url,privileged,{auth:{persistSession:false,autoRefreshToken:false}});
const ids:string[]=[];
const checks:string[]=[];
let stage='create synthetic users';
let failed=false;
try{
 const users:{client:SupabaseClient;store:SupabaseStore;userId:string}[]=[];
 for(let i=0;i<2;i++){
  const email=`devils-mvp-${randomUUID()}@example.test`;const password=randomUUID()+randomUUID();
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
  assert.equal(created.error,null,'Synthetic auth user creation failed.');
  ids.push(created.data.user!.id);
  const client:SupabaseClient=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const login=await client.auth.signInWithPassword({email,password});
  assert.equal(login.error,null,'Synthetic user sign-in failed.');
  const userId=created.data.user!.id;
  const store=new SupabaseStore(client,admin,userId);
  await store.putProfile({id:userId,email,disabled:false,deletionState:'none',createdAt:new Date().toISOString()});
  users.push({client,store,userId});
 }
 checks.push('two distinct users authenticate against hosted Supabase');
 const [a,b]=users;stage='hosted owner isolation';
 const now=new Date().toISOString();
 const session=await a.store.createSession(a.userId,{mode:'business',topic:'startup',title:'Synthetic MVP isolation check'},now);
 assert.equal((await a.store.getSession(a.userId,session.id)).id,session.id);
 const foreign=await b.client.from('sessions').select('id').eq('id',session.id);
 assert.equal(foreign.error,null);assert.deepEqual(foreign.data,[]);
 await assert.rejects(b.store.getSession(b.userId,session.id));
 assert.ok((await a.client.from('sessions').update({data:{...session,revision:999}}).eq('id',session.id)).error);
 checks.push('owner read succeeds; second-user direct/RPC reads and generated-state writes are denied');
 stage='hosted atomic operations';
 const request={userId:a.userId,sessionId:session.id,operationId:randomUUID(),expectedRevision:0,fingerprint:'synthetic-only',now,leaseExpiresAt:new Date(Date.now()+60000).toISOString()};
 assert.equal((await a.store.reserveTurn(request)).kind,'reserved');
 assert.equal((await a.store.reserveTurn(request)).kind,'duplicate');
 await a.store.cancelTurn(a.userId,session.id,request.operationId);
 assert.equal((await a.store.getOperation(a.userId,session.id,request.operationId))?.status,'cancelled');
 checks.push('hosted operation reservation, identical retry and cancellation persist correctly');
 stage='disabled-account RLS';
 await a.store.beginAccountDeletion(a.userId);
 const disabled=await a.client.from('sessions').select('id').eq('id',session.id);
 assert.equal(disabled.error,null);assert.deepEqual(disabled.data,[]);
 assert.equal((await a.store.getProfile(a.userId))?.deletionState,'pending');
 checks.push('disabled account cannot read private sessions; closure retry profile remains readable');
 stage='hosted deletion';
 await a.store.deleteAccountData(a.userId);
 const remaining=await admin.from('sessions').select('id').eq('user_id',a.userId);
 assert.equal(remaining.error,null);assert.deepEqual(remaining.data,[]);
 checks.push('hosted deletion removes synthetic private session data');
}catch{
 failed=true;console.error(`Hosted Supabase check failed during: ${stage}. No credential values are logged.`);
}finally{
 for(const id of ids){
  for(const table of ['sessions','invites','subscriptions','billing_context','spend_attempts','submissions','profiles']){
   const removed=await admin.from(table).delete().eq('user_id',id);
   if(removed.error){failed=true;console.error(`Cleanup requires attention for a synthetic ${table} record.`);}
  }
  const deleted=await admin.auth.admin.deleteUser(id);
  if(deleted.error){failed=true;console.error('Cleanup requires attention for a synthetic authentication user.');}
 }
 mkdirSync('.local/evaluations',{recursive:true});
 writeFileSync('.local/evaluations/supabase-latest.json',JSON.stringify({passed:!failed,checks,syntheticUsersCreated:ids.length,syntheticUserIds:failed?ids:undefined,existingUsersModified:0,emailSent:false},null,2));
 console.log(`${checks.length} hosted Supabase checks passed. Synthetic users ${failed?'require report review':'cleaned up'}. No email sent.`);
 if(failed)process.exitCode=1;
}
