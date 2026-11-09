import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LocalKnowledgeStore } from '../src/lib/knowledge/local-store';
import { SupabaseKnowledgeStore } from '../src/lib/knowledge/supabase-store';
import { LocalStore } from '../src/lib/store/local';
import { caseAreas } from '../src/lib/case-prep/frameworks';
import { getKnowledgeStore } from '../src/lib/auth/service';
import { readConfig } from '../src/lib/config';

const now = '2026-11-09T10:00:00.000Z';
let directory: string; let store: LocalKnowledgeStore;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'devils-knowledge-')); store = new LocalKnowledgeStore(join(directory, 'store.sqlite')); });
afterEach(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
const note = (title: string, text: string) => store.createItem({ kind: 'text', status: 'review', title, text, mimeType: 'text/plain', sizeBytes: text.length }, now);
async function approved(title: string, passages: string[]) { const item = await note(title, passages.join('\n\n')); return store.approveItem(item.id, passages, now); }
const texts = (rows: { text: string }[]) => rows.map(row => row.text);

describe('local knowledge store', () => {
  it('finds an approved passage from the words of an answer, never one from an unapproved item', async () => {
    await approved('Notes', ['Monthly subscription pricing works when customers see the value every month.']);
    await note('Draft', 'A pending note about subscription pricing.');
    const results = await store.search({ match: "I'll charge ten dollars a month for the subscription" }, 3);
    expect(results).toEqual([{ text: 'Monthly subscription pricing works when customers see the value every month.' }]);
  });
  it('lets the answer decide what matches while area and topic words only reorder the matches', async () => {
    await approved('Guide', ['Set the price before launch.', 'Customers judge the price before launch.', 'Customers everywhere want attention.']);
    expect(texts(await store.search({ match: 'what price' }, 5))).toEqual(['Set the price before launch.', 'Customers judge the price before launch.']);
    expect(texts(await store.search({ match: 'what price', rank: 'customers' }, 5))).toEqual(['Customers judge the price before launch.', 'Set the price before launch.']);
    expect(await store.search({ match: 'nothing relevant', rank: 'customers price' }, 5)).toEqual([]);
  });
  it('returns nothing for stop words and never fails on search operators or quotes', async () => {
    await approved('Guide', ['The price of the product.']);
    expect(await store.search({ match: 'and the of', rank: 'price' }, 3)).toEqual([]);
    expect(texts(await store.search({ match: 'price" OR NEAR(* -' }, 3))).toEqual(['The price of the product.']);
    expect(await store.search({ match: '"' }, 3)).toEqual([]);
  });
  it('orders by rank, breaks ties by passage order, and caps at the limit', async () => {
    await approved('Guide', ['Pricing note two.', 'Pricing note one.', 'Pricing pricing pricing.']);
    expect(texts(await store.search({ match: 'pricing' }, 3))).toEqual(['Pricing pricing pricing.', 'Pricing note two.', 'Pricing note one.']);
    expect(await store.search({ match: 'pricing' }, 2)).toHaveLength(2);
  });
  it('stops searching withdrawn and deleted items at once', async () => {
    const kept = await approved('Kept', ['Pricing that stays.']);
    const withdrawn = await approved('Withdrawn', ['Pricing that is withdrawn.']);
    expect(await store.withdrawItem(withdrawn.id, now)).toMatchObject({ status: 'review' });
    expect(texts(await store.search({ match: 'pricing' }, 5))).toEqual(['Pricing that stays.']);
    await store.deleteItem(kept.id);
    expect(await store.search({ match: 'pricing' }, 5)).toEqual([]);
    expect(await store.getItem(kept.id)).toBeNull();
    expect((await store.listItems()).map(item => item.id)).toEqual([withdrawn.id]);
  });
  it('keeps the item lifecycle on the item and refuses to change an approved item in place', async () => {
    const item = await store.createItem({ kind: 'audio', status: 'uploading', title: 'Call', text: '', mimeType: 'audio/mp4', fileName: 'call.m4a', sizeBytes: 2048 }, now);
    expect(await store.setStatus(item.id, { status: 'processing', processingStartedAt: now }, now)).toMatchObject({ status: 'processing', processingStartedAt: now });
    const failed = await store.setStatus(item.id, { status: 'failed', failureReason: 'Recording too long' }, now);
    expect(failed).toMatchObject({ status: 'failed', failureReason: 'Recording too long' }); expect(failed.processingStartedAt).toBeUndefined();
    const review = await store.setStatus(item.id, { status: 'review', text: 'Transcript text.' }, now);
    expect(review).toMatchObject({ status: 'review', text: 'Transcript text.' }); expect(review.failureReason).toBeUndefined();
    expect(await store.updateItem(item.id, { title: 'Pricing call' }, now)).toMatchObject({ title: 'Pricing call', text: 'Transcript text.' });
    await store.approveItem(item.id, ['Transcript text.'], now);
    for (const change of [() => store.updateItem(item.id, { text: 'Changed' }, now), () => store.setStatus(item.id, { status: 'rejected' }, now), () => store.approveItem(item.id, ['Again.'], now)]) await expect(change()).rejects.toMatchObject({ code: 'INVALID_STATUS', status: 409 });
    expect((await store.listItems())[0]).not.toHaveProperty('text');
  });
  it('appends question-set versions and treats the highest as live', async () => {
    const areas = caseAreas.business.slice(0, 2);
    expect(await store.getVersion('business')).toBeNull();
    expect(await store.publishVersion('business', areas, 'First edit', now)).toMatchObject({ mode: 'business', version: 1, note: 'First edit' });
    expect(await store.publishVersion('business', areas.slice(0, 1), undefined, '2026-11-09T11:00:00.000Z')).toMatchObject({ version: 2 });
    expect(await store.getVersion('business')).toMatchObject({ version: 2, areas: areas.slice(0, 1) });
    expect(await store.getVersion('business', 1)).toEqual({ mode: 'business', version: 1, areas, note: 'First edit', createdAt: now });
    expect(await store.getVersion('philosophy')).toBeNull();
    expect((await store.listVersions('business')).map(version => version.version)).toEqual([2, 1]);
  });
  it('shares the application database file without disturbing the per-user store', async () => {
    const users = new LocalStore(join(directory, 'store.sqlite'));
    await users.putProfile({ id: 'a', email: 'a@example.test', disabled: false, deletionState: 'none', createdAt: now });
    await approved('Notes', ['Pricing in the shared file.']);
    expect(await users.getProfile('a')).toMatchObject({ id: 'a' }); users.close();
  });
});

describe('Supabase knowledge store', () => {
  const client = (result: { data?: unknown; error?: { code?: string; message: string } | null }) => { const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null }); return { rpc, store: new SupabaseKnowledgeStore({ rpc } as unknown as SupabaseClient) }; };
  it('sends plain answer and ranking terms to the service-only function and skips stop-word queries', async () => {
    const { rpc, store: remote } = client({ data: [{ text: 'A passage.' }] });
    expect(await remote.search({ match: 'and the of', rank: 'pricing' }, 3)).toEqual([]); expect(rpc).not.toHaveBeenCalled();
    expect(await remote.search({ match: "I'll charge monthly", rank: 'Money and pricing' }, 3)).toEqual([{ text: 'A passage.' }]);
    expect(rpc).toHaveBeenCalledWith('knowledge_operation', { action: 'search', value: { match: 'charge monthly', rank: 'money pricing', limit: 3 } });
  });
  it('reports a database without the knowledge migration as an unavailable Studio', async () => {
    for (const error of [{ code: 'PGRST202', message: 'Could not find the function public.knowledge_operation(action, value) in the schema cache' }, { code: '42883', message: 'function public.knowledge_operation(text, jsonb) does not exist' }]) await expect(client({ error }).store.listItems()).rejects.toMatchObject({ code: 'STUDIO_UNAVAILABLE', status: 503 });
    await expect(client({ error: { code: 'P0001', message: 'INVALID_STATUS' } }).store.withdrawItem('item', now)).rejects.toMatchObject({ code: 'INVALID_STATUS', status: 409 });
    await expect(client({ error: { code: 'P0001', message: 'NOT_FOUND' } }).store.withdrawItem('item', now)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    await expect(client({ error: { code: '08006', message: 'connection failure' } }).store.listItems()).rejects.toMatchObject({ code: 'STORE_UNAVAILABLE', status: 503 });
  });
});

describe('knowledge store factory', () => {
  it('uses the local SQLite file in local mode and the service-role function in services mode', () => {
    const local = readConfig({ DEVILS_RUNTIME_MODE: 'local', DEVILS_LOCAL_AUTH_SECRET: 'x'.repeat(32), DEVILS_SQLITE_PATH: join(directory, 'factory.sqlite') });
    expect(getKnowledgeStore(local)).toBeInstanceOf(LocalKnowledgeStore);
    expect(getKnowledgeStore(local)).toBe(getKnowledgeStore(local));
    const services = readConfig({ DEVILS_SUPABASE_URL: 'https://example.supabase.co', DEVILS_SUPABASE_ANON_KEY: 'public', DEVILS_SUPABASE_SERVICE_ROLE_KEY: 'service', DEVILS_MODEL_PROVIDER: 'gateway' });
    expect(getKnowledgeStore(services)).toBeInstanceOf(SupabaseKnowledgeStore);
  });
});
