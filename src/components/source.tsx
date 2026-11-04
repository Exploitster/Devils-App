'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { Citation, Evidence } from '@/lib/contracts';
import { api, ErrorNotice } from './app';
export function SourceButton({ citation }: {
    citation: Citation;
}) {
    const titleId = useId();
    const dialog = useRef<HTMLDialogElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const [source, setSource] = useState<Evidence>();
    const [error, setError] = useState('');
    const [open, setOpen] = useState(false);
    useEffect(() => { if (open) {
        dialog.current?.showModal();
        api<{
            evidence: Evidence;
        }>(`/api/evidence/${encodeURIComponent(citation.evidenceId)}`).then(data => setSource(data.evidence)).catch(e => setError(e.message));
    } }, [open, citation.evidenceId]);
    function close() { dialog.current?.close(); setOpen(false); trigger.current?.focus(); }
    const excerpt = source?.excerpts.find(value => value.id === citation.excerptId);
    const claim = source?.claims.find(value => value.id === citation.claimId);
    return <>
      <button ref={trigger} className="citation" onClick={() => { setError(''); setOpen(true); }}>View source · {citation.kind}</button>
      <dialog ref={dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); close(); }} onClose={() => { setOpen(false); trigger.current?.focus(); }}>
      <div className="dialog-head">
      <h2 id={titleId}>{source?.title ?? 'Source details'}</h2>
      <button onClick={close} aria-label="Close source">Close</button>
      </div>{error ? <ErrorNotice error={error} retry={() => { setOpen(false); setTimeout(() => setOpen(true), 0); }}/> : !source ? <p role="status">Loading canonical source…</p> : <>
      <p>{source.author} · {source.publisher}</p>
      <dl>
      <dt>Work</dt>
      <dd>{source.work}</dd>
      <dt>Edition</dt>
      <dd>{source.edition || 'Not specified'}</dd>
      <dt>Published</dt>
      <dd>{source.publicationDate ?? 'Date not specified'}</dd>
      <dt>Locator</dt>
      <dd>{excerpt?.locator}</dd>
      <dt>License</dt>
      <dd>{source.license}</dd>
      </dl>
      <h3>{citation.kind === 'quote' ? 'Exact quotation' : 'Supporting source excerpt'}</h3>
      <blockquote>{citation.kind === 'quote' ? citation.quote : excerpt?.text}</blockquote>{claim && <>
      <h3>Supported claim</h3>
      <p>{claim.text}</p>
      </>}<h3>Limits of this comparison</h3>{source.limitations.map((limit, index) => <p key={index}>{limit}</p>)}<a href={source.url} target="_blank" rel="noopener noreferrer">Read the original source (opens a new tab)</a>
      </>}</dialog>
      </>;
}
