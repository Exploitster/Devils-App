import { CreateSessionSchema } from '@/lib/contracts';
import { json,readJson,sameOrigin } from '@/lib/http';
import { authResponse,getStore,getRuntimeConfig,requireIdentity } from '@/lib/auth/service';
import { requireAccess } from '@/lib/auth/access';
export const runtime='nodejs';
export async function GET(request:Request) {return authResponse(request,async()=>{const user=await requireIdentity(request);return json({sessions:await(await getStore(request)).listSessions(user.id)});});}
export async function POST(request:Request) {return authResponse(request,async()=>{const config=getRuntimeConfig(request);sameOrigin(request,config.appUrl);const user=await requireIdentity(request);const store=await getStore(request);await requireAccess(store,user.id,config);const input=await readJson(request,CreateSessionSchema);return json({session:await store.createSession(user.id,input,new Date().toISOString())},201);});}
