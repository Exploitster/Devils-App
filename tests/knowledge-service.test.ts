import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig, type RuntimeConfig } from '../src/lib/config';
import { LocalKnowledgeStore } from '../src/lib/knowledge/local-store';
import { GeminiTranscriber, type Transcriber } from '../src/lib/knowledge/transcribe';
import type { FileStore } from '../src/lib/knowledge/files';
import type { SpendAttempt } from '../src/lib/contracts';
import { KnowledgeService, resolveFileType } from '../src/lib/knowledge/service';

const flags = vi.hoisted(() => ({ rehearsal: false }));
vi.mock('../src/lib/config', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/config')>();
  return { ...actual, readConfig: (env?: Record<string, string | undefined>) => ({ ...actual.readConfig(env), ...(flags.rehearsal ? { sharedDataRehearsal: true } : {}) }) };
});

// The PDF reader takes ownership of the bytes it is given, so each use reads a fresh copy.
const pdf = () => new Uint8Array(readFileSync(new URL('./fixtures/note.pdf', import.meta.url)));
const local = readConfig({ DEVILS_RUNTIME_MODE: 'local', DEVILS_LOCAL_AUTH_SECRET: 'x'.repeat(32) });
const services: RuntimeConfig = { ...local, mode: 'services', transcriptionApiKey: 'private-key', transcriptionInputUsdPerMillion: 1, transcriptionOutputUsdPerMillion: 4 };
const usageMetadata = { promptTokenCount: 1000, candidatesTokenCount: 200, thoughtsTokenCount: 50 };
const transcript = (text: string, finishReason = 'STOP') => new Response(JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text }] } }], usageMetadata }));

class MemoryFiles implements FileStore {
  files = new Map<string, Uint8Array>(); removed: string[] = [];
  async uploadTarget(id: string, mimeType: string) { return { method: 'PUT' as const, url: `https://storage.example.test/${id}`, headers: { 'Content-Type': mimeType } }; }
  async download(id: string) { return this.files.get(id) ?? null; }
  async remove(id: string) { this.removed.push(id); this.files.delete(id); }
}

let directory: string; let store: LocalKnowledgeStore; let files: MemoryFiles; let clock: Date;
const spend = { reserveSpend: vi.fn<(attempt: SpendAttempt, limit: number) => Promise<void>>(async () => {}), reconcileSpend: vi.fn<(attemptId: string, micros: number) => Promise<void>>(async () => {}) };
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'devils-knowledge-service-')); store = new LocalKnowledgeStore(join(directory, 'store.sqlite')); files = new MemoryFiles(); clock = new Date('2026-11-09T10:00:00.000Z'); spend.reserveSpend.mockClear(); spend.reconcileSpend.mockClear(); });
afterEach(() => { vi.useRealTimers(); store.close(); rmSync(directory, { recursive: true, force: true }); });
function service(config: RuntimeConfig, transcriber: Transcriber) { return new KnowledgeService({ store, files, transcriber, spend, config, ownerId: '00000000-0000-4000-8000-000000000001', now: () => clock }); }
const gemini = (fetcher: typeof fetch, config: RuntimeConfig = services) => service(config, new GeminiTranscriber(config, fetcher));
async function uploaded(knowledge: KnowledgeService, fileName: string, mimeType: string, bytes: Uint8Array = new Uint8Array(4000), declared = bytes.byteLength) {
  const { item, upload } = await knowledge.create({ kind: 'file', fileName, mimeType, sizeBytes: declared });
  expect(item.status).toBe('uploading'); expect(upload).toMatchObject({ method: 'PUT' });
  files.files.set(item.id, bytes); return item;
}

