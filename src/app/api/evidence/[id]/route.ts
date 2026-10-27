import { authResponse, requireIdentity } from '@/lib/auth/service';
import { createEvidenceService } from '@/lib/evidence/service';
import { notFound } from '@/lib/errors';
import { json } from '@/lib/http';
export const runtime='nodejs';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return authResponse(request,async()=>{await requireIdentity(request);const evidence=await createEvidenceService().get((await context.params).id);if(!evidence)throw notFound();return json({evidence});});}
