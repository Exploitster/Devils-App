import type { Metadata } from 'next';
export const metadata: Metadata = { alternates: { canonical: '/' } };
import Link from 'next/link';
import { SampleDebate, ProductQuestions } from '@/components/sample-debate';
import { Pricing } from '@/components/pricing';
import { Icon, IdeaVisual, Shell } from '@/components/app';

export default function Landing() {
  const paid = process.env.DEVILS_PAYMENTS_ENABLED === 'true';
  return <Shell>
    <section className="landing-hero">
      <div className="hero-copy">
        <span className="pill"><span className="availability-dot"/>Business ideas · Personal decisions</span>
        <h1>Good ideas deserve<br/><span className="text-gradient">better questions.</span></h1>
        <p className="lead">Bring an idea or a decision. We’ll ask the hard questions, show you the other side, and hand the call back to you.</p>
        <div className="actions">
          <Link className="button primary" href="/signup">Find your perspective<Icon name="arrow"/></Link>
          <a className="button quiet" href="#pricing">View pricing · ₹2,000/month</a>
        </div>
        <p><a className="text-link" href="#try-sample">Try a sample first, no account needed <Icon name="arrow"/></a></p>
        <p className="hero-note">{paid ? 'Free for your first 24 hours. Then ₹2,000/month.' : 'Free while subscriptions are being prepared.'}</p>
      </div>
      <IdeaVisual/>
    </section>
    <SampleDebate/>
    <section className="landing-section" id="two-perspectives" aria-labelledby="perspectives-title">
      <p className="eyebrow blue-text">TWO WAYS IN</p>
      <h2 id="perspectives-title">A stronger idea.<br/>A clearer decision.</h2>
      <p className="section-description">Pick the lens your situation needs. Neither decides for you.</p>
      <div className="perspectives-grid">
        <article className="panel perspective-detail">
          <span className="icon-tile blue"><Icon name="business"/></span>
          <p className="eyebrow">BUSINESS VALIDATION</p>
          <h3>Challenge the idea before you commit.</h3>
          <ul>
            <li>Who pays, and why?</li>
            <li>Which assumption could sink it?</li>
            <li>What small test comes first?</li>
          </ul>
          <div className="perspective-example"><span className="fine">FOR EXAMPLE</span><p>“Would small clinics pay for my AI booking assistant?”</p></div>
          <Link className="text-link" href="/signup">Test a business idea <Icon name="arrow"/></Link>
        </article>
        <article className="panel perspective-detail">
          <span className="icon-tile violet"><Icon name="personal"/></span>
          <p className="eyebrow">PHILOSOPHICAL REFLECTION</p>
          <h3>Understand what matters in your choice.</h3>
          <ul>
            <li>What do you value most here?</li>
            <li>What are you assuming?</li>
            <li>Which tradeoff can you live with?</li>
          </ul>
          <div className="perspective-example"><span className="fine">FOR EXAMPLE</span><p>“Am I staying in this career for me, or for others?”</p></div>
          <Link className="text-link" href="/signup">Think through a decision <Icon name="arrow"/></Link>
        </article>
      </div>
    </section>
    <section className="landing-values">
      <div><Icon name="business"/><span>Business ideas</span></div>
      <div><Icon name="personal"/><span>Personal decisions</span></div>
      <div><Icon name="card"/><span>Clear next steps</span></div>
    </section>
    <section className="landing-section" id="how-it-works">
      <p className="eyebrow blue-text">HOW IT GOES</p>
      <h2>Not another answer.<br/>A better way to yours.</h2>
      <div className="feature-grid">{[
        { n: '01', icon: 'chat', title: 'Say what’s on your mind.', text: 'Half-formed is fine.' },
        { n: '02', icon: 'spark', title: 'See the other side.', text: 'Strengths first, then honest counterpoints with sources.' },
        { n: '03', icon: 'card', title: 'Keep what helps.', text: 'A card with the tradeoffs and one next step.' },
      ].map(item => <article className="panel feature-card" key={item.n}><div className="feature-top"><span className="icon-tile blue"><Icon name={item.icon}/></span><span>{item.n}</span></div><h3>{item.title}</h3><p>{item.text}</p></article>)}</div>
    </section>
    <section className="landing-split">
      <div className="perspective-sample panel">
        <p className="eyebrow">A SMALL SHIFT</p>
        <div className="sample-message">“I think I should quit my job and build this.”</div>
        <div className="sample-response"><span className="icon-tile violet"><Icon name="spark"/></span><p>What’s strong here?<br/><strong>You’re taking your ambition seriously.</strong></p></div>
        <div className="sample-question">What could you test before you leap?</div>
        <span className="fine">Illustrative example.</span>
      </div>
      <div>
        <span className="pill">Thoughtful by design</span>
        <h2>Supportive.<br/>Never just agreeable.</h2>
        <p className="lead">We start with what holds up, then make room for what doesn’t.</p>
        <p className="muted">A starting point for reflection, not professional advice.</p>
        <Link className="text-link" href="/signup">Give your idea some room <Icon name="arrow"/></Link>
      </div>
    </section>
    <Pricing paid={paid}/>
    <ProductQuestions/>
    <section className="landing-cta">
      <span className="icon-tile blue"><Icon name="spark" size={28}/></span>
      <h2>What if you looked at it differently?</h2>
      <p>A little distance makes the next step clearer.</p>
      <Link className="button primary" href="/signup">Start your first conversation<Icon name="arrow"/></Link>
    </section>
  </Shell>;
}
