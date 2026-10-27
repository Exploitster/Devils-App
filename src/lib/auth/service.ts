import type { AuthService, Identity, Store } from '../contracts';
import { readConfig, type RuntimeConfig } from '../config';
import { createClient } from '@supabase/supabase-js';
import { AppError, unauthorized } from '../errors';
import { errorResponse } from '../http';
import { LocalStore } from '../store/local';
import { SupabaseStore } from '../store/supabase';
import { LocalAuth } from './local';
import { SupabaseAuth, createSupabaseContext, applySupabaseCookies, type SupabaseContext } from './supabase';
interface Context {config:RuntimeConfig;auth:AuthService;local?:LocalStore;supabase?:SupabaseContext;identity?:Promise<Identity|null>;store?:Promise<Store>;}
const contexts=new WeakMap<Request,Context>();
const localStores=new Map<string,LocalStore>();
function context(request:Request):Context {
 if(typeof window!=='undefined')throw new Error('Server services cannot run in a browser.');
 const existing=contexts.get(request);if(existing)return existing;
 const config=readConfig();let value:Context;
 if(config.mode==='local'){let store=localStores.get(config.sqlitePath);if(!store){store=new LocalStore(config.sqlitePath);localStores.set(config.sqlitePath,store);}value={config,local:store,auth:new LocalAuth(config,store)};}
 else{const supabase=createSupabaseContext(config,request);value={config,supabase,auth:new SupabaseAuth(config,supabase)};}
 contexts.set(request,value);return value;
}
export function getAuth(request:Request):AuthService {return context(request).auth;}
export function getRuntimeConfig(request:Request) {return context(request).config;}
export async function getIdentity(request:Request):Promise<Identity|null> {const current=context(request);current.identity??=current.auth.getIdentity(request);return current.identity;}
export async function getStore(request:Request):Promise<Store> {const current=context(request);if(current.local)return current.local;current.store??=getIdentity(request).then(user=>new SupabaseStore(current.supabase!.client,current.supabase!.admin,user?.id??null));return current.store;}
/** Disabled verified identities may only enter explicit account-closure retry flows. */
export async function requireIdentity(request:Request,options:{allowDisabled?:boolean}={}):Promise<Identity> {
 const user=await getIdentity(request);if(!user)throw unauthorized();const store=await getStore(request);const profile=await store.getProfile(user.id);if(!profile)throw unauthorized();if(profile.disabled&&!options.allowDisabled)throw new AppError('ACCOUNT_DISABLED','This account is closed or being deleted.',403);return user;
}
export function attachAuthCookies(request:Request,response:Response):Response {const current=contexts.get(request);return current?.supabase?applySupabaseCookies(current.supabase,response):response;}
/** Includes refreshed authentication cookies even on validation/authorization failures. */
export async function authResponse(request:Request,action:()=>Promise<Response>):Promise<Response> {let response:Response;try{response=await action();}catch(error){response=errorResponse(error);}return attachAuthCookies(request,response);}

/** No request/body chooses this privileged path. For server webhook and invite administration only. */
export function getAdminStore():Store {
 if(typeof window!=='undefined')throw new Error('Server services cannot run in a browser.');
 const config=readConfig();if(config.mode==='local'){let store=localStores.get(config.sqlitePath);if(!store){store=new LocalStore(config.sqlitePath);localStores.set(config.sqlitePath,store);}return store;}
 const admin=createClient(config.supabaseUrl,config.supabaseServiceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});return new SupabaseStore(admin,admin,null,true);
}
