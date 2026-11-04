import { RenameSessionSchema } from '@/lib/contracts';
import { json,readJson,sameOrigin } from '@/lib/http';
import { authResponse,getStore,getRuntimeConfig,requireIdentity } from '@/lib/auth/service';
export const runtime='nodejs';
type RouteContext={params:Promise<{id:string}>};
export async function GET(request:Request,context:RouteContext) {return authResponse(request,async()=>{const user=await requireIdentity(request);const{id}=await context.params;return json({session:await(await getStore(request)).getSession(user.id,id)});});}
export async function PATCH(request:Request,context:RouteContext) {return authResponse(request,async()=>{sameOrigin(request,getRuntimeConfig(request).appUrl);const user=await requireIdentity(request);const{id}=await context.params;const input=await readJson(request,RenameSessionSchema);return json({session:await(await getStore(request)).renameSession(user.id,id,input.title,input.expectedRevision,new Date().toISOString())});});}
export async function DELETE(request:Request,context:RouteContext) {return authResponse(request,async()=>{sameOrigin(request,getRuntimeConfig(request).appUrl);const user=await requireIdentity(request);const{id}=await context.params;await(await getStore(request)).deleteSession(user.id,id);return json({deleted:true});});}
