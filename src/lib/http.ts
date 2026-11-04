import { z } from 'zod';
import { AppError } from './errors';
export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  const result = new Headers(headers); result.set('Content-Type', 'application/json'); result.set('Cache-Control', 'private, no-store'); result.set('Vary', 'Cookie'); result.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(data), { status, headers: result });
}
export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    const headers = new Headers();
    if (error.retryAfterSeconds !== undefined) headers.set('Retry-After', String(error.retryAfterSeconds));
    return json({ error: { code: error.code, message: error.message, ...(error.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: error.retryAfterSeconds }) } }, error.status, headers);
  }
  if (error instanceof z.ZodError) return json({ error: { code: 'INVALID_REQUEST', message: 'Check the submitted fields and try again.' } }, 400);
  return json({ error: { code: 'INTERNAL_ERROR', message: 'The request could not complete. Please try again.' } }, 500);
}
export function sameOrigin(request: Request, appUrl?: string): void {
  const expected = new URL(appUrl ?? request.url).origin;
  const origin = request.headers.get('origin');
  if (!origin || origin !== expected || request.headers.get('sec-fetch-site') === 'cross-site') throw new AppError('FORBIDDEN', 'This request must come from the application.', 403);
}
export async function readJson<T>(request: Request, schema: z.ZodType<T>, maxBytes = 64000): Promise<T> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new AppError('BODY_TOO_LARGE', 'The request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('INVALID_REQUEST', 'A JSON request body is required.', 400);
  const chunks: Uint8Array[] = []; let count = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; count += value.byteLength; if (count > maxBytes) { await reader.cancel(); throw new AppError('BODY_TOO_LARGE', 'The request is too large.', 413); } chunks.push(value); }
  const buffer = new Uint8Array(count); let offset = 0; for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  let data: unknown; try { data = JSON.parse(new TextDecoder().decode(buffer)); } catch { throw new AppError('INVALID_REQUEST', 'A valid JSON body is required.', 400); }
  return schema.parse(data);
}
export async function handle(action: () => Promise<Response>): Promise<Response> { try { return await action(); } catch (error) { return errorResponse(error); } }
