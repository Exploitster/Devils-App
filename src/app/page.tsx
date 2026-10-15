import Link from 'next/link';
import { Shell } from '@/components/app';
export default function Landing() { return <Shell>
      <section className="intro panel">
      <p className="eyebrow">A thoughtful second perspective</p>
      <h1>Challenge your idea.<br />Challenge your decision.</h1>
      <p className="lead">A place to examine what holds up, what might break, and what to try next.</p>
      <p>Explore a business idea through relevant real-world comparisons, or think through a personal decision through philosophical perspectives. We start with what is strong in your position, then ask the questions worth facing.</p>
      <Link className="button primary" href="/login">Sign in to think it through</Link>
      <p className="muted">Invite-only access. Your call. Always.</p>
      </section>
      </Shell>; }
