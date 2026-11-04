import { authResponse, getRuntimeConfig } from '@/lib/auth/service';
import { TurnRequestSchema } from '@/lib/contracts';
import { json, readJson, sameOrigin } from '@/lib/http';
import { handleTurn } from '@/lib/conversation/service';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return authResponse(request,async()=>{sameOrigin(request,getRuntimeConfig(request).appUrl);const input=await readJson(request,TurnRequestSchema);return json({session:await handleTurn(request,(await context.params).id,input)});});}
