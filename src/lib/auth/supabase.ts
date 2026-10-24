import { createServerClient, parseCookieHeader, serializeCookieHeader, type CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AccountAuthRequest, AuthService } from '../contracts';
import type { RuntimeConfig } from '../config';
import { AppError } from '../errors';
import { json } from '../http';
import { setBillingIntent } from './redirect';
export interface SupabaseContext { client:SupabaseClient; admin:SupabaseClient; cookies: Array<{name:string;value:string;options:CookieOptions}>; headers:Record<string,string>; }
export function createSupabaseContext(config:RuntimeConfig,request:Request):SupabaseContext {
 const context:SupabaseContext={client:null as unknown as SupabaseClient,admin:createClient(config.supabaseUrl,config.supabaseServiceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}}),cookies:[],headers:{}};
 context.client=createServerClient(config.supabaseUrl,config.supabaseAnonKey,{cookieOptions:{httpOnly:true,secure:true,sameSite:'lax',path:'/'},cookies:{getAll:()=>parseCookieHeader(request.headers.get('cookie')??'').map(x=>({name:x.name,value:x.value??''})),setAll:(cookies,headers)=>{context.cookies.push(...cookies);Object.assign(context.headers,headers??{});}}});return context;
}
export function applySupabaseCookies(context:SupabaseContext,response:Response) {for(const cookie of context.cookies)response.headers.append('Set-Cookie',serializeCookieHeader(cookie.name,cookie.value,{...cookie.options,httpOnly:true,secure:true,sameSite:'lax',path:'/'}));for(const[key,value]of Object.entries(context.headers))response.headers.set(key,value);return response;}
export class SupabaseAuth implements AuthService {
 constructor(private config:RuntimeConfig,readonly context:SupabaseContext,private fetcher:typeof fetch=fetch) {}
 async getIdentity() {
  const {data,error}=await this.context.client.auth.getUser();if(error||!data.user)return null;
  const user=data.user;
  const existing=await this.context.client.from('profiles').select('data').eq('user_id',user.id).maybeSingle();
  if(existing.error)throw new AppError('STORE_UNAVAILABLE','Your account could not be loaded. Please try again.',503);
  if(!existing.data){
    // Verified identity only. Ignore duplicates atomically so a concurrent login
    // cannot overwrite or re-enable a disabled/deleting profile.
    const created=await this.context.admin.from('profiles').upsert({user_id:user.id,data:{id:user.id,email:user.email??'',disabled:false,deletionState:'none',createdAt:new Date().toISOString()}},{onConflict:'user_id',ignoreDuplicates:true});
    if(created.error)throw new AppError('STORE_UNAVAILABLE','Your account could not be prepared. Please try again.',503);
  }
  const name=user.user_metadata?.display_name??user.user_metadata?.full_name;
  return {id:user.id,email:user.email??'',...(typeof name==='string'?{name:name.slice(0,80)}:{}),onboarded:user.user_metadata?.devils_onboarded===true};
 }
 async authenticate(input:AccountAuthRequest,_request:Request):Promise<Response> {
  void _request;
  const client=this.context.client;
  const callback=this.config.appUrl+'/auth/callback';
  const withIntent=(response:Response)=>setBillingIntent(response, 'next' in input && input.next==='/billing');
  if(input.action==='google') {
    try {
      const settings=await this.fetcher(this.config.supabaseUrl+'/auth/v1/settings',{headers:{apikey:this.config.supabaseAnonKey},signal:AbortSignal.timeout(8000)});
      if(!settings.ok||(await settings.json()).external?.google!==true)throw new Error('Unavailable');
    }catch{throw new AppError('AUTH_UNAVAILABLE','Google sign-in is not available yet. Please use email and password.',503);}

    const {data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:callback,skipBrowserRedirect:true,queryParams:{prompt:'select_account'}}});
    if(error||!data.url)throw new AppError('AUTH_UNAVAILABLE','Google sign-in is not available yet. Please use email and password.',503);
    return withIntent(json({url:data.url}));
  }
  if(input.action==='signup') {
    const {data,error}=await client.auth.signUp({email:input.email,password:input.password,options:{emailRedirectTo:callback,data:{display_name:input.name}}});
    if(error)throw new AppError('SIGNUP_UNAVAILABLE',error.code==='over_email_send_rate_limit'?'Please wait before requesting another email.':error.code==='email_address_not_authorized'?'Account email delivery is not ready yet. You can use Google sign-in instead.':'We could not create this account. Try signing in, or try again shortly.',400);
    if(data.session)await this.getIdentity();
    return withIntent(json({signedIn:!!data.session,confirmationRequired:!data.session,message:'Check your email to confirm your account, then return here to sign in.'}));
  }
  if(input.action==='signin') {
    const {error}=await client.auth.signInWithPassword({email:input.email,password:input.password});
    if(error)throw new AppError('INVALID_CREDENTIALS',error.code==='email_not_confirmed'?'Confirm your email first. You can request another confirmation below.':'Your email or password is incorrect.',401);
    await this.getIdentity();return json({signedIn:true});
  }
  if(input.action==='reset') {
    const {error}=await client.auth.resetPasswordForEmail(input.email,{redirectTo:callback});
    if(error)throw new AppError('AUTH_UNAVAILABLE','A reset email could not be sent. Please wait a moment and try again.',503);
    return withIntent(json({message:'If an account uses this email, a password reset link is on its way. Check your inbox and spam folder.'}));
  }
  if(input.action==='resend') {
    const {error}=await client.auth.resend({type:'signup',email:input.email,options:{emailRedirectTo:callback}});
    if(error)throw new AppError('AUTH_UNAVAILABLE','Please wait before requesting another confirmation email.',503);
    return withIntent(json({message:'If confirmation is needed, a new email is on its way.'}));
  }
  const {error}=input.action==='complete-onboarding'
    ?await client.auth.updateUser({data:{display_name:input.name,devils_onboarded:true}})
    :await client.auth.updateUser({password:input.password});
  if(error)throw new AppError('AUTH_UNAVAILABLE',input.action==='update-password'?'Your reset link may have expired. Request a new link and try again.':'Your preferences could not be saved. Please try again.',400);
  return json({saved:true});
 }

 async signIn(email:string) {const{error}=await this.context.client.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:this.config.appUrl+'/auth/callback'}});if(error && !['user_not_found','signup_disabled','otp_disabled'].includes(error.code??''))throw new AppError('AUTH_UNAVAILABLE','Sign-in is temporarily unavailable.',503);return json({message:'If this address is invited, check your inbox for a sign-in link.'});}
 async signOut() {const{error}=await this.context.client.auth.signOut({scope:'local'});if(error)throw new AppError('AUTH_UNAVAILABLE','Sign-out could not complete. Please try again.',503);return json({signedOut:true});}
 async deleteIdentity(userId:string) {const{error}=await this.context.admin.auth.admin.deleteUser(userId);if(error && error.status!==404)throw new AppError('AUTH_UNAVAILABLE','Account closure is waiting for the identity provider. Please retry.',503);}
 async callback(code:string) {
  let recovery=false;
  const {data:{subscription}}=this.context.client.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')recovery=true;});
  try {const {error}=await this.context.client.auth.exchangeCodeForSession(code);if(error)throw new AppError('INVALID_CALLBACK','The sign-in link is invalid or expired.',400);return recovery?'recovery':null;}
  finally {subscription.unsubscribe();}
 }
}
