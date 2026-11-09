import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { FrameworkArea, FrameworkVersion, FrameworkVersionSummary, KnowledgeItem, KnowledgeItemSummary, KnowledgePassage, Mode } from '../contracts';
import { AppError, notFound } from '../errors';
import { searchTerms } from './query';
import { invalidStatus, type KnowledgeItemPatch, type KnowledgeSearch, type KnowledgeStatusChange, type KnowledgeStore, type NewKnowledgeItem } from './store';

// PostgREST reports an unknown function as PGRST202; PostgreSQL itself as 42883.
const missingFunction = new Set(['PGRST202', '42883']);
export function studioUnavailable(): AppError { return new AppError('STUDIO_UNAVAILABLE', 'The Studio needs its database update. Apply migration 005.', 503); }

export class SupabaseKnowledgeStore implements KnowledgeStore {
  constructor(private admin: SupabaseClient) {}
  private async call<T>(action: string, value: unknown): Promise<T> {
    const { data, error } = await this.admin.rpc('knowledge_operation', { action, value });
    if (!error) return data as T;
    if (missingFunction.has(error.code ?? '')) throw studioUnavailable();
    if (error.message === 'NOT_FOUND') throw notFound();
    if (error.message === 'INVALID_STATUS') throw invalidStatus();
    throw new AppError('STORE_UNAVAILABLE', 'Storage is temporarily unavailable.', 503);
  }
  createItem(input: NewKnowledgeItem, now: string) { return this.call<KnowledgeItem>('createItem', { ...input, id: randomUUID(), createdAt: now, updatedAt: now }); }
  updateItem(id: string, patch: KnowledgeItemPatch, now: string) { return this.call<KnowledgeItem>('updateItem', { id, patch, now }); }
  setStatus(id: string, change: KnowledgeStatusChange, now: string) { return this.call<KnowledgeItem>('setStatus', { id, change, now }); }
  approveItem(id: string, passages: string[], now: string) { return this.call<KnowledgeItem>('approveItem', { id, passages, now }); }
  withdrawItem(id: string, now: string) { return this.call<KnowledgeItem>('withdrawItem', { id, now }); }
  async deleteItem(id: string) { await this.call('deleteItem', { id }); }
  getItem(id: string) { return this.call<KnowledgeItem | null>('getItem', { id }); }
  listItems() { return this.call<KnowledgeItemSummary[]>('listItems', {}); }
  async search(query: KnowledgeSearch, limit: number): Promise<KnowledgePassage[]> {
    const match = searchTerms(query.match); if (!match.length) return [];
    return this.call<KnowledgePassage[]>('search', { match: match.join(' '), rank: searchTerms(query.rank ?? '').join(' '), limit });
  }
  publishVersion(mode: Mode, areas: FrameworkArea[], note: string | undefined, now: string) { return this.call<FrameworkVersion>('publishVersion', { mode, areas, ...(note === undefined ? {} : { note }), now }); }
  listVersions(mode: Mode) { return this.call<FrameworkVersionSummary[]>('listVersions', { mode }); }
  getVersion(mode: Mode, version?: number) { return this.call<FrameworkVersion | null>('getVersion', { mode, ...(version === undefined ? {} : { version }) }); }
}
