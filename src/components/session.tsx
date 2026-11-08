'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { HandBackCard, Session, TurnAction } from '@/lib/contracts';
import Link from 'next/link';
import { api, ApiError, ErrorNotice, Shell } from './app';
import { Composer } from './composer';
import { AssessmentDocument, citedSources, copyMarkdown, downloadMarkdown, Points } from './assessment';
import { CaseProgress } from './case-progress';
import { SourceButton } from './source';
import { handOverFirstMessage, takeFirstMessage } from '@/lib/pending-message';
import '@/styles/chat.css';
const DONT_KNOW = 'I don’t know yet';
async function markdown(card: HandBackCard) {
    const sources = await citedSources(card.counterpoints);
    return `# Hand-back card · version ${card.version}\n\n## Your position\n${card.position}\n\n## Strengths\n${card.strengths.map(s => `- ${s}`).join('\n')}\n\n## Counterpoints\n${card.counterpoints.map(p => `- ${p.text}\n  Interpretation: ${p.interpretation ?? ''}`).join('\n')}\n\n## Open questions\n${card.openQuestions.map(s => `- ${s}`).join('\n')}\n\n## A next step this month\n${card.nextStep}\n\n## Sources\n${sources.map(({ source: s, locators }) => `${s.author}. ${s.work}. ${s.edition}. ${s.publicationDate ?? 'Date unspecified'}. ${s.url}\n${locators.join('; ')}`).join('\n\n')}\n\n${card.closing}\n`;
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
      <button onClick={() => void copyMarkdown(() => markdown(card), 'Card copied.', setStatus)}>Copy card</button>
      <button onClick={() => void downloadMarkdown(() => markdown(card), `hand-back-${card.version}.md`, setStatus)}>Download Markdown</button>
      </div>
      <p role="status">{status}</p>
      </section>; }
