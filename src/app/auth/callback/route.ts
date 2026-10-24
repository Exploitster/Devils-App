import { authResponse, getAuth, getRuntimeConfig } from '@/lib/auth/service';
import { SupabaseAuth } from '@/lib/auth/supabase';
import { callbackDestination, hasBillingIntent, setBillingIntent } from '@/lib/auth/redirect';
function redirect(destination:string) {return setBillingIntent(new Response(null,{status:303,headers:{Location:destination,'Cache-Control':'private, no-store',Vary:'Cookie'}}),false);}
export async function GET(request:Request) {return authResponse(request,async()=>{
 const url=new URL(request.url);const config=getRuntimeConfig(request);const auth=getAuth(request);
 const billingIntent=hasBillingIntent(request);
 const loginError=config.appUrl+'/login?error=callback'+(billingIntent?'&next=%2Fbilling':'');
 let destination=callbackDestination(url.searchParams.get('next')??(billingIntent?'/billing':'/onboarding'),config.appUrl);
 const code=url.searchParams.get('code');
 if(!(auth instanceof SupabaseAuth)||!code||code.length>4096||url.searchParams.has('error'))return redirect(loginError);
 try{const type=await auth.callback(code);if(type==='recovery')destination=config.appUrl+'/reset-password';await auth.getIdentity();}catch{return redirect(loginError);}
 return redirect(destination);
});}
