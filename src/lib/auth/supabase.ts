import { createServerClient, parseCookieHeader, serializeCookieHeader, type CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AuthService } from '../contracts';
import type { RuntimeConfig } from '../config';
import { AppError } from '../errors';
import { json } from '../http';
export interface SupabaseContext { client:SupabaseClient; admin:SupabaseClient; cookies: Array<{name:string;value:string;options:CookieOptions}>; headers:Record<string,string>; }
export function createSupabaseContext(config:RuntimeConfig,request:Request):SupabaseContext {
 const context:SupabaseContext={client:null as unknown as SupabaseClient,admin:createClient(config.supabaseUrl,config.supabaseServiceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}}),cookies:[],headers:{}};
 context.client=createServerClient(config.supabaseUrl,config.supabaseAnonKey,{cookieOptions:{httpOnly:true,secure:true,sameSite:'lax',path:'/'},cookies:{getAll:()=>parseCookieHeader(request.headers.get('cookie')??'').map(x=>({name:x.name,value:x.value??''})),setAll:(cookies,headers)=>{context.cookies.push(...cookies);Object.assign(context.headers,headers??{});}}});return context;
}
export function applySupabaseCookies(context:SupabaseContext,response:Response) {for(const cookie of context.cookies)response.headers.append('Set-Cookie',serializeCookieHeader(cookie.name,cookie.value,{...cookie.options,httpOnly:true,secure:true,sameSite:'lax',path:'/'}));for(const[key,value]of Object.entries(context.headers))response.headers.set(key,value);return response;}
export class SupabaseAuth implements AuthService {
 constructor(private config:RuntimeConfig,readonly context:SupabaseContext) {}
 async getIdentity(_request:Request) {const {data,error}=await this.context.client.auth.getUser();if(error || !data.user)return null;return{id:data.user.id,email:data.user.email??''};}
 async signIn(email:string,_request:Request) {const{error}=await this.context.client.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:this.config.appUrl+'/auth/callback'}});if(error && !['user_not_found','signup_disabled','otp_disabled'].includes(error.code??''))throw new AppError('AUTH_UNAVAILABLE','Sign-in is temporarily unavailable.',503);return json({message:'If this address is invited, check your inbox for a sign-in link.'});}
 async signOut(_request:Request) {const{error}=await this.context.client.auth.signOut({scope:'local'});if(error)throw new AppError('AUTH_UNAVAILABLE','Sign-out could not complete. Please try again.',503);return json({signedOut:true});}
 async deleteIdentity(userId:string) {const{error}=await this.context.admin.auth.admin.deleteUser(userId);if(error && error.status!==404)throw new AppError('AUTH_UNAVAILABLE','Account closure is waiting for the identity provider. Please retry.',503);}
 async callback(code:string) {const{error}=await this.context.client.auth.exchangeCodeForSession(code);if(error)throw new AppError('INVALID_CALLBACK','The sign-in link is invalid or expired.',400);}
}
