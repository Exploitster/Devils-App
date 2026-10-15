/** Narrow direct requests only. Discussion or quoted examples are left to the
 * structured provider classifier; a keyword mention is not an attack. */
export function privacyBoundary(text:string):string|undefined {
 const direct=/^\s*(?:please\s+)?(?:ignore\s+(?:all\s+)?(?:previous|system)\s+instructions\s*[,;:.]?\s*)?(?:show|reveal|print|give|display|dump|repeat)\s+(?:me\s+)?(?:your\s+|the\s+)?(?:hidden\s+|full\s+|exact\s+)?(?:system\s+(?:prompt|instructions)|api\s+keys?|secrets?|other\s+users?'?\s+(?:conversations|messages|data))/i;
 if(direct.test(text))return 'I cannot share hidden instructions, credentials, or another person’s private data. Tell me the business idea or decision you want to examine, and we can challenge its assumptions.';
}
