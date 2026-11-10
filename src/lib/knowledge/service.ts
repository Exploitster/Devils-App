import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { STATUS_ACTIONS, type KnowledgeItem, type KnowledgeItemSummary, type StatusAction, type Store, type UploadTarget } from '../contracts';
import type { RuntimeConfig } from '../config';
import { PROCESSING_LEASE_MS } from '../limits';
import { AppError, notFound } from '../errors';
import { logEvent } from '../logging';
import { getKnowledgeStore, getStore } from '../auth/service';
import { authorizeStudio } from '../studio/access';
import { chunkText } from './chunk';
import { extractPdfText } from './extract';
import { FILE_LIMIT_BYTES, createFileStore, fileTooLarge, type FileStore } from './files';
import { invalidStatus, type KnowledgeStore } from './store';
import { TranscriptionError, createTranscriber, type Transcriber } from './transcribe';

export const NOTE_CHARACTER_LIMIT = 200_000;
/** Enough request body for a note at the character limit after UTF-8 and JSON escaping. */
export const CREATE_BODY_LIMIT = 850_000;
/** Item text is capped by the stored item format; edits send the whole text back. */
const ITEM_TEXT_LIMIT = 1_000_000;
export const UPDATE_BODY_LIMIT = 4_400_000;
const PROCESSABLE: readonly KnowledgeItem['status'][] = ['uploading', 'failed', 'processing'];

const Title = z.string().trim().min(1).max(200);
const FileName = z.string().trim().min(1).max(255);
export const CreateItemSchema = z.discriminatedUnion('kind', [
  // Length is checked after parsing so an over-long note gets the size error, not a field error.
  z.object({ kind: z.literal('text'), title: Title.optional(), fileName: FileName.optional(), text: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('file'), title: Title.optional(), fileName: FileName, mimeType: z.string().max(100), sizeBytes: z.number().int().positive() }).strict(),
]);
export type CreateItemInput = z.infer<typeof CreateItemSchema>;
export const UpdateItemSchema = z.object({ title: Title.optional(), text: z.string().max(ITEM_TEXT_LIMIT).optional() }).strict();
export const StatusActionSchema = z.object({ action: z.enum(STATUS_ACTIONS) }).strict();

// Browsers report the same format under several names. Each resolves to one canonical type,
// which is stored and sent to the transcriber. An empty type is resolved by extension.
const canonicalByExtension: Record<string, { kind: KnowledgeItem['kind']; mimeType: string }> = {
  pdf: { kind: 'pdf', mimeType: 'application/pdf' },
  mp3: { kind: 'audio', mimeType: 'audio/mpeg' }, m4a: { kind: 'audio', mimeType: 'audio/mp4' }, mp4: { kind: 'audio', mimeType: 'audio/mp4' },
  wav: { kind: 'audio', mimeType: 'audio/wav' }, webm: { kind: 'audio', mimeType: 'audio/webm' }, ogg: { kind: 'audio', mimeType: 'audio/ogg' }, flac: { kind: 'audio', mimeType: 'audio/flac' },
  txt: { kind: 'text', mimeType: 'text/plain' }, md: { kind: 'text', mimeType: 'text/markdown' },
};
// Chrome and Firefox label .webm and .mp4 files as video even when they hold only audio.
const aliases: Record<string, string> = { 'audio/x-m4a': 'audio/mp4', 'audio/x-wav': 'audio/wav', 'audio/mp3': 'audio/mpeg', 'audio/x-flac': 'audio/flac', 'video/webm': 'audio/webm', 'video/mp4': 'audio/mp4' };
const extension = (fileName: string) => /\.([a-z0-9]+)$/i.exec(fileName)?.[1].toLowerCase() ?? '';
export function resolveFileType(fileName: string, declared: string): { kind: KnowledgeItem['kind']; mimeType: string } | null {
  const type = declared.trim().toLowerCase().split(';')[0].trim();
  if (!type) return canonicalByExtension[extension(fileName)] ?? null;
  const canonical = aliases[type] ?? type;
  return Object.values(canonicalByExtension).find(entry => entry.mimeType === canonical) ?? null;
}
function unsupported(): AppError { return new AppError('UNSUPPORTED_TYPE', 'Upload a PDF, a .txt or .md note, or an MP3, M4A, MP4, WAV, WebM, OGG or FLAC recording.', 415); }
const stem = (fileName: string) => fileName.replace(/\.[^.]*$/, '').trim().slice(0, 200) || fileName.slice(0, 200);

export interface KnowledgeServiceDeps {
  store: KnowledgeStore; files: FileStore; transcriber: Transcriber;
  spend: Pick<Store, 'reserveSpend' | 'reconcileSpend'>;
  config: RuntimeConfig; ownerId: string; now?: () => Date;
}
export interface ProcessResult { item: KnowledgeItem; failure?: { code: string; message: string }; }

export class KnowledgeService {
  private now: () => Date;
  constructor(private deps: KnowledgeServiceDeps) { this.now = deps.now ?? (() => new Date()); }
  private stamp() { return this.now().toISOString(); }
  private async existing(id: string): Promise<KnowledgeItem> { const item = await this.deps.store.getItem(id); if (!item) throw notFound(); return item; }

  list(): Promise<KnowledgeItemSummary[]> { return this.deps.store.listItems(); }
  get(id: string): Promise<KnowledgeItem> { return this.existing(id); }

