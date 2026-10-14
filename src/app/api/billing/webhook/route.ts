import { authResponse } from '../../../../lib/auth/service';
import { AppError } from '../../../../lib/errors';
import { json } from '../../../../lib/http';
import { createBillingService } from '../../../../lib/billing/service';
export const runtime='nodejs';
export async function POST(request:Request){return authResponse(request,async()=>{if(Number(request.headers.get('content-length')??0)>256000)throw new AppError('BODY_TOO_LARGE','Webhook too large.',413);const reader=request.body?.getReader();const chunks:Uint8Array[]=[];let size=0;if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>256000){await reader.cancel();throw new AppError('BODY_TOO_LARGE','Webhook too large.',413);}chunks.push(value);}await createBillingService(request).processWebhook(Buffer.concat(chunks).toString('utf8'),request.headers.get('stripe-signature')??'');return json({received:true});});}
