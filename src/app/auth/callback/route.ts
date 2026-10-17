import { authResponse, getAuth, getRuntimeConfig } from '@/lib/auth/service';
import { SupabaseAuth } from '@/lib/auth/supabase';
import { callbackDestination } from '@/lib/auth/redirect';
function redirect(destination:string) {return new Response(null,{status:303,headers:{Location:destination,'Cache-Control':'private, no-store',Vary:'Cookie'}});}
export async function GET(request:Request) {return authResponse(request,async()=>{
 const url=new URL(request.url);const config=getRuntimeConfig(request);const auth=getAuth(request);
 let destination=callbackDestination(url.searchParams.get('next')??'/onboarding',config.appUrl);
 const code=url.searchParams.get('code');
 if(!(auth instanceof SupabaseAuth)||!code||code.length>4096||url.searchParams.has('error'))return redirect(config.appUrl+'/login?error=callback');
 try{const type=await auth.callback(code);if(type==='recovery')destination=config.appUrl+'/reset-password';await auth.getIdentity();}catch{return redirect(config.appUrl+'/login?error=callback');}
 return redirect(destination);
});}
