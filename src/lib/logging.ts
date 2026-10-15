export type LogEvent='generation_completed'|'generation_failed'|'deletion_completed'|'deletion_pending'|'health_checked';
export interface LogFields {code?:string;id?:string;elapsedMs?:number;costMicros?:number;}
const events=new Set<LogEvent>(['generation_completed','generation_failed','deletion_completed','deletion_pending','health_checked']);
/** Explicitly construct telemetry; never spread request, provider, or Error objects. IDs must be opaque IDs, never email or prompt text. */
export function logEvent(event:LogEvent,fields:LogFields={},write:(line:string)=>void=console.info):void {
 if(!events.has(event))return;
 const record:Record<string,string|number>={event};
 if(typeof fields.code==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(fields.code))record.code=fields.code;
 if(typeof fields.id==='string'&&/^[a-f0-9-]{16,64}$/i.test(fields.id))record.id=fields.id;
 for(const key of ['elapsedMs','costMicros'] as const)if(typeof fields[key]==='number'&&Number.isFinite(fields[key])&&fields[key]!>=0)record[key]=fields[key]!;
 write(JSON.stringify(record));
}
