import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { AuthService, Identity } from '../contracts';
import type { RuntimeConfig } from '../config';
import { json } from '../http';
import { LocalStore } from '../store/local';
const cookieName='devils_local_session';
const identities=['alex@example.test','sam@example.test','expired@example.test'];
export class LocalAuth implements AuthService {
  constructor(private config:RuntimeConfig,private store:LocalStore,private now:()=>Date=()=>new Date()) {}
  private signature(payload:string) { return createHmac('sha256',this.config.localAuthSecret).update(payload).digest('base64url'); }
  private token(request:Request): {id:string;expiresAt:string} | null { try {const value=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(!value)return null;const parts=value.split('.');if(parts.length!==2)return null;const expected=Buffer.from(this.signature(parts[0]));const actual=Buffer.from(parts[1]);if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return null;const token=JSON.parse(Buffer.from(parts[0],'base64url').toString()) as {id:string;expiresAt:string};if(!token.id||!Number.isFinite(Date.parse(token.expiresAt))||Date.parse(token.expiresAt)<=this.now().getTime())return null;return token;}catch{return null;} }
  async getIdentity(request:Request):Promise<Identity|null> { const token=this.token(request);if(!token)return null;const known=this.store.getAuthToken(token.id);if(!known || known.expiresAt!==token.expiresAt)return null;const profile=await this.store.getProfile(known.userId);return profile ? {id:profile.id,email:profile.email} : null; }
  async signIn(email:string,_request:Request) { void _request; email=email.trim().toLowerCase();const response=json({message:'If this address is invited, sign-in instructions are available.',runtimeMode:'local'});if(!identities.includes(email))return response;
    const userId='local-'+email.split('@')[0];let profile=await this.store.getProfile(userId);if(!profile){profile={id:userId,email,disabled:false,deletionState:'none',createdAt:this.now().toISOString()};await this.store.putProfile(profile);await this.store.putInvite({userId,enabled:true,expiresAt:new Date(this.now().getTime()+(email.startsWith('expired@')?-86400000:30*86400000)).toISOString()});}if(profile.disabled)return response;
    const id=randomUUID();const expiresAt=new Date(this.now().getTime()+7*86400000).toISOString();this.store.issueAuthToken(id,userId,expiresAt);const payload=Buffer.from(JSON.stringify({id,expiresAt})).toString('base64url');response.headers.append('Set-Cookie',`${cookieName}=${payload}.${this.signature(payload)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`);return response;
  }
  async signOut(request:Request) { const token=this.token(request);if(token)this.store.revokeAuthToken(token.id);const response=json({signedOut:true});response.headers.append('Set-Cookie',`${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);return response; }
  async deleteIdentity(userId:string) { this.store.revokeUserAuthTokens(userId); }
}
