import { createHmac, randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { AccountAuthRequest, AuthService, Identity } from '../contracts';
import type { RuntimeConfig } from '../config';
import { AppError } from '../errors';
import { json } from '../http';
import { LocalStore } from '../store/local';
const cookieName='devils_local_session';
const identities=['alex@example.test','sam@example.test','expired@example.test'];
export class LocalAuth implements AuthService {
  constructor(private config:RuntimeConfig,private store:LocalStore,private now:()=>Date=()=>new Date()) {}
  private signature(payload:string) { return createHmac('sha256',this.config.localAuthSecret).update(payload).digest('base64url'); }
  private token(request:Request): {id:string;expiresAt:string} | null { try {const value=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(!value)return null;const parts=value.split('.');if(parts.length!==2)return null;const expected=Buffer.from(this.signature(parts[0]));const actual=Buffer.from(parts[1]);if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return null;const token=JSON.parse(Buffer.from(parts[0],'base64url').toString()) as {id:string;expiresAt:string};if(!token.id||!Number.isFinite(Date.parse(token.expiresAt))||Date.parse(token.expiresAt)<=this.now().getTime())return null;return token;}catch{return null;} }
  async getIdentity(request:Request):Promise<Identity|null> { const token=this.token(request);if(!token)return null;const known=this.store.getAuthToken(token.id);if(!known || known.expiresAt!==token.expiresAt)return null;const profile=await this.store.getProfile(known.userId);return profile ? {id:profile.id,email:profile.email,...(profile.name?{name:profile.name}:{}),...(profile.onboarded?{onboarded:true}:{})} : null; }
  async signIn(email:string,_request:Request) { void _request; email=email.trim().toLowerCase();const response=json({message:'If this address is invited, sign-in instructions are available.',runtimeMode:'local'});if(!identities.includes(email))return response;
    const userId='local-'+email.split('@')[0];let profile=await this.store.getProfile(userId);if(!profile){profile={id:userId,email,disabled:false,deletionState:'none',createdAt:this.now().toISOString()};await this.store.putProfile(profile);await this.store.putInvite({userId,enabled:true,expiresAt:new Date(this.now().getTime()+(email.startsWith('expired@')?-86400000:30*86400000)).toISOString()});}if(profile.disabled)return response;
    return this.issueSession(userId,response);
  }
  private issueSession(userId:string,response:Response=json({signedIn:true})) {
    const id=randomUUID();const expiresAt=new Date(this.now().getTime()+7*86400000).toISOString();this.store.issueAuthToken(id,userId,expiresAt);const payload=Buffer.from(JSON.stringify({id,expiresAt})).toString('base64url');response.headers.append('Set-Cookie',`${cookieName}=${payload}.${this.signature(payload)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`);return response;
  }
  async authenticate(input:AccountAuthRequest,request:Request):Promise<Response> {
    if(input.action==='google')throw new AppError('AUTH_UNAVAILABLE','Google sign-in is available on the connected online app. Use a demo account here.',400);
    if(input.action==='reset'||input.action==='resend')return json({message:'Local development does not send email. Use a demo account or create another test account.'});
    if(input.action==='signup') {
      if(identities.includes(input.email))throw new AppError('SIGNUP_UNAVAILABLE','This address is reserved for a demo account.',400);
      const userId=randomUUID();const salt=randomBytes(16).toString('hex');const hash=scryptSync(input.password,salt,64).toString('hex');
      this.store.createCredential(input.email,{userId,salt,hash},{id:userId,email:input.email,name:input.name,disabled:false,deletionState:'none',createdAt:this.now().toISOString()});
      return this.issueSession(userId);
    }
    if(input.action==='signin') {
      const credential=this.store.getCredential(input.email);const salt=credential?.salt??'unrecognized-account';
      const actual=scryptSync(input.password,salt,64);const expected=credential?Buffer.from(credential.hash,'hex'):Buffer.alloc(64);
      if(!credential||!timingSafeEqual(actual,expected))throw new AppError('INVALID_CREDENTIALS','Your email or password is incorrect.',401);
      const profile=await this.store.getProfile(credential.userId);
      if(!profile||profile.disabled)throw new AppError('INVALID_CREDENTIALS','Your email or password is incorrect.',401);
      return this.issueSession(credential.userId);
    }
    const user=await this.getIdentity(request);if(!user)throw new AppError('UNAUTHORIZED','Please sign in again.',401);
    if(input.action==='complete-onboarding'){this.store.completeOnboarding(user.id,input.name);return json({saved:true});}
    const salt=randomBytes(16).toString('hex');this.store.changeCredential(user.id,salt,scryptSync(input.password,salt,64).toString('hex'));
    return this.issueSession(user.id,json({updated:true}));
  }
  async signOut(request:Request) { const token=this.token(request);if(token)this.store.revokeAuthToken(token.id);const response=json({signedOut:true});response.headers.append('Set-Cookie',`${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);return response; }
  async deleteIdentity(userId:string) { this.store.revokeUserAuthTokens(userId); this.store.removeCredential(userId); }
}
