'use client';
import { useEffect, useRef, useState } from 'react';
import { api, ErrorNotice } from '@/components/app';
import type { KnowledgeItem, KnowledgeItemSummary } from '@/lib/contracts';

/** A processing item older than this belongs to a request that never finished, and may be processed again. */
export const PROCESSING_LEASE_MS = 10 * 60_000;
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
/** The one-line state shown for items that are not yet ready to review. */
export function statusDetail(item: KnowledgeItemSummary, now: number): string | undefined {
  if (item.status === 'uploading') return 'Upload not finished';
  if (item.status === 'failed') return item.failureReason ?? 'This file could not be processed.';
  if (item.status !== 'processing') return undefined;
  const started = item.processingStartedAt ? Date.parse(item.processingStartedAt) : now;
  if (now - started >= PROCESSING_LEASE_MS) return 'This looks stuck';
  const minutes = Math.max(0, Math.floor((now - started) / 60_000));
  return `Working, started ${minutes === 0 ? 'less than a minute' : minutes === 1 ? '1 min' : `${minutes} min`} ago`;
}
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'The request could not complete.'; }

type Action = 'approve' | 'reject' | 'withdraw' | 'reopen';
const done: Record<Action, (title: string) => string> = {
  approve: title => `“${title}” is live.`,
  reject: title => `“${title}” was rejected.`,
  withdraw: title => `“${title}” was withdrawn to review.`,
  reopen: title => `“${title}” is back in review.`,
};

/** One item: its text to read and correct, and the actions its status allows. */
export function Review({ summary, now, readOnly, busy, file, onRetry, onRetryUpload, onChanged, onFail }: {
  summary: KnowledgeItemSummary; now: number; readOnly: boolean; busy: boolean; file?: File;
  onRetry: () => void; onRetryUpload: (file: File) => void;
  onChanged: (announcement: string, deleted?: boolean) => Promise<void>; onFail: (error: unknown) => void;
}) {
  const [item, setItem] = useState<KnowledgeItem>();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [replacement, setReplacement] = useState<File | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const { id, status, updatedAt } = summary;

  // Reload whenever the item changes on the server; edits in progress are kept until then.
  useEffect(() => {
    let active = true;
    api<{ item: KnowledgeItem }>(`/api/studio/items/${id}`).then(data => {
      if (!active) return;
      setItem(data.item); setTitle(data.item.title); setText(data.item.text); setError('');
    }).catch(caught => { if (active) onFail(caught); });
    return () => { active = false; };
  }, [id, status, updatedAt, onFail]);

  const dirty = item !== undefined && (title !== item.title || text !== item.text);
  const locked = readOnly || busy || working;

  async function save(): Promise<KnowledgeItem | null> {
    try {
      const saved = await api<{ item: KnowledgeItem }>(`/api/studio/items/${id}`, 'PATCH', { title: title.trim(), text });
      setItem(saved.item); setTitle(saved.item.title); setText(saved.item.text); return saved.item;
    } catch (caught) { setError(errorMessage(caught)); return null; }
  }
  async function run(work: () => Promise<void>) {
    setWorking(true); setError('');
    try { await work(); } catch (caught) { setError(errorMessage(caught)); } finally { setWorking(false); }
  }
  // Approving saves any unsaved correction first, so the corrected text is what gets indexed.
  const change = (action: Action) => run(async () => {
    let name = item?.title ?? summary.title;
    if (action === 'approve' && dirty) { const saved = await save(); if (!saved) return; name = saved.title; }
    await api(`/api/studio/items/${id}/status`, 'POST', { action });
    await onChanged(done[action](name));
  });

  const detail = statusDetail(summary, now);
  const stuck = status === 'processing' && summary.processingStartedAt !== undefined && now - Date.parse(summary.processingStartedAt) >= PROCESSING_LEASE_MS;
  const editable = status === 'review';
  const hasText = status === 'review' || status === 'approved' || status === 'rejected';
  const upload = replacement ?? file ?? null;

  return <section className="panel studio-review" aria-label="Review">
    <h2>{summary.title}</h2>
    <p className="fine studio-review-meta">{summary.fileName ?? 'Pasted note'} · {formatSize(summary.sizeBytes)} · added {new Date(summary.createdAt).toLocaleString()}</p>
    {detail && <p className={`notice ${status === 'failed' ? 'error-notice' : ''}`}>{detail}</p>}
    {error && <ErrorNotice error={error}/>}
    {hasText && (item ? <>
      <label htmlFor="studio-review-title">Title</label>
      <input id="studio-review-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={200} readOnly={!editable} disabled={readOnly}/>
      <label htmlFor="studio-review-text">Text</label>
      <textarea id="studio-review-text" rows={12} value={text} onChange={event => setText(event.target.value)} readOnly={!editable} disabled={readOnly}/>
      {status === 'approved' && <p className="fine">Live in conversations. Withdraw it to make changes.</p>}
    </> : <p className="fine" role="status">Loading the text…</p>)}
    {status === 'uploading' && !file && <>
      <label htmlFor="studio-retry-file">Choose the file again</label>
      <input id="studio-retry-file" type="file" onChange={event => setReplacement(event.target.files?.[0] ?? null)} disabled={locked}/>
    </>}
    <div className="actions">
      {editable && <>
        <button type="button" className="primary" disabled={locked || !item} onClick={() => void change('approve')}>Approve</button>
        <button type="button" disabled={locked || !dirty} onClick={() => void run(async () => { if (await save()) await onChanged(`Changes to “${title.trim()}” are saved.`); })}>Save changes</button>
        <button type="button" disabled={locked} onClick={() => void change('reject')}>Reject</button>
      </>}
      {status === 'approved' && <button type="button" disabled={locked} onClick={() => void change('withdraw')}>Withdraw</button>}
      {status === 'rejected' && <button type="button" disabled={locked} onClick={() => void change('reopen')}>Back to review</button>}
      {(status === 'failed' || stuck) && <button type="button" className="primary" disabled={locked} onClick={onRetry}>Retry</button>}
      {status === 'uploading' && <button type="button" className="primary" disabled={locked || !upload} onClick={() => upload && onRetryUpload(upload)}>Retry upload</button>}
      {status !== 'processing' && <button type="button" className="danger" disabled={locked} onClick={() => { dialog.current?.showModal(); keep.current?.focus(); }}>Delete</button>}
    </div>
    <dialog ref={dialog} aria-labelledby="studio-delete-title">
      <h2 id="studio-delete-title">Delete “{summary.title}”?</h2>
      <p>This removes the item{summary.kind === 'text' ? '' : ' and its stored file'}. If it is live, its passages stop reaching conversations at once. This cannot be undone.</p>
      <div className="actions">
        <button ref={keep} type="button" onClick={() => dialog.current?.close()}>Keep item</button>
        <button type="button" className="danger" disabled={working} onClick={() => void run(async () => {
          try { await api(`/api/studio/items/${id}`, 'DELETE'); } finally { dialog.current?.close(); }
          await onChanged(`“${summary.title}” was deleted.`, true);
        })}>Delete item</button>
      </div>
    </dialog>
  </section>;
}
