'use client';
import { useState } from 'react';
import Link from 'next/link';
import samples from '@/data/sample-debates.json';

const steps = ['Your position', 'Guided questions', 'Your assessment'];
const areaLabels: Record<string, string[]> = {
  'skip-placements': ['Regret and what you could lose', 'Who else is affected', 'How it was validated'],
  'move-cities': ['Values', 'Who else is affected', 'Reversibility'],
  'money-meaning': ['What is really being decided', 'Options not yet considered', 'Values'],
  'hostel-food': ['Customer', 'How it reaches customers', 'What people use today'],
  'bill-splitting': ['What people use today', 'How it makes money', 'Problem and why now'],
  'in-house-crm': ['Customer', 'Why you', 'Market size and cost'],
};
const scores = ['Strong', 'Weak', 'Untested'];
export function SampleDebate() {
  const [mode, setMode] = useState('business');
  const [id, setId] = useState('hostel-food');
  const [stage, setStage] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const sample = samples.find(s => s.id === id)!;
  const labels = areaLabels[id];
  function reset(nextId = id) { setId(nextId); setStage(0); setAnswers([]); }
  const question = sample.questions[answers.length];
  const weakReplies = answers.map((a, i) => ({ a, reply: sample.questions[i].choices[a].reply })).filter(x => x.a > 0).map(x => x.reply);
  return <section className="landing-section" id="try-sample" aria-labelledby="sample-title">
    <p className="eyebrow blue-text">TRY IT BEFORE YOU SIGN UP</p>
    <h2 id="sample-title">Answer three questions. See the assessment.</h2>
    <p className="section-description">Play a short case-prep sample through. No account needed.</p>
    <div className="actions sample-controls" aria-label="Choose your perspective">
      {['business', 'philosophy'].map(value => <button key={value} aria-pressed={mode === value} className={mode === value ? 'primary' : 'quiet'} onClick={() => { setMode(value); reset(samples.find(s => s.mode === value)!.id); }}>{value === 'business' ? 'Business validation' : 'Philosophy'}</button>)}
    </div>
        <div className="actions sample-controls" aria-label="Choose a sample">{samples.filter(s => s.mode === mode).map(s => <button key={s.id} aria-pressed={id === s.id} onClick={() => reset(s.id)}>{s.tab}</button>)}</div>
    <div className="panel sample-player">
      <p className="fine">A scripted demo, not live AI. Examples are hypothetical. A real case covers {mode === 'business' ? 'nine areas' : 'seven areas'}.</p>
      <ol className="sample-progress" aria-label="Sample progress">{steps.map((step, i) => <li key={step} aria-current={i === stage ? 'step' : undefined}>{i + 1}. {step}</li>)}</ol>
      <div aria-live="polite" aria-atomic="true">
        <h3>{steps[stage]}</h3>
        <p className="sample-message">{sample.opening}</p>
        {stage === 0 && <p>This is the starting position. Next come three guiding questions, one at a time.</p>}
        {stage === 1 && <>{answers.map((answer, i) => <div key={i} className="sample-answer"><p><strong>{labels[i]}: {sample.questions[i].q}</strong></p><p>You: {sample.questions[i].choices[answer].say}</p><p>{sample.questions[i].choices[answer].reply}</p></div>)}{question && <><h4>{labels[answers.length]}: {question.q}</h4><div className="actions sample-controls">{question.choices.map((choice, i) => <button key={choice.say} onClick={() => setAnswers([...answers, i])}>{choice.say}</button>)}</div></>}</>}
        {stage === 2 && <div className="sample-handback"><h4>Your mini assessment</h4><dl><dt>Your position</dt><dd>{sample.card.position}</dd><dt>How each area looks</dt><dd><ul>{answers.map((a, i) => <li key={i}>{labels[i]}: {scores[a]}</li>)}</ul></dd><dt>Loophole</dt><dd>{sample.otherSide[0].point}<br/><span className="fine">{sample.otherSide[0].source}</span></dd><dt>What is good</dt><dd>{sample.card.strong}</dd><dt>What is bad</dt><dd>{weakReplies.length ? <ul>{weakReplies.map(r => <li key={r}>{r}</li>)}</ul> : 'Nothing flagged in these three answers.'}</dd><dt>Next steps</dt><dd><ul>{answers.map((a, i) => <li key={i}>{sample.questions[i].choices[a].open}</li>)}<li>{sample.pushbacks[0].test}</li></ul></dd></dl><p className="fine">Scores here are illustrative. A full assessment scores every area and lists what must be true.</p><p><strong>Your call. Always.</strong></p><Link className="button primary" href="/signup">Start your own case</Link></div>}
      </div>
      <div className="actions sample-controls">
        {stage < 2 && <button className="primary" disabled={stage === 1 && answers.length < sample.questions.length} onClick={() => setStage(stage + 1)}>{stage === 0 ? 'Start sample' : 'See my assessment'}</button>}
        <button className="quiet" onClick={() => reset()}>Start over</button>
      </div>
    </div>
    <ol className="story-steps" aria-label="How a case unfolds">{[
      ['Pick a lens', 'Business or personal.'],
      ['Spill it', 'Your idea, in your words.'],
      ['Answer area by area', 'One guiding question at a time.'],
      ['Go deeper', 'Up to three follow-ups on a weak answer.'],
      ['Say “I don’t know yet”', 'That area is marked untested.'],
      ['Read your assessment', 'Each area scored, with loopholes and next steps.'],
    ].map(([title, text]) => <li key={title}><strong>{title}</strong><span>{text}</span></li>)}</ol>
  </section>;
}

export function ProductQuestions() {
  return <section className="landing-section" id="faq" aria-labelledby="faq-title">
    <p className="eyebrow blue-text">THOUGHTFUL CHALLENGE. YOUR DECISION.</p><h2 id="faq-title">A little more clarity.</h2>
    <div className="pricing-answers">
      {[
        ['Who is this for?', 'Founders, MBA students, working professionals and curious people. Bring a startup idea, work proposal, life decision or belief you want to examine.'],
        ['Will it disagree with everything?', 'No. It asks guiding questions and probes weak answers, but you do the thinking. Loopholes in the assessment should help you reason, not argue for entertainment. You can correct your position at any time.'],
        ['What if my idea holds up?', 'Your assessment will show the areas that are strong. Keep them, work on the remaining unknowns and choose a practical test. The app does not issue a go or no-go verdict or promise success.'],
        ['Where do the sources come from?', 'The app uses a curated evidence collection. Quotes must match permitted stored excerpts; paraphrases carry source context. If relevant evidence is missing, coverage is limited rather than filled with invented companies or quotations.'],
        ['What can I keep?', 'Save your conversations and assessments, revisit history and download an assessment as Markdown. Account controls let you manage your data.'],
        ['Can I speak instead of typing?', 'The current experience is text-only.'],
        ['What are the boundaries?', 'This is not professional advice or crisis care. Safety checks redirect crisis-related conversations toward support, and political persuasion is outside the intended use.'],
        ['How do I get started?', 'Try the short scripted sample above, then create an account with Google or email. You can also go straight to Pricing and review the subscription before conversation onboarding.'],
      ].map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
    </div>
  </section>;
}
