'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError, ErrorNotice } from '@/components/app';
import type { KnowledgeItem, KnowledgeItemSummary } from '@/lib/contracts';
import { Review, errorMessage, formatSize, statusDetail } from './review';

/** Where the browser sends a file: a signed storage URL in production, the app's own upload route locally. */
export interface UploadTarget { method: 'PUT'; url: string; headers: Record<string, string>; }
interface Created { item: KnowledgeItem; upload?: UploadTarget; }
interface Processed { item: KnowledgeItem; failure?: { code: string; message: string }; }

const POLL_MS = 10_000;
const ACCEPT = '.txt,.md,.pdf,.mp3,.m4a,.mp4,.wav,.webm,.ogg,.flac,text/plain,text/markdown,application/pdf,audio/*';

const kindLabel: Record<KnowledgeItem['kind'], string> = { text: 'Note', pdf: 'PDF', audio: 'Recording' };
const statusLabel: Record<KnowledgeItem['status'], string> = { uploading: 'Uploading', processing: 'Processing', review: 'In review', approved: 'Live', rejected: 'Rejected', failed: 'Failed' };
const isTextFile = (name: string) => /\.(txt|md)$/i.test(name);

export function Library({ readOnly, onUnavailable }: { readOnly: boolean; onUnavailable: () => void }) {
  const [items, setItems] = useState<KnowledgeItemSummary[] | null>(null);
  const [now, setNow] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [step, setStep] = useState('');
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const statuses = useRef(new Map<string, KnowledgeItem['status']>());
  // Files chosen in this visit, so an unfinished upload can be retried without choosing the file again.
  const files = useRef(new Map<string, File>());

  const fail = useCallback((caught: unknown) => {
    if (caught instanceof ApiError && caught.code === 'STUDIO_UNAVAILABLE') onUnavailable();
    else setError(errorMessage(caught));
  }, [onUnavailable]);

  const show = useCallback((data: { items: KnowledgeItemSummary[] }) => {
    // Processing can finish in another tab or after a reload; say so when the list notices.
    for (const entry of data.items) {
      if (statuses.current.get(entry.id) === 'processing' && entry.status === 'review') setAnnouncement(`“${entry.title}” is ready for review.`);
      if (statuses.current.get(entry.id) === 'processing' && entry.status === 'failed') setAnnouncement(`“${entry.title}” could not be processed.`);
    }
    statuses.current = new Map(data.items.map(entry => [entry.id, entry.status]));
    setItems(data.items); setNow(Date.now()); setError('');
  }, []);
  const load = useCallback(() => api<{ items: KnowledgeItemSummary[] }>('/api/studio/items').then(show).catch(fail), [show, fail]);
  useEffect(() => { void load(); }, [load]);
  const processing = items?.some(entry => entry.status === 'processing') ?? false;
  useEffect(() => {
    if (!processing) return;
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [processing, load]);

  function markProcessing(id: string) {
    statuses.current.set(id, 'processing');
    setItems(current => current?.map(entry => entry.id === id ? { ...entry, status: 'processing', processingStartedAt: new Date().toISOString() } : entry) ?? current);
    setNow(Date.now());
  }

  /** Sends the file to its upload target, then asks the server to extract or transcribe it. */
  async function uploadAndProcess(item: KnowledgeItem, chosen: File, upload: UploadTarget, total: number) {
    const first = total - 1;
    setStep(`Step ${first} of ${total}: uploading ${chosen.name}…`);
    let sent: Response;
    try { sent = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: chosen, credentials: 'same-origin' }); }
    catch { throw new Error('The upload did not finish. Check your connection and retry the upload.'); }
    if (!sent.ok) {
      const body = await sent.json().catch(() => null) as { error?: { message?: string } } | null;
      throw new Error(body?.error?.message ?? 'The upload did not finish. Retry the upload.');
    }
    await process(item, total);
  }
  async function process(item: KnowledgeItemSummary, total: number) {
    setStep(`Step ${total} of ${total}: ${item.kind === 'audio' ? 'transcribing the recording. This can take a few minutes' : 'reading the PDF'}…`);
    markProcessing(item.id);
    const result = await api<Processed>(`/api/studio/items/${item.id}/process`, 'POST');
    setAnnouncement(result.failure ? `“${result.item.title}” could not be processed: ${result.failure.message}` : `“${result.item.title}” is ready for review.`);
    if (!result.failure) files.current.delete(item.id);
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!file && !note.trim()) { setError('Paste a note or choose a file to add.'); return; }
    setBusy(true); setError(''); setAnnouncement('');
    let id: string | undefined;
    try {
      const named = title.trim() || undefined;
      if (file && !isTextFile(file.name)) {
        setStep('Step 1 of 3: adding the item…');
        const created = await api<Created>('/api/studio/items', 'POST', { kind: 'file', ...(named ? { title: named } : {}), fileName: file.name, mimeType: file.type, sizeBytes: file.size });
        id = created.item.id; files.current.set(id, file);
        await load();
        await uploadAndProcess(created.item, file, created.upload!, 3);
      } else {
        const text = file ? await file.text() : note;
        const created = await api<Created>('/api/studio/items', 'POST', { kind: 'text', ...(named ? { title: named } : {}), ...(file ? { fileName: file.name } : {}), text });
        id = created.item.id;
        setAnnouncement(`“${created.item.title}” is ready for review.`);
        if (!file) setNote('');
      }
      setTitle(''); setFile(null); if (fileInput.current) fileInput.current.value = '';
    } catch (caught) { fail(caught); }
    finally { setStep(''); setBusy(false); await load(); if (id) setSelected(id); }
  }

  async function retryUpload(item: KnowledgeItemSummary, chosen: File) {
    setBusy(true); setError(''); setAnnouncement('');
    try {
      // A fresh upload target, since a signed upload URL expires.
      const created = await api<Created>('/api/studio/items', 'POST', { kind: 'file', title: item.title, fileName: chosen.name, mimeType: chosen.type, sizeBytes: chosen.size });
      files.current.set(created.item.id, chosen);
      await api(`/api/studio/items/${item.id}`, 'DELETE');
      files.current.delete(item.id);
      await load(); setSelected(created.item.id);
      await uploadAndProcess(created.item, chosen, created.upload!, 3);
    } catch (caught) { fail(caught); }
    finally { setStep(''); setBusy(false); await load(); }
  }
  async function retry(item: KnowledgeItemSummary) {
    setBusy(true); setError(''); setAnnouncement('');
    try { await process(item, 1); } catch (caught) { fail(caught); }
    finally { setStep(''); setBusy(false); await load(); }
  }

  const current = items?.find(entry => entry.id === selected);
  return <div className="studio-library">
    <form className="panel studio-add" onSubmit={add} aria-labelledby="studio-add-title">
      <h2 id="studio-add-title">Add material</h2>
      <p className="fine">Paste a note, or upload a text, Markdown or PDF file, or a recording in MP3, M4A, MP4, WAV, WebM, OGG or FLAC, up to 50 MB. Everything waits for your review before it reaches a conversation.</p>
      <label htmlFor="studio-item-title">Title (optional)</label>
      <input id="studio-item-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={200} disabled={readOnly}/>
      <label htmlFor="studio-note">Paste a note</label>
      <textarea id="studio-note" rows={5} value={note} onChange={event => setNote(event.target.value)} disabled={readOnly}/>
      <label htmlFor="studio-file">Or choose a file</label>
      <input id="studio-file" ref={fileInput} type="file" accept={ACCEPT} onChange={event => setFile(event.target.files?.[0] ?? null)} disabled={readOnly}/>
      <button className="primary" disabled={busy || readOnly}>{busy ? 'Adding…' : 'Add to library'}</button>
      {step && <p className="fine studio-step">{step}</p>}
    </form>
    <p className="fine studio-announcement" role="status">{announcement}</p>
    {error && <ErrorNotice error={error} retry={items ? undefined : () => void load()}/>}
    <div className="studio-columns">
      <section className="panel studio-list" aria-labelledby="studio-list-title">
        <h2 id="studio-list-title">Library</h2>
        {items === null ? <p className="fine" role="status">Loading the library…</p>
          : items.length === 0 ? <p className="fine">Nothing here yet. Add a note or a recording above.</p>
            : <ul aria-label="Library items">{items.map(entry => {
              const detail = statusDetail(entry, now);
              return <li key={entry.id} className={entry.id === selected ? 'selected' : undefined}>
                <button type="button" className="studio-item" aria-pressed={entry.id === selected} onClick={() => setSelected(entry.id)}>
                  <span className="studio-item-title">{entry.title}</span>
                  <span className="studio-item-meta">
                    <span className={`studio-badge status-${entry.status}`}>{statusLabel[entry.status]}</span>
                    <span>{kindLabel[entry.kind]}</span><span>{formatSize(entry.sizeBytes)}</span>
                    <span>{new Date(entry.createdAt).toLocaleDateString()}</span>
                  </span>
                  {detail && <span className="studio-item-detail">{detail}</span>}
                </button>
              </li>;
            })}</ul>}
      </section>
      {current ? <Review key={current.id} summary={current} now={now} readOnly={readOnly} busy={busy} file={files.current.get(current.id)}
        onRetry={() => void retry(current)} onRetryUpload={chosen => void retryUpload(current, chosen)} onFail={fail}
        onChanged={async (message, deleted) => { setAnnouncement(message); if (deleted) { files.current.delete(current.id); setSelected(undefined); } await load(); }}/>
        : items && items.length > 0 && <section className="panel studio-review studio-review-empty" aria-label="Review"><p className="fine">Choose an item to read, correct and approve it.</p></section>}
    </div>
  </div>;
}
