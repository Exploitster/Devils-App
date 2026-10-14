import { authResponse, getRuntimeConfig } from '@/lib/auth/service';
import { CardRequestSchema } from '@/lib/contracts';
import { json, readJson, sameOrigin } from '@/lib/http';
import { handleCard } from '@/lib/conversation/service';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return authResponse(request,async()=>{sameOrigin(request,getRuntimeConfig(request).appUrl);const input=await readJson(request,CardRequestSchema);return json({session:await handleCard(request,(await context.params).id,input)});});}
