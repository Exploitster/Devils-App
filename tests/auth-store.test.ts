import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStore } from '../src/lib/store/local';
import { LocalAuth } from '../src/lib/auth/local';
import { readConfig } from '../src/lib/config';
import { DatabaseSync } from 'node:sqlite';

let directory: string; let store: LocalStore;
const now = '2026-10-14T15:00:00.000Z';
const profile = (id: string) => ({ id, email: `${id}@example.test`, disabled: false, deletionState: 'none' as const, createdAt: now });
beforeEach(async () => { directory = mkdtempSync(join(tmpdir(), 'devils-u2-')); store = new LocalStore(join(directory, 'store.sqlite')); await store.putProfile(profile('a')); await store.putProfile(profile('b')); });
afterEach(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
describe('durable owner-scoped store', () => {
  it('fences an expired billing reconciler before committing its receipt', async () => {
    const db = new DatabaseSync(join(directory, 'store.sqlite'));
    db.exec('CREATE TABLE IF NOT EXISTS billing_sync_leases(customer_id TEXT PRIMARY KEY, token TEXT NOT NULL, expires_at INTEGER NOT NULL)');
    db.prepare('INSERT INTO billing_sync_leases VALUES(?,?,?)').run('cus_fenced', 'replacement', Date.now() + 60000);
    db.close();
    await store.beginWebhook('evt_fenced', new Date().toISOString(), new Date(Date.now() + 60000).toISOString());
    await expect(store.completeWebhook('evt_fenced', null, { customerId: 'cus_fenced', token: 'stale' })).rejects.toMatchObject({ code: 'BILLING_SYNC_CONFLICT' });
    await store.completeWebhook('evt_fenced', null, { customerId: 'cus_fenced', token: 'replacement' });
    expect(await store.beginWebhook('evt_fenced', new Date().toISOString(), new Date(Date.now() + 60000).toISOString())).toBe('duplicate');
  });
  it('denies foreign read, rename, delete, reservation and survives restart', async () => {
    const s = await store.createSession('a', { mode: 'philosophy', topic: 'life' }, now);
    expect(await store.listSessions('b')).toEqual([]);
    for (const action of [() => store.getSession('b', s.id), () => store.renameSession('b', s.id, 'stolen', 0, now), () => store.deleteSession('b', s.id), () => store.reserveTurn({userId:'b',sessionId:s.id,operationId:'bad',expectedRevision:0,fingerprint:'x',now,leaseExpiresAt:'2026-10-14T15:01:00.000Z'})]) await expect(action()).rejects.toMatchObject({code:'NOT_FOUND',status:404});
    await store.renameSession('a', s.id, 'Durable', 0, now); store.close(); store = new LocalStore(join(directory, 'store.sqlite'));
    expect(await store.getSession('a',s.id)).toMatchObject({title:'Durable',revision:1,mode:'philosophy'});
    await store.deleteSession('a',s.id); await expect(store.getSession('a',s.id)).rejects.toMatchObject({code:'NOT_FOUND'});
  });
  it('reserves once, rejects changed duplicates and stale revisions, commits usage once', async () => {
    const s = await store.createSession('a',{mode:'business',topic:'startup'},now);
    const reserve={userId:'a',sessionId:s.id,operationId:'one',expectedRevision:0,fingerprint:'fp',now,leaseExpiresAt:'2026-10-14T15:01:00.000Z'};
    expect((await store.reserveTurn(reserve)).kind).toBe('reserved'); expect((await store.reserveTurn(reserve)).kind).toBe('duplicate');
    await expect(store.reserveTurn({...reserve,fingerprint:'changed'})).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
    await expect(store.reserveTurn({...reserve,operationId:'two'})).rejects.toMatchObject({code:'TURN_IN_PROGRESS'});
    const commit={...reserve,state:s.state,messages:[{id:'m',role:'assistant' as const,text:'A response',createdAt:now,citations:[]}],usage:{inputTokens:1,outputTokens:2,costMicros:3}};
    expect((await store.commitTurn(commit)).revision).toBe(1); expect((await store.commitTurn(commit)).revision).toBe(1); expect(await store.listUsage('a',now)).toHaveLength(1);
    await expect(store.reserveTurn({...reserve,operationId:'stale'})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
  });
  it('cancellation, failed reservations and leases do not mutate sessions or escape limits', async () => {
    const s = await store.createSession('a',{mode:'business',topic:'work'},now);
    const r={userId:'a',sessionId:s.id,operationId:'0',expectedRevision:0,fingerprint:'fp',now,leaseExpiresAt:'2026-10-14T15:01:00.000Z'};
    await store.reserveTurn(r); await store.cancelTurn('a',s.id,'0');
    await expect(store.commitTurn({...r,state:s.state,messages:[],usage:{inputTokens:0,outputTokens:0,costMicros:0}})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
    for(let i=1;i<10;i++){await store.reserveTurn({...r,operationId:String(i)}); await store.failTurn('a',s.id,String(i),'FAILED');}
    await expect(store.reserveTurn({...r,operationId:'limit'})).rejects.toMatchObject({code:'RATE_LIMITED'});
    await store.reserveTurn({...r,operationId:'later',now:'2026-10-14T15:02:00.000Z',leaseExpiresAt:'2026-10-14T15:03:00.000Z'});
    await store.reserveTurn({...r,operationId:'recovered',now:'2026-10-14T15:04:00.000Z',leaseExpiresAt:'2026-10-14T15:05:00.000Z'});
    expect((await store.getOperation('a',s.id,'later'))?.status).toBe('failed');
  });
  it('deletion blocks late commit and retains conservative provider spend', async () => {
    const s=await store.createSession('a',{mode:'business',topic:'startup'},now);
    const r={userId:'a',sessionId:s.id,operationId:'op',expectedRevision:0,fingerprint:'fp',now,leaseExpiresAt:'2026-10-14T15:01:00.000Z'};
    await store.reserveTurn(r); await store.reserveSpend({id:'attempt',operationId:'op',userId:'a',reservedMicros:10,createdAt:now},10);
    await expect(store.reserveSpend({id:'more',operationId:'op',userId:'a',reservedMicros:1,createdAt:now},10)).rejects.toMatchObject({code:'SPEND_LIMIT'});
    await store.beginAccountDeletion('a'); await store.deleteAccountData('a'); await expect(store.commitTurn({...r,state:s.state,messages:[],usage:{inputTokens:0,outputTokens:0,costMicros:0}})).rejects.toMatchObject({code:'NOT_FOUND'});
    expect(await store.getProfile('a')).toMatchObject({disabled:true,deletionState:'complete'});
  });
});
describe('signed local authentication',()=>{
 it('permits only known test identities; tampering, expiry and logout invalidate cookies',async()=>{
   const config=readConfig({DEVILS_RUNTIME_MODE:'local',DEVILS_LOCAL_AUTH_SECRET:'x'.repeat(32),DEVILS_SQLITE_PATH:join(directory,'store.sqlite')});
   const auth=new LocalAuth(config,store,()=>new Date(now));
   const request=new Request('http://127.0.0.1:3000/api/auth');
   const response=await auth.signIn('alex@example.test',request); const cookie=response.headers.get('set-cookie')!.split(';')[0];
   const signed=new Request(request.url,{headers:{cookie}}); expect(await auth.getIdentity(signed)).toMatchObject({email:'alex@example.test'});
   expect(await auth.getIdentity(new Request(request.url,{headers:{cookie:cookie+'x'}}))).toBeNull();
   const later=new LocalAuth(config,store,()=>new Date('2027-10-14T15:00:00.000Z')); expect(await later.getIdentity(signed)).toBeNull();
   await auth.signOut(signed); expect(await auth.getIdentity(signed)).toBeNull();
   const unknown=await auth.signIn('real@example.com',request); expect(unknown.headers.get('set-cookie')).toBeNull();
 });
});

describe('entitlement and account closure foundations',()=>{
 it('history survives invite expiry; paid access requires active current period and beta flag',async()=>{
   const {accessDecision}=await import('../src/lib/auth/access');
   const config=readConfig({DEVILS_RUNTIME_MODE:'local',DEVILS_LOCAL_AUTH_SECRET:'x'.repeat(32),DEVILS_BETA_ACTIVE:'true'});
   const s=await store.createSession('a',{mode:'business',topic:'startup'},now);
   await store.putInvite({userId:'a',enabled:true,expiresAt:'2026-10-15T00:00:00.000Z'});
   expect(await accessDecision(store,'a',config,new Date(now))).toMatchObject({allowed:true,reason:'beta'});
   expect(await accessDecision(store,'a',{...config,betaActive:false},new Date(now))).toMatchObject({allowed:false});
   expect(await accessDecision(store,'a',config,new Date('2026-10-16T00:00:00.000Z'))).toMatchObject({allowed:false,reason:'expired'});
   expect((await store.getSession('a',s.id)).id).toBe(s.id);
   await store.putSubscription({userId:'a',customerId:'cus',subscriptionId:'sub',priceId:'price',status:'active',currentPeriodEnd:'2026-11-01T00:00:00.000Z',cancelAtPeriodEnd:true,updatedAt:now});
   expect(await accessDecision(store,'a',{...config,betaActive:false},new Date(now))).toMatchObject({allowed:true,reason:'paid'});
   await store.beginAccountDeletion('a');expect(await accessDecision(store,'a',config,new Date(now))).toMatchObject({allowed:false,reason:'disabled'});
 });
 it('allows one active operation per user across sessions and rejects late leases',async()=>{
   const first=await store.createSession('a',{mode:'business',topic:'work'},now);const second=await store.createSession('a',{mode:'philosophy',topic:'life'},now);
   const r={userId:'a',sessionId:first.id,operationId:'active',expectedRevision:0,fingerprint:'fp',now,leaseExpiresAt:'2026-10-14T15:01:00.000Z'};
   await store.reserveTurn(r);await expect(store.reserveTurn({...r,sessionId:second.id,operationId:'other'})).rejects.toMatchObject({code:'TURN_IN_PROGRESS'});
   await expect(store.commitTurn({...r,now:'2026-10-14T15:02:00.000Z',state:first.state,messages:[],usage:{inputTokens:1,outputTokens:1,costMicros:1}})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
   expect(await store.listUsage('a',now)).toEqual([]);
 });
 it('makes webhook leases and failed retry durable and atomically grants access once',async()=>{
   expect(await store.beginWebhook('evt',now,'2026-10-14T15:01:00.000Z')).toBe('process');expect(await store.beginWebhook('evt',now,'2026-10-14T15:01:00.000Z')).toBe('pending');await store.failWebhook('evt');
   expect(await store.beginWebhook('evt',now,'2026-10-14T15:01:00.000Z')).toBe('process');await store.completeWebhook('evt',{userId:'a',customerId:'cus',subscriptionId:'sub',priceId:'price',status:'active',currentPeriodEnd:'2026-11-01T00:00:00.000Z',cancelAtPeriodEnd:false,updatedAt:now});
   store.close();store=new LocalStore(join(directory,'store.sqlite'));expect(await store.beginWebhook('evt','2026-10-14T16:00:00.000Z','2026-10-14T16:01:00.000Z')).toBe('duplicate');expect(await store.getSubscription('a')).toMatchObject({status:'active'});
 });
 it('restricts callback redirects to application paths',async()=>{
   const {callbackDestination}=await import('../src/lib/auth/redirect');
   expect(callbackDestination(null,'https://app.example.test')).toBe('https://app.example.test/home');expect(callbackDestination('/history?resume=1','https://app.example.test')).toBe('https://app.example.test/history?resume=1');
   for(const value of ['https://attacker.test','//attacker.test','/\\attacker.test'])expect(()=>callbackDestination(value,'https://app.example.test')).toThrow();
 });
});
