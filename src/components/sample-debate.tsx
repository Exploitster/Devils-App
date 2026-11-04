'use client';
import { useState } from 'react';
import Link from 'next/link';
import samples from '@/data/sample-debates.json';

const steps = ['Your position', 'Questions', 'Real question', 'Both sides', 'Push back', 'Hand-back'];
export function SampleDebate() {
  const [mode, setMode] = useState('business');
  const [id, setId] = useState('hostel-food');
  const [stage, setStage] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [push, setPush] = useState<number>();
  const sample = samples.find(s => s.id === id)!;
  function reset(nextId = id) { setId(nextId); setStage(0); setAnswers([]); setPush(undefined); }
  const question = sample.questions[answers.length];
  return <section className="landing-section" id="try-sample" aria-labelledby="sample-title">
    <p className="eyebrow blue-text">TRY IT BEFORE YOU SIGN UP</p>
    <h2 id="sample-title">Bring an idea. Meet the other side.</h2>
    <p className="section-description">Startup ideas, work proposals, life decisions or beliefs. Explore a sample without an account.</p>
    <div className="actions sample-controls" aria-label="Choose your perspective">
      {['business', 'philosophy'].map(value => <button key={value} aria-pressed={mode === value} className={mode === value ? 'primary' : 'quiet'} onClick={() => { setMode(value); reset(samples.find(s => s.mode === value)!.id); }}>{value === 'business' ? 'Business validation' : 'Philosophy'}</button>)}
    </div>
    <p>{mode === 'business' ? 'Challenge my idea — for startup ideas, side projects and work proposals.' : 'Challenge my decision — for life choices and beliefs you want to examine.'}</p>
    <div className="actions sample-controls" aria-label="Choose a sample">{samples.filter(s => s.mode === mode).map(s => <button key={s.id} aria-pressed={id === s.id} onClick={() => reset(s.id)}>{s.tab}</button>)}</div>
    <div className="panel sample-player">
      <p className="fine">Scripted demonstration, not live AI or researched advice. Sample replies and philosophical paraphrases illustrate the experience. Business examples are hypothetical.</p>
      <ol className="sample-progress" aria-label="Sample progress">{steps.map((step, i) => <li key={step} aria-current={i === stage ? 'step' : undefined}>{i + 1}. {step}</li>)}</ol>
      <div aria-live="polite" aria-atomic="true">
        <h3>{steps[stage]}</h3>
        <p className="sample-message">{sample.opening}</p>
        {stage === 0 && <p>Start with your position. The next questions help uncover what is at stake.</p>}
        {stage === 1 && <>{answers.map((answer, i) => <div key={i} className="sample-answer"><p><strong>{sample.questions[i].q}</strong></p><p>You: {sample.questions[i].choices[answer].say}</p><p>{sample.questions[i].choices[answer].reply}</p></div>)}{question && <><h4>{question.q}</h4><div className="actions sample-controls">{question.choices.map((choice, i) => <button key={choice.say} onClick={() => setAnswers([...answers, i])}>{choice.say}</button>)}</div></>}</>}
        {stage === 2 && <><p><strong>{sample.realQuestion}</strong></p>{sample.bias && <p>Possible bias to examine: {sample.bias}</p>}</>}
        {stage === 3 && <><h4>The case for you</h4>{sample.caseFor.map(p => <p key={p.text}>{p.text}</p>)}<h4>The strongest other side</h4>{sample.otherSide.map(p => <div key={p.point}><p>{p.point}</p><p className="fine">{p.source}</p></div>)}<p className="fine">{sample.note}</p></>}
        {stage === 4 && <><p>Disagree? Choose a response and see how the next step changes.</p><div className="actions sample-controls">{sample.pushbacks.map((p, i) => <button key={p.say} aria-pressed={push === i} onClick={() => setPush(i)}>{p.say}</button>)}</div>{push !== undefined && <p className="sample-question">{sample.pushbacks[push].reply}</p>}</>}
        {stage === 5 && <div className="sample-handback"><h4>Your hand-back card</h4><dl><dt>Your position</dt><dd>{sample.card.position}</dd><dt>What is strong</dt><dd>{sample.card.strong}</dd><dt>Toughest counterpoints</dt><dd><ul>{sample.otherSide.map(p => <li key={p.point}>{p.point}</li>)}</ul></dd><dt>Open questions from your answers</dt><dd><ul>{answers.map((a, i) => <li key={i}>{sample.questions[i].choices[a].open}</li>)}</ul></dd><dt>A small test to try</dt><dd>{sample.pushbacks[push ?? 0].test}</dd></dl><p><strong>Your call. Always.</strong></p><Link className="button primary" href="/signup">Start your own conversation</Link></div>}
      </div>
      <div className="actions sample-controls">
        {stage < 5 && <button className="primary" disabled={(stage === 1 && answers.length < sample.questions.length) || (stage === 4 && push === undefined)} onClick={() => setStage(stage + 1)}>{stage === 0 ? 'Start sample' : stage === 4 ? 'Make my hand-back card' : 'Continue sample'}</button>}
        <button className="quiet" onClick={() => reset()}>Start over</button>
      </div>
    </div>
    <div className="feature-grid sample-walkthrough">{[
      ['Pick your perspective', 'Choose business validation or philosophical reflection.'],
      ['Spill it', 'Describe the actual idea or decision, including what you already know.'],
      ['Clarify the stakes', 'Answer up to three focused questions. You can skip and keep unknowns visible.'],
      ['Name the real question', 'Separate your position from assumptions and possible biases.'],
      ['Consider both sides', 'Start with strengths, then inspect counterpoints and available reviewed sources.'],
      ['Push back', 'Correct the context or challenge an argument. Evidence coverage may be limited.'],
      ['Keep your hand-back card', 'Save the tradeoffs, open questions and a reversible next step. You decide.'],
    ].map(([title, text], i) => <article className="panel feature-card" key={title}><p className="eyebrow">STEP {i + 1}</p><h3>{title}</h3><p>{text}</p></article>)}</div>
  </section>;
}

export function ProductQuestions() {
  return <section className="landing-section" id="faq" aria-labelledby="faq-title">
    <p className="eyebrow blue-text">THOUGHTFUL CHALLENGE. YOUR DECISION.</p><h2 id="faq-title">A little more clarity.</h2>
    <div className="pricing-answers">
      {[
        ['Who is this for?', 'Founders, MBA students, working professionals and curious people. Bring a startup idea, work proposal, life decision or belief you want to examine.'],
        ['Will it disagree with everything?', 'The conversation starts with what is strong in your position. Counterpoints should help you reason, not argue for entertainment. You can correct the context and push back.'],
        ['What if my idea holds up?', 'Keep the strengths, consider the remaining unknowns and choose a practical test. The app does not issue a final verdict or promise success.'],
        ['Where do the sources come from?', 'The app uses a curated evidence collection. Quotes must match permitted stored excerpts; paraphrases carry source context. If relevant evidence is missing, coverage is limited rather than filled with invented companies or quotations.'],
        ['What can I keep?', 'Save your conversations and hand-back decision cards, revisit history and download cards as Markdown. Account controls let you manage your data.'],
        ['Can I speak instead of typing?', 'The current experience is text-only.'],
        ['What are the boundaries?', 'This is not professional advice or crisis care. Safety checks redirect crisis-related conversations toward support, and political persuasion is outside the intended use.'],
        ['How do I get started?', 'Try the scripted sample above, then create an account with Google or email. You can also go straight to Pricing and review the subscription before conversation onboarding.'],
      ].map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
    </div>
  </section>;
}
