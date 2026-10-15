'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { HandBackCard, Session, Counterpoint, Evidence } from '@/lib/contracts';
import { api, ApiError, ErrorNotice, Shell } from './app';
import { SourceButton } from './source';
function Points({ points }: {
    points: Counterpoint[];
}) { return <>{points.map(point => <article className="counterpoint" key={point.id}>
      <p>{point.text}</p>{point.citations.map((citation, index) => <SourceButton key={index} citation={citation}/>)}{point.interpretation && <p className="interpretation">
      <strong>Interpretation</strong>
      <br />{point.interpretation}</p>}</article>)}</>; }
async function markdown(card: HandBackCard) {
    const ids = [...new Set(card.counterpoints.flatMap(p => p.citations.map(c => c.evidenceId)))];
    const sources = await Promise.all(ids.map(id => api<{
        evidence: Evidence;
    }>(`/api/evidence/${encodeURIComponent(id)}`).then(v => v.evidence)));
    return `# Hand-back card · version ${card.version}\n\n## Your position\n${card.position}\n\n## Strengths\n${card.strengths.map(s => `- ${s}`).join('\n')}\n\n## Counterpoints\n${card.counterpoints.map(p => `- ${p.text}\n  Interpretation: ${p.interpretation ?? ''}`).join('\n')}\n\n## Open questions\n${card.openQuestions.map(s => `- ${s}`).join('\n')}\n\n## A next step this month\n${card.nextStep}\n\n## Sources\n${sources.map(s => `${s.author}. ${s.work}. ${s.edition}. ${s.publicationDate ?? 'Date unspecified'}. ${s.url}\n${s.excerpts.filter(e => card.counterpoints.some(p => p.citations.some(c => c.evidenceId === s.id && c.excerptId === e.id))).map(e => e.locator).join('; ')}`).join('\n\n')}\n\n${card.closing}\n`;
}
function Card({ card, latest }: {
    card: HandBackCard;
    latest: boolean;
}) { const [status, setStatus] = useState(''); return <section className="panel handback">
      <p className="eyebrow">Keep what is useful</p>
      <h2>Hand-back card · version {card.version}</h2>
      <p className="muted">{latest ? 'Latest saved card' : 'Earlier saved card'} · session revision {card.sessionRevision}{card.version > 1 ? ' · Updated after the conversation evolved' : ''}</p>
      <h3>Your position</h3>
      <p>{card.position}</p>
      <h3>Strengths</h3>
      <ul>{card.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
      <h3>Counterpoints</h3>{card.counterpoints.length ? <Points points={card.counterpoints}/> : <p>No relevant reviewed source was found. These reflections do not establish factual claims.</p>}<h3>Open questions</h3>
      <ul>{card.openQuestions.map((s, i) => <li key={i}>{s}</li>)}</ul>
      <h3>A next step this month</h3>
      <p>{card.nextStep}</p>
      <strong>{card.closing}</strong>
      <div className="actions">
      <button onClick={async () => { try {
    await navigator.clipboard.writeText(await markdown(card));
    setStatus('Card copied.');
}
catch {
    setStatus('Copy unavailable. Use Download Markdown.');
} }}>Copy card</button>
      <button onClick={async () => { try {
    const url = URL.createObjectURL(new Blob([await markdown(card)], { type: 'text/markdown' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `hand-back-${card.version}.md`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus('Markdown downloaded.');
}
catch (e) {
    setStatus((e as Error).message);
} }}>Download Markdown</button>
      </div>
      <p role="status">{status}</p>
      </section>; }
export function SessionView({ id }: {
    id: string;
}) {
    const router = useRouter();
    const [session, setSession] = useState<Session>();
    const [error, setError] = useState('');
    const [stale, setStale] = useState(false);
    const [text, setText] = useState('');
    const [action, setAction] = useState('message');
    const [busy, setBusy] = useState(false);
    const [title, setTitle] = useState('');
    const [confirm, setConfirm] = useState(false);
    const dialog = useRef<HTMLDialogElement>(null);
    const abort = useRef<AbortController | null>(null);
    const operation = useRef<{
        operationId: string;
        expectedRevision: number;
    } | null>(null);
    function load() {
        return api<{session: Session}>(`/api/sessions/${id}`).then(data => {
            setSession(data.session); setTitle(data.session.title); setStale(false); setError('');
        }).catch((e: Error) => setError(e.message));
    }
    useEffect(() => { void load(); return () => abort.current?.abort(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (confirm)
        dialog.current?.showModal(); }, [confirm]);
    async function generate(kind: 'turns' | 'card', skip = false) { if (!session)
        return; setBusy(true); setError(''); setStale(false); const body = { operationId: crypto.randomUUID(), expectedRevision: session.revision }; operation.current = body; abort.current = new AbortController(); try {
        const data = await api<{
            session: Session;
        }>(`/api/sessions/${id}/${kind}`, 'POST', { ...body, ...(kind === 'turns' ? { text: skip ? 'I am not sure' : text, action: skip ? 'skip' : action } : {}) }, abort.current.signal);
        setSession(data.session);
        if (kind === 'turns')
            setText('');
    }
    catch (e) {
        if ((e as Error).name !== 'AbortError') {
            setError((e as Error).message);
            setStale(e instanceof ApiError && e.status === 409);
        }
    }
    finally {
        setBusy(false);
        operation.current = null;
    } }
    async function cancel() { const body = operation.current; abort.current?.abort(); if (body) {
        try {
            const result = await api<{
                session: Session;
            }>(`/api/sessions/${id}/cancel`, 'POST', body);
            setSession(result.session);
        }
        catch (e) {
            setError((e as Error).message);
        }
    } setBusy(false); }
    const state = session?.state;
    const question = state?.clarifications.find(q => q.answer === undefined && !q.skipped);
    return <Shell mode={session?.mode}>
      <div className="session-heading">
      <div>
      <p className="eyebrow">{session?.mode ?? 'Your conversation'} · {session?.topic}</p>
      <h1>{session?.title ?? 'Loading conversation…'}</h1>
      </div>{session && <button onClick={() => setConfirm(true)}>Delete conversation</button>}</div>{error && <ErrorNotice error={`${error}${stale ? ' Your unsent text is preserved. Refresh the saved conversation before sending again.' : ''}`} retry={load}/>}<p className="fine">History and export remain available when generation access ends. <a href="/billing">Manage access</a>
      </p>{session && <>
      <details>
      <summary>Rename conversation</summary>
      <form className="actions" onSubmit={async (e) => { e.preventDefault(); try {
        const data = await api<{
            session: Session;
        }>(`/api/sessions/${id}`, 'PATCH', { title, expectedRevision: session.revision });
        setSession(data.session);
    }
    catch (e) {
        setError((e as Error).message);
    } }}>
      <label htmlFor="session-title">Title</label>
      <input id="session-title" maxLength={120} value={title} onChange={e => setTitle(e.target.value)} required/>
      <button>Save title</button>
      </form>
      </details>
      <section className="conversation" aria-label="Conversation" aria-live="polite">{session.messages.map(message => <article key={message.id} className={`message ${message.role}`}>
      <span className="eyebrow">{message.role === 'user' ? 'You' : 'Devils Advocate'}</span>{message.role === 'assistant' && message.text.startsWith('Underlying question:') ? <details><summary>Read full saved response</summary><p className="preserve">{message.text}</p></details> : <p className="preserve">{message.text}</p>}{message.citations.map((citation, index) => <SourceButton citation={citation} key={index}/>)}</article>)}</section>{state && state.phase !== 'support' && state.strengths.length > 0 && <section className="panel reflection">
      <h2>The underlying question</h2>
      <p>{state.underlyingQuestion}</p>
      <h2>Strengths</h2>
      <ul>{state.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>{state.counterpoints.length > 0 && <>
      <h2>Counterpoints</h2>
      <Points points={state.counterpoints}/>
      </>}{state.coverageNote && <p className="muted">{state.coverageNote}</p>}{state.openQuestions.map((q, i) => <p key={i}>
      <strong>{q}</strong>
      </p>)}{state.nextStep && <>
      <h3>A next step</h3>
      <p>{state.nextStep}</p>
      </>}</section>}{question && <div className="panel">
      <h2>One question before we go further</h2>
      <p>{question.question}</p>
      <button disabled={busy} onClick={() => generate('turns', true)}>I’m not sure — skip this question</button>
      </div>}{session.cards.map((card, index) => <Card key={card.id} card={card} latest={index === session.cards.length - 1}/>)}<section className="composer panel">
      <form onSubmit={event => { event.preventDefault(); void generate('turns'); }}>
      <label htmlFor="message">Your message</label>
      <textarea id="message" maxLength={12000} rows={4} value={text} onChange={e => setText(e.target.value)} placeholder={session.messages.length ? 'What would you push back on, or change?' : 'Describe your idea or decision in your own words.'} required/>
      <div className="composer-options">
      <label htmlFor="action">How to frame it</label>
      <select id="action" value={action} onChange={e => setAction(e.target.value)}>
      <option value="message">Continue the conversation</option>
      <option value="correction">Correct my position</option>
      <option value="pushback">Push back on the response</option>
      </select>
      <span className="fine">{text.length.toLocaleString()} / 12,000</span>
      </div>
      <div className="actions">
      <button className="primary" disabled={busy || stale || !text.trim()}>{busy ? 'Thinking…' : 'Send'}</button>{busy ? <button type="button" onClick={cancel}>Cancel generation</button> : <button type="button" disabled={!session.messages.length || stale} onClick={() => generate('card')}>Make a hand-back card</button>}</div>
      </form>
      <p className="fine" role="status">{busy ? 'Preparing a checked response. Your message stays here until it is saved.' : 'One generation at a time · 10 submissions/minute · 24-message context · daily cost limit applies.'}</p>
      </section>
      </>}<dialog ref={dialog} aria-labelledby="delete-title" onClose={() => setConfirm(false)}>
      <h2 id="delete-title">Delete this conversation?</h2>
      <p>This removes its messages and cards. This action cannot be undone.</p>
      <div className="actions">
      <button autoFocus onClick={() => dialog.current?.close()}>Keep conversation</button>
      <button className="danger" onClick={async () => { try {
        await api(`/api/sessions/${id}`, 'DELETE');
        router.push('/history');
    }
    catch (e) {
        setError((e as Error).message);
        dialog.current?.close();
    } }}>Delete permanently</button>
      </div>
      </dialog>
      </Shell>;
}
