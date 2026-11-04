import { AppError } from '../errors';
import { parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
const billingIntentCookie = 'devils-auth-next';
/** A navigation hint only: never an identity, payment authorization or entitlement. */
export function hasBillingIntent(request: Request): boolean {
 return parseCookieHeader(request.headers.get('cookie') ?? '').some(cookie => cookie.name === billingIntentCookie && cookie.value === 'billing');
}
export function setBillingIntent(response: Response, enabled: boolean): Response {
 response.headers.append('Set-Cookie', serializeCookieHeader(billingIntentCookie, enabled ? 'billing' : '', {
  httpOnly: true, secure: true, sameSite: 'lax', path: '/auth/callback', maxAge: enabled ? 3600 : 0,
 }));
 return response;
}
/** Only application-local destinations survive the callback. */
export function callbackDestination(next:string|null,appUrl:string):string {
 if(!next)return appUrl+'/home';
 if(!next.startsWith('/')||next.startsWith('//')||next.includes('\\'))throw new AppError('INVALID_REDIRECT','Invalid sign-in destination.',400);
 const target=new URL(next,appUrl);if(target.origin!==new URL(appUrl).origin)throw new AppError('INVALID_REDIRECT','Invalid sign-in destination.',400);return target.href;
}
