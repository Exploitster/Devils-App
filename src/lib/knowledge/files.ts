import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { RuntimeConfig } from '../config';
import { AppError, notFound } from '../errors';

/** Uploads never pass through the app's request body: the browser sends the file straight to this target. */
export interface UploadTarget { method: 'PUT'; url: string; headers: Record<string, string>; }
/** Stored uploads, keyed by item id. Server-only. */
export interface FileStore {
  uploadTarget(itemId: string, mimeType: string): Promise<UploadTarget>;
  /** Null when nothing was uploaded. */
  download(itemId: string): Promise<Uint8Array | null>;
  /** A missing file is not an error. */
  remove(itemId: string): Promise<void>;
}

export const FILE_LIMIT_BYTES = 50 * 1024 * 1024;
export const BUCKET = 'owner-knowledge';
const itemId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Item ids name stored objects and local files; anything else never reaches a path.
function objectName(id: string): string { if (!itemId.test(id)) throw notFound(); return id; }
export function fileTooLarge(kind: 'pdf' | 'audio'): AppError { return new AppError('FILE_TOO_LARGE', kind === 'audio' ? 'Recordings can be up to 50 MB' : 'PDFs can be up to 50 MB', 413); }

/** Production: the private bucket, reached only with the service role. No storage policies exist for it. */
export class SupabaseFileStore implements FileStore {
  constructor(private admin: SupabaseClient) {}
  private bucket() { return this.admin.storage.from(BUCKET); }
  async uploadTarget(id: string, mimeType: string): Promise<UploadTarget> {
    const { data, error } = await this.bucket().createSignedUploadUrl(objectName(id));
    if (error || !data) throw storageUnavailable();
    return { method: 'PUT', url: data.signedUrl, headers: { 'Content-Type': mimeType } };
  }
  async download(id: string): Promise<Uint8Array | null> {
    const { data, error } = await this.bucket().download(objectName(id));
    if (error) { const status = (error as { status?: number; originalError?: { status?: number } }).status ?? (error as { originalError?: { status?: number } }).originalError?.status; if (status === 400 || status === 404) return null; throw storageUnavailable(); }
    return new Uint8Array(await data.arrayBuffer());
  }
  async remove(id: string): Promise<void> { const { error } = await this.bucket().remove([objectName(id)]); if (error) throw storageUnavailable(); }
}
function storageUnavailable(): AppError { return new AppError('STORE_UNAVAILABLE', 'File storage is temporarily unavailable.', 503); }

/** Local mode: files on disk beside the SQLite database, uploaded through the local-only PUT route. */
export class LocalFileStore implements FileStore {
  constructor(private directory: string) {}
  private path(id: string) { return join(this.directory, objectName(id)); }
  async uploadTarget(id: string, mimeType: string): Promise<UploadTarget> { return { method: 'PUT', url: `/api/studio/items/${objectName(id)}/file`, headers: { 'Content-Type': mimeType } }; }
  /** Streams the body to disk, refusing more than the size cap. Replaces any earlier upload. */
  async write(id: string, body: ReadableStream<Uint8Array> | null, kind: 'pdf' | 'audio'): Promise<number> {
    const target = this.path(id); const partial = `${target}.part`; await mkdir(dirname(target), { recursive: true });
    const file = await open(partial, 'w'); let size = 0;
    try {
      const reader = body?.getReader();
      while (reader) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > FILE_LIMIT_BYTES) { await reader.cancel(); throw fileTooLarge(kind); } await file.write(value); }
    } catch (error) { await file.close(); await rm(partial, { force: true }); throw error; }
    await file.close(); await rename(partial, target); return size;
  }
  async download(id: string): Promise<Uint8Array | null> {
    try { return new Uint8Array(await readFile(this.path(id))); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
  async remove(id: string): Promise<void> { await rm(this.path(id), { force: true }); }
}

export function localFileDirectory(config: RuntimeConfig): string { return join(dirname(config.sqlitePath), 'knowledge'); }
export function createFileStore(config: RuntimeConfig): FileStore {
  if (typeof window !== 'undefined') throw new Error('Server services cannot run in a browser.');
  if (config.mode === 'local') return new LocalFileStore(localFileDirectory(config));
  return new SupabaseFileStore(createClient(config.supabaseUrl, config.supabaseServiceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }));
}