describe('adding material', () => {
  it('rejects a recording declared over 50 MB and a type that is not a PDF or recording', async () => {
    const knowledge = gemini(fetch);
    await expect(knowledge.create({ kind: 'file', fileName: 'memo.mp3', mimeType: 'audio/mpeg', sizeBytes: 60 * 1024 * 1024 })).rejects.toMatchObject({ code: 'FILE_TOO_LARGE', status: 413, message: 'Recordings can be up to 50 MB' });
    await expect(knowledge.create({ kind: 'file', fileName: 'photo.png', mimeType: 'image/png', sizeBytes: 1000 })).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE', status: 415 });
    expect(await store.listItems()).toEqual([]);
  });
  it.each([['audio/x-m4a', 'memo.m4a', 'audio/mp4'], ['audio/x-wav', 'memo.wav', 'audio/wav'], ['audio/mp3', 'memo.mp3', 'audio/mpeg'], ['audio/x-flac', 'memo.flac', 'audio/flac'], ['', 'memo.m4a', 'audio/mp4'], ['video/webm', 'memo.webm', 'audio/webm']])('stores %s for %s as %s and sends that type to the transcriber', async (declared, fileName, canonical) => {
    expect(resolveFileType(fileName, declared)).toEqual({ kind: 'audio', mimeType: canonical });
    let sentType = '';
    const knowledge = gemini(async (_url, init) => { sentType = JSON.parse(init!.body as string).contents[0].parts[1].inlineData.mimeType; return transcript('Hello.'); });
    const item = await uploaded(knowledge, fileName, declared);
    expect(item.mimeType).toBe(canonical);
    expect((await knowledge.process(item.id)).item.status).toBe('review');
    expect(sentType).toBe(canonical);
  });
});