  async create(input: CreateItemInput): Promise<{ item: KnowledgeItem; upload?: UploadTarget }> {
    const { store, files } = this.deps;
    if (input.kind === 'text') {
      if ([...input.text].length > NOTE_CHARACTER_LIMIT) throw new AppError('BODY_TOO_LARGE', 'Notes can be up to 200,000 characters.', 413);
      const type = input.fileName === undefined ? canonicalByExtension.txt : resolveFileType(input.fileName, '');
      if (type?.kind !== 'text') throw unsupported();
      const item = await store.createItem({ kind: 'text', status: 'review', title: input.title ?? (input.fileName ? stem(input.fileName) : 'Untitled note'), text: input.text, mimeType: type.mimeType, sizeBytes: Buffer.byteLength(input.text), ...(input.fileName ? { fileName: input.fileName } : {}) }, this.stamp());
      return { item };
    }
    const type = resolveFileType(input.fileName, input.mimeType);
    if (!type || type.kind === 'text') throw unsupported();
    if (input.sizeBytes > FILE_LIMIT_BYTES) throw fileTooLarge(type.kind);
    const item = await store.createItem({ kind: type.kind, status: 'uploading', title: input.title ?? stem(input.fileName), text: '', mimeType: type.mimeType, sizeBytes: input.sizeBytes, fileName: input.fileName }, this.stamp());
    return { item, upload: await files.uploadTarget(item.id, type.mimeType) };
  }

  async update(id: string, patch: z.infer<typeof UpdateItemSchema>): Promise<KnowledgeItem> {
    if ((await this.existing(id)).status !== 'review') throw invalidStatus();
    return this.deps.store.updateItem(id, patch, this.stamp());
  }

  /** The stored file goes first, so a failed delete leaves the item to delete again. */
  async remove(id: string): Promise<void> {
    const item = await this.existing(id);
    if (item.kind !== 'text') await this.deps.files.remove(id);
    await this.deps.store.deleteItem(id);
  }

  async changeStatus(id: string, action: StatusAction): Promise<KnowledgeItem> {
    const { store } = this.deps; const item = await this.existing(id); const now = this.stamp();
    if (action === 'withdraw') return store.withdrawItem(id, now);
    if (action === 'reopen') { if (item.status !== 'rejected') throw invalidStatus(); return store.setStatus(id, { status: 'review' }, now); }
    if (item.status !== 'review') throw invalidStatus();
    if (action === 'reject') return store.setStatus(id, { status: 'rejected' }, now);
    return store.approveItem(id, chunkText(item.text), now);
  }

  async process(id: string): Promise<ProcessResult> {
    const { store, files } = this.deps; const item = await this.existing(id);
    if (item.kind === 'text') throw invalidStatus();
    if (item.status === 'processing' && item.processingStartedAt && this.now().getTime() - Date.parse(item.processingStartedAt) < PROCESSING_LEASE_MS) throw new AppError('PROCESSING', 'This item is still being processed. Try again in a few minutes.', 409);
    if (!PROCESSABLE.includes(item.status)) throw invalidStatus();
    const started = this.now(); await store.setStatus(id, { status: 'processing', processingStartedAt: started.toISOString() }, started.toISOString());
    let costMicros = 0;
    try {
      const bytes = await files.download(id);
      if (!bytes) throw new AppError('FILE_MISSING', 'The file did not finish uploading. Delete this item and upload it again.', 409);
      if (bytes.byteLength > FILE_LIMIT_BYTES) throw fileTooLarge(item.kind);
      let text: string;
      if (item.kind === 'pdf') text = await extractPdfText(bytes);
      else ({ text, costMicros } = await this.transcribe(item, bytes));
      if (text.length > ITEM_TEXT_LIMIT) throw new AppError('TEXT_TOO_LONG', 'This file has too much text: split it into shorter parts.', 422);
      const saved = await store.setStatus(id, { status: 'review', text }, this.stamp());
      logEvent('knowledge_processed', { id, elapsedMs: this.now().getTime() - started.getTime(), costMicros });
      return { item: saved };
    } catch (error) {
      const failure = error instanceof AppError ? { code: error.code, message: error.message } : { code: 'PROCESSING_FAILED', message: 'This file could not be processed. Try again.' };
      const saved = await store.setStatus(id, { status: 'failed', failureReason: failure.message }, this.stamp());
      logEvent('knowledge_failed', { id, code: failure.code, elapsedMs: this.now().getTime() - started.getTime() });
      return { item: saved, failure };
    }
  }

  private async transcribe(item: KnowledgeItem, audio: Uint8Array) {
    const { transcriber, spend, config, ownerId } = this.deps;
    const reservedMicros = transcriber.reserveMicros(audio.byteLength);
    const attemptId = randomUUID();
    await spend.reserveSpend({ id: attemptId, operationId: item.id, userId: ownerId, reservedMicros, createdAt: this.stamp() }, config.dailySpendLimitMicros);
    try {
      const result = await transcriber.transcribe({ audio, mimeType: item.mimeType, fileName: item.fileName ?? item.title });
      await spend.reconcileSpend(attemptId, result.costMicros); return result;
    } catch (error) {
      // Without a reported cost, a call that may still be billed keeps its full reservation.
      await spend.reconcileSpend(attemptId, error instanceof TranscriptionError && error.costMicros !== undefined ? error.costMicros : reservedMicros);
      throw error;
    }
  }
}

export async function studioService(request: Request, options: { write: boolean }): Promise<KnowledgeService> {
  const { owner, config } = await authorizeStudio(request, options);
  return new KnowledgeService({ store: getKnowledgeStore(config), files: createFileStore(config), transcriber: createTranscriber(config), spend: await getStore(request), config, ownerId: owner.id });
}
