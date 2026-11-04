import { AppError } from '../../../../lib/errors';
import { authResponse, requireIdentity, getRuntimeConfig } from '../../../../lib/auth/service';
import { json,sameOrigin } from '../../../../lib/http';
import { createBillingService } from '../../../../lib/billing/service';
export const runtime='nodejs';
export async function POST(request:Request){return authResponse(request,async()=>{const config=getRuntimeConfig(request);sameOrigin(request,config.appUrl);if(config.mode!=='local')throw new AppError('NOT_FOUND','Not found.',404);await createBillingService(request).cancelRenewal((await requireIdentity(request)).id);return json({canceled:true,testMode:true});});}
