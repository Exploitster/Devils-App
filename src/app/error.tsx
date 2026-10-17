'use client';
import Link from 'next/link';
import { Brand, Icon } from '@/components/app';
export default function ErrorPage({ reset }: { reset: () => void }) { return <><header className="public-header"><Brand/></header><main className="main public-main"><section className="panel empty-state"><span className="icon-tile violet"><Icon name="chat" size={30}/></span><h1>Let’s try that again.</h1><p>This page couldn’t finish loading. Try again, or return to your saved conversations.</p><div className="actions"><button className="primary" onClick={reset}>Try again</button><Link className="button" href="/history">Your conversations</Link></div></section></main></>; }
