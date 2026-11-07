'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { HandBackCard, Session, Counterpoint, Evidence, TurnAction } from '@/lib/contracts';
import Link from 'next/link';
import { api, ApiError, ErrorNotice, Shell } from './app';
import { Composer } from './composer';
import { SourceButton } from './source';
import { takeFirstMessage } from '@/lib/pending-message';
import '@/styles/chat.css';
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
      <p className="eyebrow">YOUR DECISION, WITH A LITTLE MORE CLARITY</p>
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
    const [action, setAction] = useState<Exclude<TurnAction, 'skip'>>('message');
    const [busy, setBusy] = useState(false);
    const [sending, setSending] = useState('');
    const [title, setTitle] = useState('');
    const [confirm, setConfirm] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [expired, setExpired] = useState(false);
    const dialog = useRef<HTMLDialogElement>(null);
    const composer = useRef<HTMLTextAreaElement>(null);
    const latestReply = useRef<HTMLDivElement>(null);
    const followReply = useRef(false);
    const cancelling = useRef(false);
    const abort = useRef<AbortController | null>(null);
    const operation = useRef<{
        operationId: string;
        expectedRevision: number;
    } | null>(null);
    function load(isCurrent: () => boolean = () => true) {
        return api<{session: Session}>(`/api/sessions/${id}`).then(data => {
            // A load whose page effect was already cleaned up must not overwrite newer state.
            if (!isCurrent()) return;
            setSession(data.session); setTitle(data.session.title); setStale(false); setError('');
            const first = takeFirstMessage(id);
            if (first && data.session.messages.length === 0) { setText(first); void generate('turns', false, { session: data.session, text: first }); }
        }).catch((e: Error) => { if (isCurrent()) setError(e.message); });
    }
    useEffect(() => { let current = true; void load(() => current); return () => { current = false; abort.current?.abort(); }; }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (confirm)
        dialog.current?.showModal(); }, [confirm]);
    useEffect(() => {
        if (session && followReply.current) {
            latestReply.current?.scrollIntoView({ behavior: 'instant', block: 'nearest' });
            followReply.current = false;
        }
    }, [session]);
    useEffect(() => {
        if (!busy) return;
        const stopFollowing = () => {
            if (window.scrollY + window.innerHeight < document.documentElement.scrollHeight - 420) followReply.current = false;
        };
        window.addEventListener('scroll', stopFollowing, { passive: true });
        return () => window.removeEventListener('scroll', stopFollowing);
    }, [busy]);
    async function generate(kind: 'turns' | 'card', skip = false, first?: { session: Session; text: string }) { const current = first?.session ?? session; const submittedText = first?.text ?? text; if (!current || operation.current || cancelling.current || stale || (kind === 'turns' && !skip && !submittedText.trim()))
        return; followReply.current = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 420; setBusy(true); setError(''); setExpired(false); setStale(false); setSending(kind === 'turns' && !skip ? submittedText : ''); const body = { operationId: crypto.randomUUID(), expectedRevision: current.revision }; operation.current = body; abort.current = new AbortController(); try {
        const data = await api<{
            session: Session;
        }>(`/api/sessions/${id}/${kind}`, 'POST', { ...body, ...(kind === 'turns' ? { text: skip ? 'I am not sure' : submittedText, action: skip ? 'skip' : first ? 'message' : action } : {}) }, abort.current.signal);
        setSession(data.session);
        if (kind === 'turns') {
            setText(current => current === submittedText ? '' : current);
            setAction('message');
        }
    }
    catch (e) {
        if ((e as Error).name !== 'AbortError') {
            const accessEnded = e instanceof ApiError && e.code === 'ACCESS_EXPIRED';
            setExpired(accessEnded);
            if (!accessEnded) setError((e as Error).message);
            setStale(e instanceof ApiError && e.status === 409);
        }
    }
    finally {
        if (!cancelling.current) setBusy(false);
        setSending('');
        operation.current = null;
    } }
    async function cancel() { cancelling.current = true; const body = operation.current; abort.current?.abort(); if (body) {
        try {
            const result = await api<{
                session: Session;
            }>(`/api/sessions/${id}/cancel`, 'POST', body);
            setSession(result.session);
        }
        catch (e) {
            setError((e as Error).message);
        }
    } cancelling.current = false; setBusy(false); setSending(''); }
    const state = session?.state;
    const question = state?.clarifications.find(q => q.answer === undefined && !q.skipped);
    const pricing = session?.mode === 'business' && /pricing/i.test(session.title);
    const starter = pricing ? {
        guidance: 'Share your goal, current and proposed prices, who your customers are, and any costs you know. Unknowns are fine; you can skip a question.',
        example: 'Example only — replace these details with your own: I run a subscription product for small businesses. I am considering increasing the monthly price from $20 to $25 to improve margins. Variable costs are about $5 per customer. I do not yet know how customers would respond.',
        label: 'Use pricing example',
    } : session?.mode === 'philosophy' ? {
        guidance: 'Describe the choice, the options you see, and what matters to you. Share only the personal details you are comfortable discussing.',
        example: 'Example only — replace these details with your own: I am considering a new job that offers more freedom but less stability. I value learning and have family commitments. I want to examine which tradeoffs I could accept.',
        label: 'Use personal decision example',
    } : {
        guidance: 'Describe your idea, who it helps, the problem it addresses, and what you want to decide or test. You do not need a complete business plan.',
        example: 'Example only — replace these details with your own: I want to build a scheduling tool for independent tutors. I think they lose time coordinating lessons, but I have not interviewed customers or tested willingness to pay. I want to decide what to validate first.',
        label: 'Use business idea example',
    };
    const messages = session?.messages ?? [];
    const latest = messages[messages.length - 1];
    const latestIsReply = latest?.role === 'assistant' && !busy;
    const replyIsClosingReflection = Boolean(latest?.text.trimStart().startsWith('Underlying question:'));
    const showSummary = Boolean(latestIsReply && state && state.phase !== 'support' && state.strengths.length > 0 && !replyIsClosingReflection);
    const replyIsTheQuestion = Boolean(question && latest?.text.trim() === question.question.trim());
    const questionText = question && latestIsReply && !replyIsTheQuestion ? question.question : '';
    const tags: Partial<Record<TurnAction, string>> = { pushback: 'Pushing back', correction: 'Correcting my position' };
    function frame(next: 'pushback' | 'correction') { setAction(next); composer.current?.focus(); }
    function closeMenu(event: React.MouseEvent<HTMLElement>) { (event.currentTarget.closest('details') as HTMLDetailsElement).open = false; }
    async function rename(event: React.FormEvent) {
        event.preventDefault();
        if (!session) return;
        try { const data = await api<{ session: Session }>(`/api/sessions/${id}`, 'PATCH', { title, expectedRevision: session.revision }); setSession(data.session); setRenaming(false); }
        catch (e) { setError((e as Error).message); }
    }
    return <Shell mode={session?.mode}><div className="chat-page" data-clarity-mask="true">
      <header className="chat-header">
        {renaming && session ? <form className="chat-rename" onSubmit={rename}>
          <label htmlFor="session-title" className="sr-only">Title</label>
          <input id="session-title" maxLength={120} value={title} onChange={e => setTitle(e.target.value)} required autoFocus/>
          <button className="primary small">Save title</button>
          <button type="button" className="quiet small" onClick={() => { setTitle(session.title); setRenaming(false); }}>Cancel</button>
        </form> : <h1>{session?.title ?? 'Loading conversation…'}</h1>}
        {session && !renaming && <details className="chat-menu">
          <summary aria-label="Conversation options">⋯</summary>
          <div className="chat-menu-list">
            <button type="button" onClick={e => { closeMenu(e); setRenaming(true); }}>Rename</button>
            <button type="button" className="danger-text" onClick={e => { closeMenu(e); setConfirm(true); }}>Delete conversation</button>
          </div>
        </details>}
      </header>
      {error && <ErrorNotice error={`${error}${stale ? ' Your unsent text is preserved. Refresh the saved conversation before sending again.' : ''}`} retry={() => void load()}/>}
      {session && <>
      {messages.length === 0 && !busy && <section className="chat-empty" aria-labelledby="starting-point">
        <h2 id="starting-point">Start with your situation</h2>
        <p>{starter.guidance} Share only what you’re comfortable sending to an AI provider.</p>
        <button type="button" className="quiet small" onClick={() => { setText(starter.example); composer.current?.focus(); }}>{starter.label}</button>
      </section>}
      <section className="conversation thread" aria-label="Conversation" aria-live="polite" aria-busy={busy}>
        {messages.map(message => <article key={message.id} className={`message ${message.role}`}>
          <span className="sr-only">{message.role === 'user' ? 'You said:' : 'Devils Advocate said:'}</span>
          <p className="preserve">{message.text}</p>
          {message.citations.length > 0 && <div className="citations">{message.citations.map((citation, index) => <SourceButton citation={citation} key={index}/>)}</div>}
        </article>)}
        {busy && sending && <article className="message user pending"><span className="eyebrow">You · sending</span><p className="preserve">{sending}</p></article>}
        {busy && <p className="thinking" role="status">Thinking it through…</p>}
        {showSummary && state && <section className="reply-summary" aria-label="Where your thinking stands">
          <h2>The underlying question</h2>
          <p>{state.underlyingQuestion}</p>
          <h2>Strengths</h2>
          <ul>{state.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul>
          {state.counterpoints.length > 0 && <><h2>Counterpoints</h2><Points points={state.counterpoints}/></>}
          {state.coverageNote && <p className="muted">{state.coverageNote}</p>}
          {state.openQuestions.map((item, index) => <p key={index}><strong>{item}</strong></p>)}
          {state.nextStep && <><h2>A next step</h2><p>{state.nextStep}</p></>}
        </section>}
        {question && latestIsReply ? <div className="reply-actions" role="group" aria-label="Answer the question">
          {questionText && <p className="reply-question">{questionText}</p>}
          <button type="button" onClick={() => composer.current?.focus()}>Answer</button>
          <button type="button" onClick={() => void generate('turns', true)}>Skip question</button>
        </div> : latestIsReply && <div className="reply-actions" role="group" aria-label="Reply actions">
          <button type="button" aria-pressed={action === 'pushback'} onClick={() => frame('pushback')}>Push back</button>
          <button type="button" aria-pressed={action === 'correction'} onClick={() => frame('correction')}>Correct my position</button>
          <button type="button" disabled={stale} onClick={() => void generate('card')}>Make a hand-back card</button>
        </div>}
        {expired && <div className="notice access-ended" role="status">Your trial or subscription has ended. Subscribe to keep going; your history stays here. <Link href="/billing">Subscribe</Link></div>}
      </section>
      <div ref={latestReply} className="chat-latest"/>
      {session.cards.map((card, index) => <Card key={card.id} card={card} latest={index === session.cards.length - 1}/>)}
      <Composer sticky value={text} onChange={setText} onSubmit={() => void generate('turns')} inputRef={composer} disabled={stale}
        busy={busy} onCancel={cancel} tag={tags[action]} onClearTag={() => setAction('message')}
        placeholder={messages.length ? 'Reply, push back or add detail…' : 'Describe your idea or decision in your own words.'}
        status={busy ? 'Preparing a checked response. Your message stays here until it is saved.' : undefined}/>
      </>}
      <dialog ref={dialog} aria-labelledby="delete-title" onClose={() => setConfirm(false)}>
        <h2 id="delete-title">Delete this conversation?</h2>
        <p>This removes its messages and cards. This action cannot be undone.</p>
        <div className="actions">
          <button autoFocus onClick={() => dialog.current?.close()}>Keep conversation</button>
          <button className="danger" onClick={async () => { try { await api(`/api/sessions/${id}`, 'DELETE'); router.push('/history'); } catch (e) { setError((e as Error).message); dialog.current?.close(); } }}>Delete permanently</button>
        </div>
      </dialog>
    </div></Shell>;
}
