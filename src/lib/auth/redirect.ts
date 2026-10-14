import { AppError } from '../errors';
/** Only application-local destinations survive the callback. */
export function callbackDestination(next:string|null,appUrl:string):string {
 if(!next)return appUrl+'/home';
 if(!next.startsWith('/')||next.startsWith('//')||next.includes('\\'))throw new AppError('INVALID_REDIRECT','Invalid sign-in destination.',400);
 const target=new URL(next,appUrl);if(target.origin!==new URL(appUrl).origin)throw new AppError('INVALID_REDIRECT','Invalid sign-in destination.',400);return target.href;
}
