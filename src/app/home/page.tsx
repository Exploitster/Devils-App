'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ErrorNotice, Shell } from '@/components/app';
import type { Mode, Session, Topic } from '@/lib/contracts';
export default function Home() {
    const [mode, setMode] = useState<Mode>('business');
    const [topic, setTopic] = useState<Topic>('startup');
    const [pricing, setPricing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();
    return <Shell mode={mode}>
      <p className="eyebrow">A little distance. A clearer view.</p>
      <h1>What would you like to think through?</h1>
      <p className="lead">Bring an idea you believe in, or a decision you are still making.</p>
      <div className="mode-grid">{(['business', 'philosophy'] as const).map(value => <button key={value} className={`mode-card ${mode === value ? 'selected' : ''}`} aria-pressed={mode === value} onClick={() => { setMode(value); setTopic(value === 'business' ? 'startup' : 'life'); setPricing(false); }}>
      <strong>{value === 'business' ? 'Business' : 'Philosophy'}</strong>
      <span>{value === 'business' ? 'Test assumptions against the experience of real businesses.' : 'Examine values, obligations, and the choice in front of you.'}</span>
      <span>{mode === value ? 'Selected' : 'Choose this perspective'}</span>
      </button>)}</div>
      <section className="panel">
      <h2>What are you working through?</h2>
      <div className="topics" role="group" aria-label="Decision type">
      <button aria-pressed={mode === 'business' && !pricing} onClick={() => { setMode('business'); setTopic('startup'); setPricing(false); }}>Explore an idea</button>
      <button aria-pressed={pricing} onClick={() => { setMode('business'); setTopic('startup'); setPricing(true); }}>Pricing decision</button>
      <button aria-pressed={mode === 'philosophy'} onClick={() => { setMode('philosophy'); setTopic('life'); setPricing(false); }}>Personal decision</button>
      </div>
      {pricing && <p>Think through a price change, its effect on customers, and what you need to test before deciding.</p>}
      <h2>Where does it fit?</h2>
      <div className="topics" role="group" aria-label="Topic">{(['startup', 'work', 'life', 'beliefs'] as const).map(value => <button key={value} aria-pressed={topic === value} onClick={() => { setTopic(value); setMode(value === 'startup' || value === 'work' ? 'business' : 'philosophy'); if (value !== 'startup') setPricing(false); }}>{({ startup: 'Startup & business', work: 'Work & career', life: 'Life & decisions', beliefs: 'Beliefs & values' })[value]}</button>)}</div>
      <p className="muted">You can push back, correct the framing, or ask for a hand-back card at any point.</p>
      <button className="primary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try {
        const data = await api<{
            session: Session;
        }>('/api/sessions', 'POST', { mode, topic, ...(pricing ? {title:'Pricing decision'} : {}) });
        router.push(`/sessions/${data.session.id}`);
    }
    catch (e) {
        setError((e as Error).message);
        setBusy(false);
    } }}>{busy ? 'Starting…' : 'Start a conversation'}</button>{error && <ErrorNotice error={error}/>}</section>
      <p className="fine">Fair use: 10 submissions per minute, one generation at a time, 12,000 characters per message and a 24-message context window. An operator daily cost limit may pause generation. No monthly debate quota.</p>
      </Shell>;
}