export function SessionView({ id }: {
    id: string;
}) {
    const router = useRouter();
    const [session, setSession] = useState<Session>();
    const [error, setError] = useState('');
    const [assessmentError, setAssessmentError] = useState('');
    const [stale, setStale] = useState(false);
    const [text, setText] = useState('');
    const [action, setAction] = useState<Exclude<TurnAction, 'skip'>>('message');
    const [busy, setBusy] = useState<'turns' | 'card'>();
    const [sending, setSending] = useState('');
    const [title, setTitle] = useState('');
    const [confirm, setConfirm] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [expired, setExpired] = useState(false);
    const [starting, setStarting] = useState(false);
    const dialog = useRef<HTMLDialogElement>(null);
    const composer = useRef<HTMLTextAreaElement>(null);
    const latestReply = useRef<HTMLDivElement>(null);
    const followReply = useRef(false);
    const cancelling = useRef(false);
    const abort = useRef<AbortController | null>(null);
    const autoAssessed = useRef<string | null>(null);
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
        return; followReply.current = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 420; setBusy(kind); setError(''); setAssessmentError(''); setExpired(false); setStale(false); setSending(kind === 'turns' && !skip ? submittedText : ''); const body = { operationId: crypto.randomUUID(), expectedRevision: current.revision }; operation.current = body; abort.current = new AbortController();
        const turnAction = skip ? 'skip' : first ? 'message' : current.state.casePrep?.complete ? 'correction' : action;
        try {
        const data = await api<{
            session: Session;
        }>(`/api/sessions/${id}/${kind}`, 'POST', { ...body, ...(kind === 'turns' ? { text: skip ? DONT_KNOW : submittedText, action: turnAction } : {}) }, abort.current.signal);
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
            const conflict = e instanceof ApiError && e.status === 409;
            if (!accessEnded) { if (kind === 'card' && !conflict) setAssessmentError((e as Error).message); else setError((e as Error).message); }
            setStale(conflict);
        }
    }
    finally {
        if (!cancelling.current) setBusy(undefined);
        setSending('');
        operation.current = null;
    } }
    async function cancel() { if (busy === 'card') setAssessmentError('Writing was cancelled.'); cancelling.current = true; const body = operation.current; abort.current?.abort(); if (body) {
        try {
            const result = await api<{
                session: Session;
            }>(`/api/sessions/${id}/cancel`, 'POST', body);
            setSession(result.session);
        }
        catch (e) {
            setError((e as Error).message);
        }
    } cancelling.current = false; setBusy(undefined); setSending(''); }
    const state = session?.state;
    const prep = state?.casePrep;
    const messages = session?.messages ?? [];
    const legacy = Boolean(session && messages.length > 0 && !prep);
    const assessment = prep?.assessment;
    const latestAnswer = messages.findLast(message => message.role === 'user');
    const assessmentDue = Boolean(prep?.complete && (!assessment || !assessment.complete || (latestAnswer && latestAnswer.createdAt > assessment.createdAt)));
    useEffect(() => {
        const answerKey = latestAnswer?.id ?? 'no-answer';
        if (!session || !assessmentDue || busy || stale || operation.current || autoAssessed.current === answerKey) return;
        autoAssessed.current = answerKey;
        void generate('card');
    });
    const pricing = session?.mode === 'business' && /pricing/i.test(session.title);
    const starter = pricing ? {
        guidance: 'Share your goal, current and proposed prices, who your customers are, and any costs you know. Unknowns are fine; you can answer “I don’t know yet” to any question.',
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
    const latest = messages[messages.length - 1];
    const latestIsReply = latest?.role === 'assistant' && !busy;
    const replyIsClosingReflection = Boolean(latest?.text.trimStart().startsWith('Underlying question:'));
    const showSummary = Boolean(legacy && latestIsReply && state && state.phase !== 'support' && state.strengths.length > 0 && !replyIsClosingReflection);
    const openQuestion = prep && !prep.complete && latestIsReply && !latest.text.trim().endsWith('?') ? messages.findLast(message => message.role === 'assistant' && message.text.trim().endsWith('?'))?.text ?? '' : '';
    const anchor = assessment ? messages.findIndex(message => message.role === 'assistant' && message.createdAt >= assessment.createdAt) : -1;
    const tags: Partial<Record<TurnAction, string>> = { pushback: 'Pushing back', correction: 'Correcting my position' };
    function frame(next: 'pushback' | 'correction') { setAction(next); composer.current?.focus(); }
    function closeMenu(event: React.MouseEvent<HTMLElement>) { (event.currentTarget.closest('details') as HTMLDetailsElement).open = false; }
    async function rename(event: React.FormEvent) {
        event.preventDefault();
        if (!session) return;
        try { const data = await api<{ session: Session }>(`/api/sessions/${id}`, 'PATCH', { title, expectedRevision: session.revision }); setSession(data.session); setRenaming(false); }
        catch (e) { setError((e as Error).message); }
    }
    async function startCase() {
        if (!session || starting) return;
        setStarting(true); setError('');
        const position = session.state.position.trim() || messages.find(message => message.role === 'user')?.text || session.title;
        try {
            const data = await api<{ session: Session }>('/api/sessions', 'POST', { mode: session.mode, topic: session.topic, ...(session.title !== 'Untitled conversation' ? { title: session.title } : {}) });
            handOverFirstMessage(data.session.id, position);
            router.push(`/sessions/${data.session.id}`);
        }
        catch (e) { setError((e as Error).message); setStarting(false); }
    }
    const assessmentLabel = assessment ? 'Update assessment' : 'Get assessment';
    const assessmentView = assessment && session ? <AssessmentDocument key={assessment.id} assessment={assessment} mode={session.mode}/> : null;
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
      <section className="conversation thread" aria-label="Conversation" aria-live="polite" aria-busy={Boolean(busy)}>
        {messages.map((message, index) => <div className="thread-item" key={message.id}><article className={`message ${message.role}`}>
          <span className="sr-only">{message.role === 'user' ? 'You said:' : 'Devils Advocate said:'}</span>
          <p className="preserve">{message.text}</p>
          {message.citations.length > 0 && <div className="citations">{message.citations.map((citation, index) => <SourceButton citation={citation} key={index}/>)}</div>}
        </article>{index === anchor && assessmentView}</div>)}
        {anchor === -1 && assessmentView}
        {busy && sending && <article className="message user pending"><span className="eyebrow">You · sending</span><p className="preserve">{sending}</p></article>}
        {busy === 'turns' && <p className="thinking" role="status">Thinking it through…</p>}
        {busy === 'card' && <p className="thinking" role="status">Writing your assessment. It scores each area from your answers.</p>}
        {assessmentError && !busy && <div className="notice error-notice assessment-failed" role="group" aria-label="Assessment not written">
          <p role="alert">Your assessment could not be written. {assessmentError} Your answers are saved.</p>
          <button type="button" disabled={stale} onClick={() => void generate('card')}>Try again</button>
        </div>}
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
        {prep && latestIsReply && !(assessmentDue && !assessmentError) && <div className="reply-actions" role="group" aria-label="Reply actions">
          {openQuestion && <p className="reply-question">Back to the case: {openQuestion}</p>}
          {!prep.complete && <>
            <button type="button" className="reply-quiet" onClick={() => void generate('turns', true)}>{DONT_KNOW}</button>
            <button type="button" aria-pressed={action === 'pushback'} onClick={() => frame('pushback')}>Push back</button>
          </>}
          <button type="button" aria-pressed={action === 'correction' || prep.complete} onClick={() => frame('correction')}>Correct my position</button>
          {!assessmentDue && <button type="button" disabled={stale} onClick={() => void generate('card')}>{assessmentLabel}</button>}
        </div>}
        {expired && <div className="notice access-ended" role="status">Your trial or subscription has ended. Subscribe to keep going; your history stays here. <Link href="/billing">Subscribe</Link></div>}
      </section>
      <div ref={latestReply} className="chat-latest"/>
      {session.cards.map((card, index) => <Card key={card.id} card={card} latest={index === session.cards.length - 1}/>)}
      {legacy ? <section className="legacy-case" aria-labelledby="legacy-case-title">
        <h2 id="legacy-case-title">This conversation is read-only</h2>
        <p>It was saved before conversations became case prep, so it stays as it was. Start a case to work through your idea area by area, beginning with the position you gave here.</p>
        <button type="button" className="primary" disabled={starting} onClick={() => void startCase()}>Start a case</button>
      </section> : <>
      {prep && messages.length > 0 && <CaseProgress mode={session.mode} record={prep}/>}
      <Composer sticky value={text} onChange={setText} onSubmit={() => void generate('turns')} inputRef={composer} disabled={stale}
        busy={Boolean(busy)} onCancel={cancel} tag={prep?.complete ? undefined : tags[action]} onClearTag={() => setAction('message')}
        placeholder={!messages.length ? 'Describe your idea or decision in your own words.' : prep?.complete ? 'Correct your position to revisit the case…' : 'Answer in your own words…'}
        status={busy === 'card' ? 'Your answers are saved while the assessment is prepared.' : busy ? 'Preparing a checked response. Your message stays here until it is saved.' : undefined}/>
      </>}
      </>}
      <dialog ref={dialog} aria-labelledby="delete-title" onClose={() => setConfirm(false)}>
        <h2 id="delete-title">Delete this conversation?</h2>
        <p>This removes its messages, cards and assessment. This action cannot be undone.</p>
        <div className="actions">
          <button autoFocus onClick={() => dialog.current?.close()}>Keep conversation</button>
          <button className="danger" onClick={async () => { try { await api(`/api/sessions/${id}`, 'DELETE'); router.push('/history'); } catch (e) { setError((e as Error).message); dialog.current?.close(); } }}>Delete permanently</button>
        </div>
      </dialog>
    </div></Shell>;
}
