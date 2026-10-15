'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Session } from '@/lib/contracts';
import { api, ErrorNotice, Shell } from '@/components/app';
export default function History() { const [sessions, setSessions] = useState<Session[]>(); const [error, setError] = useState(''); function load() { return api<{ sessions: Session[] }>('/api/sessions').then(data => { setSessions(data.sessions); setError(''); }).catch((e: Error) => setError(e.message)); } useEffect(() => { void load(); }, []); return <Shell>
      <p className="eyebrow">Pick up a thought</p>
      <h1>History</h1>
      <p className="lead">Your saved conversations, ready when you are.</p>{error ? <ErrorNotice error={error} retry={load}/> : !sessions ? <p role="status">Loading your conversations…</p> : sessions.length ? <div className="history-list">{sessions.map(session => <Link className="panel history-item" key={session.id} href={`/sessions/${session.id}`}>
      <span className="eyebrow">{session.mode} · {session.topic}</span>
      <h2>{session.title}</h2>
      <p className="muted">{new Date(session.updatedAt).toLocaleDateString()} · {session.messages.length} messages · {session.cards.length} cards</p>
      <span>Resume conversation →</span>
      </Link>)}</div> : <section className="panel">
      <h2>A clear space to start.</h2>
      <p>Your conversations will appear here after you begin.</p>
      <Link className="button primary" href="/home">Start a conversation</Link>
      </section>}</Shell>; }
