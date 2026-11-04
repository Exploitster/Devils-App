import { AuthRequestSchema } from '@/lib/contracts';
import { publicConfig } from '@/lib/config';
import { json, readJson, sameOrigin } from '@/lib/http';
import { getAuth, getIdentity, getStore, getRuntimeConfig, authResponse } from '@/lib/auth/service';
import { accessDecision } from '@/lib/auth/access';
export const runtime='nodejs';
export async function GET(request:Request) {return authResponse(request,async()=>{const config=getRuntimeConfig(request);const user=await getIdentity(request);const access=user?await accessDecision(await getStore(request),user.id,config):undefined;return json({user,access,config:publicConfig(config)});});}
export async function POST(request:Request) {return authResponse(request,async()=>{sameOrigin(request,getRuntimeConfig(request).appUrl);const input=await readJson(request,AuthRequestSchema);return getAuth(request).signIn(input.email,request);});}
export async function DELETE(request:Request) {return authResponse(request,async()=>{sameOrigin(request,getRuntimeConfig(request).appUrl);return getAuth(request).signOut(request);});}