describe('processing uploads', () => {
  it('fails a recording when transcription is not set up, while a PDF in the same library still reaches review', async () => {
    for (const config of [{ ...services, transcriptionApiKey: '' }, { ...services, transcriptionInputUsdPerMillion: undefined, transcriptionOutputUsdPerMillion: undefined }]) {
      const fetcher = vi.fn(fetch); const knowledge = gemini(fetcher, config);
      const recording = await uploaded(knowledge, 'memo.mp3', 'audio/mpeg');
      const result = await knowledge.process(recording.id);
      expect(result.failure?.code).toBe('TRANSCRIPTION_UNAVAILABLE');
      expect(result.item).toMatchObject({ status: 'failed', failureReason: expect.stringMatching(/^Transcription isn't set up: set DEVILS_/) });
      expect(await store.getItem(recording.id)).toMatchObject({ status: 'failed', failureReason: result.item.failureReason });
      expect(fetcher).not.toHaveBeenCalled(); expect(spend.reserveSpend).not.toHaveBeenCalled();
      const document = await uploaded(knowledge, 'note.pdf', 'application/pdf', pdf());
      expect((await knowledge.process(document.id)).item).toMatchObject({ status: 'review', text: expect.stringContaining('Charge for the outcome the customer can measure.') });
    }
  });
  it('saves a transcript for review and reconciles the reserved spend to the reported tokens, with the item id as the operation', async () => {
    const knowledge = gemini(async () => transcript('We charge by the month.'));
    const item = await uploaded(knowledge, 'memo.mp3', 'audio/mpeg');
    expect((await knowledge.process(item.id)).item).toMatchObject({ status: 'review', text: 'We charge by the month.' });
    const [[attempt, limit]] = spend.reserveSpend.mock.calls;
    expect(attempt).toMatchObject({ operationId: item.id, userId: '00000000-0000-4000-8000-000000000001', reservedMicros: new GeminiTranscriber(services).reserveMicros(4000) });
    expect(limit).toBe(services.dailySpendLimitMicros);
    expect(spend.reconcileSpend.mock.calls).toEqual([[attempt.id, 1000 * 1 + 250 * 4]]);
  });
  it('fails a transcription that runs past its deadline as too long and keeps the reservation as its cost', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const knowledge = gemini((_url, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason))));
    const item = await uploaded(knowledge, 'memo.mp3', 'audio/mpeg');
    const pending = knowledge.process(item.id);
    await vi.advanceTimersByTimeAsync(240_000);
    expect((await pending).item).toMatchObject({ status: 'failed', failureReason: 'Recording too long: split it into shorter parts' });
    const [[attempt]] = spend.reserveSpend.mock.calls;
    expect(spend.reconcileSpend.mock.calls).toEqual([[attempt.id, attempt.reservedMicros]]);
  });
  it('fails a transcript cut off at the output cap as too long and reconciles its known cost', async () => {
    const knowledge = gemini(async () => transcript('partial', 'MAX_TOKENS'));
    const item = await uploaded(knowledge, 'memo.mp3', 'audio/mpeg');
    expect((await knowledge.process(item.id)).item).toMatchObject({ status: 'failed', failureReason: 'Recording too long: split it into shorter parts' });
    expect(spend.reconcileSpend.mock.calls[0][1]).toBe(2000);
  });
  it('fails on a provider outage and processes again when the owner retries', async () => {
    let calls = 0; let statusDuringRetry = '';
    const knowledge = gemini(async () => { calls++; if (calls === 1) return new Response('unavailable', { status: 503 }); statusDuringRetry = (await store.getItem(item.id))!.status; return transcript('Second try.'); });
    const item = await uploaded(knowledge, 'memo.mp3', 'audio/mpeg');
    const failed = await knowledge.process(item.id);
    expect(failed.failure?.code).toBe('PROVIDER_ERROR'); expect(failed.item.status).toBe('failed');
    expect((await knowledge.process(item.id)).item).toMatchObject({ status: 'review', text: 'Second try.' });
    expect(statusDuringRetry).toBe('processing');
  });
  it('lets an item stuck in processing past the 10-minute lease be processed again, but not a recent one', async () => {
    const knowledge = gemini(async () => transcript('Recovered.'));
    const stuck = await uploaded(knowledge, 'old.mp3', 'audio/mpeg'); const recent = await uploaded(knowledge, 'new.mp3', 'audio/mpeg');
    await store.setStatus(stuck.id, { status: 'processing', processingStartedAt: new Date(clock.getTime() - 11 * 60_000).toISOString() }, clock.toISOString());
    await store.setStatus(recent.id, { status: 'processing', processingStartedAt: new Date(clock.getTime() - 2 * 60_000).toISOString() }, clock.toISOString());
    expect((await knowledge.process(stuck.id)).item.status).toBe('review');
    await expect(knowledge.process(recent.id)).rejects.toMatchObject({ code: 'PROCESSING', status: 409 });
    expect((await store.getItem(recent.id))!.status).toBe('processing');
  });
  it('fails a PDF without a text layer, and an upload whose stored size is over the cap', async () => {
    const knowledge = gemini(fetch);
    const scan = await uploaded(knowledge, 'scan.pdf', 'application/pdf', new Uint8Array(readFileSync(new URL('./fixtures/scan.pdf', import.meta.url))));
    expect((await knowledge.process(scan.id)).item).toMatchObject({ status: 'failed', failureReason: 'This PDF has no text layer' });
    const large = await uploaded(knowledge, 'large.pdf', 'application/pdf', new Uint8Array(50 * 1024 * 1024 + 1), 1000);
    expect((await knowledge.process(large.id)).item).toMatchObject({ status: 'failed', failureReason: 'PDFs can be up to 50 MB' });
  });
});

describe('reviewing items', () => {
  it('indexes passages when an item in review is approved, and refuses to approve a failed item', async () => {
    const knowledge = gemini(async () => new Response('unavailable', { status: 503 }));
    const { item } = await knowledge.create({ kind: 'text', title: 'Pricing', text: 'Charge for the outcome the customer can measure.' });
    expect(item.status).toBe('review');
    expect(await store.search({ match: 'customer outcome' }, 3)).toEqual([]);
    expect(await knowledge.changeStatus(item.id, 'approve')).toMatchObject({ status: 'approved' });
    expect(await store.search({ match: 'customer outcome' }, 3)).toEqual([{ text: 'Charge for the outcome the customer can measure.' }]);
    const failed = await uploaded(knowledge, 'memo.mp3', 'audio/mpeg'); await knowledge.process(failed.id);
    await expect(knowledge.changeStatus(failed.id, 'approve')).rejects.toMatchObject({ code: 'INVALID_STATUS', status: 409 });
  });
  it('edits only items in review, and deletes the stored file before the item', async () => {
    const knowledge = gemini(async () => new Response('unavailable', { status: 503 }));
    const { item } = await knowledge.create({ kind: 'text', text: 'First draft.' });
    expect(await knowledge.update(item.id, { title: 'Renamed', text: 'Corrected.' })).toMatchObject({ title: 'Renamed', text: 'Corrected.' });
    await knowledge.changeStatus(item.id, 'reject');
    await expect(knowledge.update(item.id, { title: 'Again' })).rejects.toMatchObject({ code: 'INVALID_STATUS' });
    const recording = await uploaded(knowledge, 'memo.mp3', 'audio/mpeg');
    await knowledge.remove(recording.id);
    expect(files.removed).toEqual([recording.id]); expect(await store.getItem(recording.id)).toBeNull();
    await knowledge.remove(item.id); expect(files.removed).toEqual([recording.id]);
  });
});

