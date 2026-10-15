import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GET as health } from '../src/app/api/health/route';
import { GET as account, DELETE as closeAccount } from '../src/app/api/account/route';
import { POST as signIn } from '../src/app/api/auth/route';
import { DELETE as deleteSession } from '../src/app/api/sessions/[id]/route';
import { getStore } from '../src/lib/auth/service';
import { SafeUrlSchema } from '../src/lib/contracts';
import { logEvent, type LogFields } from '../src/lib/logging';
const origin='http://127.0.0.1:3000';let dir:string;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'devils-security-'));vi.stubEnv('DEVILS_RUNTIME_MODE','local');vi.stubEnv('DEVILS_LOCAL_AUTH_SECRET','fake-local-secret-'.repeat(3));vi.stubEnv('DEVILS_SQLITE_PATH',join(dir,'test.sqlite'));vi.stubEnv('DEVILS_APP_URL',origin);vi.stubEnv('NODE_ENV','test');});
afterEach(()=>{vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});});
async function login(email='alex@example.test'){const res=await signIn(new Request(origin+'/api/auth',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email})}));expect(res.status).toBe(200);return res.headers.get('set-cookie')!.split(';')[0];}
function mutation(cookie:string,body:unknown,headers:Record<string,string>={}){return new Request(origin+'/api/account',{method:'DELETE',headers:{origin,cookie,'content-type':'application/json',...headers},body:JSON.stringify(body)});}
it('rejects forged deletion, excessive body and authority fields before touching the account',async()=>{
 const cookie=await login();
 expect((await closeAccount(mutation(cookie,{confirmation:'DELETE'},{origin:'https://attacker.test'}))).status).toBe(403);
 expect((await closeAccount(mutation(cookie,{confirmation:'DELETE'},{'sec-fetch-site':'cross-site'}))).status).toBe(403);
 expect((await closeAccount(mutation(cookie,{confirmation:'DELETE'},{'content-length':'99999'}))).status).toBe(413);
 expect((await closeAccount(mutation(cookie,{confirmation:'DELETE',userId:'local-sam'}))).status).toBe(400);
 expect((await closeAccount(mutation(cookie,{confirmation:'cancel'}))).status).toBe(400);
 expect((await account(new Request(origin+'/api/account',{headers:{cookie}}))).status).toBe(200);
 expect((await closeAccount(mutation('',{confirmation:'DELETE'}))).status).toBe(401);
});
it('returns the same missing response for foreign session deletion and revokes all account cookies on closure',async()=>{
 const cookie=await login();const req=new Request(origin+'/api/account',{headers:{cookie}});const store=await getStore(req);const s=await store.createSession('local-alex',{mode:'business',topic:'work'},new Date().toISOString());const other=await login('sam@example.test');
 const request=(id:string)=>deleteSession(new Request(origin+'/api/sessions/'+id,{method:'DELETE',headers:{origin,cookie:other}}),{params:Promise.resolve({id})});
 const foreign=await request(s.id);const missing=await request('missing');expect(foreign.status).toBe(404);expect(await foreign.json()).toEqual(await missing.json());
 const result=await closeAccount(mutation(cookie,{confirmation:'DELETE'}));expect(result.status).toBe(200);expect(await result.json()).toEqual({deleted:true});expect(result.headers.get('set-cookie')).toContain('Max-Age=0');
 expect((await account(req)).status).toBe(401);expect((await account(new Request(origin+'/api/account',{headers:{cookie:other}}))).status).toBe(200);
});
it('exposes only configuration readiness and rejects production local mode without leaking settings',async()=>{
 const ready=await health();expect(await ready.json()).toEqual({status:'ok',runtimeMode:'local',configured:true});
 vi.stubEnv('NODE_ENV','production');const unsafe=await health();expect(unsafe.status).toBe(503);expect(await unsafe.json()).toEqual({status:'unconfigured',configured:false});
 vi.stubEnv('DEVILS_RUNTIME_MODE','services');vi.stubEnv('DEVILS_MODEL_API_KEY','secret-value');vi.stubEnv('DEVILS_SUPABASE_SERVICE_ROLE_KEY','secret-role');const response=await health();expect(response.status).toBe(503);expect(await response.text()).not.toMatch(/secret-value|secret-role|DEVILS_/);
});
it('drops raw logs, invalid codes, emails and unsafe source URLs',()=>{
 const lines:string[]=[];logEvent('generation_failed',{id:'person@example.test',code:'secret prompt',elapsedMs:12,costMicros:3,error:new Error('secret'),cookie:'secret',prompt:'secret'} as LogFields,line=>lines.push(line));
 expect(JSON.parse(lines[0])).toEqual({event:'generation_failed',elapsedMs:12,costMicros:3});expect(lines.join('')).not.toMatch(/secret|example|cookie|prompt/);
 for(const url of ['javascript:alert(1)','data:text/html,<script>','http://unsafe.test'])expect(SafeUrlSchema.safeParse(url).success).toBe(false);
});
