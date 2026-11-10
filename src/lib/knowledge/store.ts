import { AppError } from '../errors';
import type { FrameworkArea, FrameworkVersion, FrameworkVersionSummary, KnowledgeItem, KnowledgeItemSummary, KnowledgePassage, KnowledgeStatus, Mode } from '../contracts';

/**
 * A search over approved passages. The words of `match` decide which passages are
 * included (any one word is enough); the words of `rank` only reorder those matches.
 * Plain text in and out, so the results suit any model provider's prompt.
 */
export interface KnowledgeSearch { match: string; rank?: string; }
export type NewKnowledgeItem = Pick<KnowledgeItem, 'kind' | 'title' | 'text' | 'mimeType' | 'sizeBytes' | 'fileName'> & { status: 'uploading' | 'review' };
export type KnowledgeItemPatch = Partial<Pick<KnowledgeItem, 'title' | 'text'>>;
/** Status details (failure reason, processing start) are replaced on every change. Approval has its own operations. */
export interface KnowledgeStatusChange { status: Exclude<KnowledgeStatus, 'approved' | 'uploading'>; failureReason?: string; processingStartedAt?: string; text?: string; }

/**
 * Owner-wide storage, deliberately apart from the per-user Store: case prep searches it
 * during every user's turn. Server code only. Passages exist only while their item is approved.
 */
export interface KnowledgeStore {
  createItem(input: NewKnowledgeItem, now: string): Promise<KnowledgeItem>;
  /** Refused with INVALID_STATUS for an approved item: withdraw it first. */
  updateItem(id: string, patch: KnowledgeItemPatch, now: string): Promise<KnowledgeItem>;
  setStatus(id: string, change: KnowledgeStatusChange, now: string): Promise<KnowledgeItem>;
  /** Stores the passages and marks the item approved in one transaction. The item must be in review. */
  approveItem(id: string, passages: string[], now: string): Promise<KnowledgeItem>;
  /** Removes the passages and returns the item to review in one transaction. */
  withdrawItem(id: string, now: string): Promise<KnowledgeItem>;
  deleteItem(id: string): Promise<void>;
  getItem(id: string): Promise<KnowledgeItem | null>;
  /** Newest first, without the item text. */
  listItems(): Promise<KnowledgeItemSummary[]>;
  /** Best first, ties broken by passage order; empty when the match text has no meaningful words. */
  search(query: KnowledgeSearch, limit: number): Promise<KnowledgePassage[]>;
  /** Appends the next version number for the mode. The highest version is live. */
  publishVersion(mode: Mode, areas: FrameworkArea[], note: string | undefined, now: string): Promise<FrameworkVersion>;
  /** Newest first, without the areas. */
  listVersions(mode: Mode): Promise<FrameworkVersionSummary[]>;
  /** The given version, or the live one when no version is given. Null when none is stored. */
  getVersion(mode: Mode, version?: number): Promise<FrameworkVersion | null>;
}

export function passageId(itemId: string, index: number): string { return `${itemId}:${String(index + 1).padStart(4, '0')}`; }
export function invalidStatus(): AppError { return new AppError('INVALID_STATUS', 'This item changed. Reload the Studio and try again.', 409); }