describe('studio item routes', async () => {
  const { POST: signIn } = await import('../src/app/api/auth/route');
  const items = await import('../src/app/api/studio/items/route');
  const item = await import('../src/app/api/studio/items/[id]/route');
  const file = await import('../src/app/api/studio/items/[id]/file/route');
  const process = await import('../src/app/api/studio/items/[id]/process/route');
  const status = await import('../src/app/api/studio/items/[id]/status/route');
  const origin = 'http://127.0.0.1:3000';
  beforeEach(() => { flags.rehearsal = false; vi.stubEnv('DEVILS_RUNTIME_MODE', 'local'); vi.stubEnv('DEVILS_LOCAL_AUTH_SECRET', 'x'.repeat(32)); vi.stubEnv('DEVILS_SQLITE_PATH', join(directory, 'app.sqlite')); vi.stubEnv('DEVILS_APP_URL', origin); vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('DEVILS_PAYMENTS_ENABLED', 'false'); vi.stubEnv('DEVILS_OWNER_EMAILS', 'sam@example.test'); });
  afterEach(() => { vi.unstubAllEnvs(); });
  async function cookie(email: string) { return (await signIn(new Request(origin + '/api/auth', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email }) }))).headers.get('set-cookie')!.split(';')[0]; }
  const request = (who: string, path: string, method = 'GET', body?: BodyInit, type = 'application/json') => new Request(origin + path, { method, headers: { cookie: who, origin, ...(body === undefined ? {} : { 'content-type': type }) }, body });
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const create = (who: string, body: unknown) => items.POST(request(who, '/api/studio/items', 'POST', JSON.stringify(body)));

  it('takes a pasted note of 150,000 characters straight to review and refuses one over 200,000', async () => {
    const owner = await cookie('sam@example.test');
    const created = await create(owner, { kind: 'text', title: 'Long note', text: 'é'.repeat(150_000) });
    expect(created.status).toBe(201); expect((await created.json()).item).toMatchObject({ status: 'review', kind: 'text' });
    const short = await create(owner, { kind: 'text', text: 'a'.repeat(10_000) }); expect((await short.json()).item.status).toBe('review');
    const tooLong = await create(owner, { kind: 'text', text: 'a'.repeat(200_001) });
    expect(tooLong.status).toBe(413); expect((await tooLong.json()).error.code).toBe('BODY_TOO_LARGE');
  });
  it('in local mode takes a note, a PDF and a recording through upload and processing to review and approval', async () => {
    const owner = await cookie('sam@example.test'); const ids: string[] = [];
    ids.push((await (await create(owner, { kind: 'text', fileName: 'pricing.md', text: '# Pricing\n\nCharge monthly.' })).json()).item.id);
    for (const [fileName, mimeType, bytes] of [['note.pdf', 'application/pdf', pdf()], ['memo.wav', 'audio/x-wav', new Uint8Array(readFileSync(new URL('./fixtures/sample.wav', import.meta.url)))]] as const) {
      const { item: created, upload } = await (await create(owner, { kind: 'file', fileName, mimeType, sizeBytes: bytes.byteLength })).json();
      expect(upload).toEqual({ method: 'PUT', url: `/api/studio/items/${created.id}/file`, headers: { 'Content-Type': created.mimeType } });
      expect((await file.PUT(request(owner, upload.url, 'PUT', bytes, created.mimeType), params(created.id))).status).toBe(200);
      const processed = await (await process.POST(request(owner, `/api/studio/items/${created.id}/process`, 'POST'), params(created.id))).json();
      expect(processed.item.status).toBe('review'); ids.push(created.id);
    }
    const [, pdfItem, recording] = await Promise.all(ids.map(async id => (await (await item.GET(request(owner, `/api/studio/items/${id}`), params(id))).json()).item));
    expect(pdfItem.text).toContain('Charge for the outcome'); expect(recording.text).toContain('memo.wav');
    for (const id of ids) expect((await (await status.POST(request(owner, `/api/studio/items/${id}/status`, 'POST', JSON.stringify({ action: 'approve' })), params(id))).json()).item.status).toBe('approved');
    const list = await (await items.GET(request(owner, '/api/studio/items'))).json();
    expect(list.items.map((entry: { status: string }) => entry.status)).toEqual(['approved', 'approved', 'approved']);
    expect(list.items[0]).not.toHaveProperty('text');
    expect(existsSync(join(directory, 'knowledge', ids[1]))).toBe(true);
    expect((await item.DELETE(request(owner, `/api/studio/items/${ids[1]}`, 'DELETE'), params(ids[1]))).status).toBe(200);
    expect(existsSync(join(directory, 'knowledge', ids[1]))).toBe(false); expect(existsSync(join(directory, 'knowledge', ids[2]))).toBe(true);
  });
  it('gives anyone but the owner the standard not-found response on every studio route', async () => {
    const other = await cookie('alex@example.test'); const id = '00000000-0000-4000-8000-000000000009';
    const responses = await Promise.all([
      items.GET(request(other, '/api/studio/items')), create(other, { kind: 'text', text: 'Hi.' }),
      item.GET(request(other, `/api/studio/items/${id}`), params(id)), item.PATCH(request(other, `/api/studio/items/${id}`, 'PATCH', JSON.stringify({ title: 'x' })), params(id)), item.DELETE(request(other, `/api/studio/items/${id}`, 'DELETE'), params(id)),
      file.PUT(request(other, `/api/studio/items/${id}/file`, 'PUT', 'x', 'audio/mpeg'), params(id)), process.POST(request(other, `/api/studio/items/${id}/process`, 'POST'), params(id)), status.POST(request(other, `/api/studio/items/${id}/status`, 'POST', JSON.stringify({ action: 'approve' })), params(id)),
    ]);
    for (const response of responses) { expect(response.status).toBe(404); expect((await response.json()).error.code).toBe('NOT_FOUND'); }
  });
  it('lets the owner read but not change the Studio on the shared-data rehearsal site', async () => {
    const owner = await cookie('sam@example.test');
    const { item: note } = await (await create(owner, { kind: 'text', text: 'Before rehearsal.' })).json();
    flags.rehearsal = true; const id = note.id as string;
    expect((await items.GET(request(owner, '/api/studio/items'))).status).toBe(200);
    expect((await item.GET(request(owner, `/api/studio/items/${id}`), params(id))).status).toBe(200);
    const responses = await Promise.all([
      create(owner, { kind: 'text', text: 'Hi.' }), item.PATCH(request(owner, `/api/studio/items/${id}`, 'PATCH', JSON.stringify({ title: 'x' })), params(id)), item.DELETE(request(owner, `/api/studio/items/${id}`, 'DELETE'), params(id)),
      file.PUT(request(owner, `/api/studio/items/${id}/file`, 'PUT', 'x', 'audio/mpeg'), params(id)), process.POST(request(owner, `/api/studio/items/${id}/process`, 'POST'), params(id)), status.POST(request(owner, `/api/studio/items/${id}/status`, 'POST', JSON.stringify({ action: 'approve' })), params(id)),
    ]);
    for (const response of responses) { expect(response.status).toBe(403); expect((await response.json()).error.code).toBe('STUDIO_READ_ONLY'); }
  });
});
