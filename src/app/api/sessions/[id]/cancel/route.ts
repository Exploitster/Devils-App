import { authResponse, getRuntimeConfig, requireIdentity, getStore } from '@/lib/auth/service';
import { CardRequestSchema } from '@/lib/contracts';
import { conflict } from '@/lib/errors';
import { json, readJson, sameOrigin } from '@/lib/http';
import { cancel } from '@/lib/conversation/service';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return authResponse(request,async()=>{sameOrigin(request,getRuntimeConfig(request).appUrl);const input=await readJson(request,CardRequestSchema);const id=(await context.params).id;const user=await requireIdentity(request);if((await(await getStore(request)).getSession(user.id,id)).revision!==input.expectedRevision)throw conflict();return json({session:await cancel(request,id,input.operationId)});});}
