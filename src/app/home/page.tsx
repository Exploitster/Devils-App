'use client';
import '@/styles/chat.css';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, type AuthData, ErrorNotice, Icon, Shell } from '@/components/app';
import { Composer } from '@/components/composer';
import { handOverFirstMessage } from '@/lib/pending-message';
import type { Mode, Session, Topic } from '@/lib/contracts';

interface Starter { label: string; mode: Mode; topic: Topic; title?: string; draft: string }
const starters: Starter[] = [
  { label: 'Test a business idea', mode: 'business', topic: 'startup', draft: 'I want to test this idea: ' },
  { label: 'Pricing decision', mode: 'business', topic: 'startup', title: 'Pricing decision', draft: 'I’m thinking of changing my price from … to … because ' },
  { label: 'Personal decision', mode: 'philosophy', topic: 'life', draft: 'I’m deciding whether to … What matters most to me is ' },
];

export default function Home() { return <Suspense fallback={<Shell><p role="status">Preparing your space…</p></Shell>}><NewConversation/></Suspense>; }

function NewConversation() {
  const search = useSearchParams(); const router = useRouter();
  const [mode, setMode] = useState<Mode>(search.get('perspective') === 'philosophy' ? 'philosophy' : 'business');
  const [starter, setStarter] = useState<Starter>();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { api<AuthData>('/api/auth').then(data => setName(data.user?.name?.split(' ')[0] || '')).catch(() => {}); }, []);
  function choose(next: Mode) { setMode(next); if (starter && starter.mode !== next) setStarter(undefined); }
  function pickStarter(next: Starter) {
    setStarter(next); setMode(next.mode); setText(next.draft);
    requestAnimationFrame(() => { const field = input.current; if (field) { field.focus(); field.setSelectionRange(field.value.length, field.value.length); } });
  }
  async function start() {
    if (busy || !text.trim()) return;
    setBusy(true); setError('');
    const topic: Topic = starter?.mode === mode ? starter.topic : mode === 'business' ? 'startup' : 'life';
    try {
      const data = await api<{ session: Session }>('/api/sessions', 'POST', { mode, topic, ...(starter?.title && starter.mode === mode ? { title: starter.title } : {}) });
      // The conversation page sends it, so the first reply gets the normal thread and Cancel.
      handOverFirstMessage(data.session.id, text);
      router.push(`/sessions/${data.session.id}`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <Shell mode={mode}><div className="new-chat">
    <div className="new-chat-heading">
      <p className="home-welcome"><Icon name="spark"/>{name ? `Good to see you, ${name}.` : 'A little distance. A clearer view.'}</p>
      <h1>What would you like to think through?</h1>
      <p className="lead">Bring an idea or a decision. We’ll ask the hard questions. The call stays yours.</p>
    </div>
    <div className="perspective-toggle" role="group" aria-label="Perspective">
      <button type="button" aria-pressed={mode === 'business'} aria-label="Business: test an idea or plan" onClick={() => choose('business')}><Icon name="business" size={16}/>Business idea</button>
      <button type="button" aria-pressed={mode === 'philosophy'} aria-label="Philosophy: think through a personal decision" onClick={() => choose('philosophy')}><Icon name="personal" size={16}/>Personal decision</button>
    </div>
    <Composer value={text} onChange={setText} onSubmit={() => void start()} inputRef={input} disabled={busy}
      placeholder={mode === 'business' ? 'Describe your idea or plan in a few sentences…' : 'Describe the choice in front of you…'}
      status={busy ? 'Starting your conversation…' : undefined}/>
    <div className="starters" role="group" aria-label="Starting points">
      {starters.map(item => <button key={item.label} type="button" aria-pressed={starter === item} onClick={() => pickStarter(item)}>{item.label}</button>)}
    </div>
    {error && <ErrorNotice error={error}/>}
  </div></Shell>;
}
