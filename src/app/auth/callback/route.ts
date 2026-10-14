import { AppError } from '@/lib/errors';
import { authResponse, getAuth, getRuntimeConfig } from '@/lib/auth/service';
import { SupabaseAuth } from '@/lib/auth/supabase';
import { callbackDestination } from '@/lib/auth/redirect';
export async function GET(request:Request) {return authResponse(request,async()=>{const url=new URL(request.url);const config=getRuntimeConfig(request);const destination=callbackDestination(url.searchParams.get('next'),config.appUrl);const auth=getAuth(request);const code=url.searchParams.get('code');if(!(auth instanceof SupabaseAuth)||!code||code.length>4096)throw new AppError('INVALID_CALLBACK','The sign-in link is invalid or expired.',400);await auth.callback(code);return new Response(null,{status:303,headers:{Location:destination,'Cache-Control':'private, no-store',Vary:'Cookie'}});});}
