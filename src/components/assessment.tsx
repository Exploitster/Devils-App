'use client';
import { useState } from 'react';
import type { Assessment, Counterpoint, Evidence, Mode } from '@/lib/contracts';
import { api } from './app';
import { SourceButton } from './source';

type Score = Assessment['areas'][number]['score'];

export const scoreLabels: Record<Score, string> = {
  strong: 'Strong',
  weak: 'Weak',
  untested: 'Untested',
  not_covered: 'Not covered',
};

export function Points({ points }: { points: Counterpoint[] }) {
  return <>{points.map(point => <article className="counterpoint" key={point.id}>
    <p>{point.text}</p>
    {point.citations.map((citation, index) => <SourceButton key={index} citation={citation}/>)}
    {point.interpretation && <p className="interpretation"><strong>Interpretation</strong><br/>{point.interpretation}</p>}
  </article>)}</>;
}

export async function citedSources(points: Counterpoint[]) {
  const ids = [...new Set(points.flatMap(point => point.citations.map(citation => citation.evidenceId)))];
  const sources = await Promise.all(ids.map(id => api<{ evidence: Evidence }>(`/api/evidence/${encodeURIComponent(id)}`).then(data => data.evidence)));
  return sources.map(source => ({
    source,
    locators: source.excerpts
      .filter(excerpt => points.some(point => point.citations.some(citation => citation.evidenceId === source.id && citation.excerptId === excerpt.id)))
      .map(excerpt => excerpt.locator),
  }));
}

function list(items: string[]) {
  return items.length ? items.map(item => `- ${item}`).join('\n') : '- Nothing recorded yet.';
}

export async function assessmentMarkdown(assessment: Assessment, mode: Mode) {
  const sources = await citedSources(assessment.loopholes);
  const areas = assessment.areas.map(area => `- **${area.label}**: ${scoreLabels[area.score]}. ${area.reason}${area.nextStep ? `\n  Next step: ${area.nextStep}` : ''}`).join('\n');
  const loopholes = assessment.loopholes.length
    ? assessment.loopholes.map(point => `- ${point.text}${point.interpretation ? `\n  Interpretation: ${point.interpretation}` : ''}`).join('\n')
    : '- No relevant reviewed source was found.';
  const sourceText = sources.map(({ source, locators }) => {
    const lines = [`${source.author}. ${source.work}. ${source.edition}. ${source.publicationDate ?? 'Date unspecified'}. ${source.url}`];
    if (locators.length) lines.push(locators.join('; '));
    if (source.attribution) {
      const { site, postUrl, authors, licence, licenceUrl } = source.attribution;
      lines.push(`From ${site}: ${postUrl}, by ${authors.map(author => `${author.name} (${author.profileUrl})`).join(', ')}. Licensed under ${licence} (${licenceUrl}).`);
    }
    return lines.join('\n');
  }).join('\n\n');
  return [
    `# Assessment · ${assessment.createdAt.slice(0, 10)}`,
    `## ${mode === 'business' ? 'Your idea' : 'Your decision'}\n${assessment.statement}`,
    `## Area by area\n${areas}`,
    `## Loopholes\n${loopholes}`,
    `## What is good\n${list(assessment.good)}`,
    `## What is bad\n${list(assessment.bad)}`,
    `## What must be true\n${list(assessment.mustBeTrue)}`,
    ...(sourceText ? [`## Sources\n${sourceText}`] : []),
    assessment.closing,
  ].join('\n\n') + '\n';
}

export async function copyMarkdown(build: () => Promise<string>, copied: string, setStatus: (status: string) => void) {
  try {
    await navigator.clipboard.writeText(await build());
    setStatus(copied);
  } catch {
    setStatus('Copy unavailable. Use Download Markdown.');
  }
}

export async function downloadMarkdown(build: () => Promise<string>, filename: string, setStatus: (status: string) => void) {
  try {
    const url = URL.createObjectURL(new Blob([await build()], { type: 'text/markdown' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    setStatus('Markdown downloaded.');
  } catch (error) {
    setStatus((error as Error).message);
  }
}

export function AssessmentDocument({ assessment, mode }: { assessment: Assessment; mode: Mode }) {
  const [status, setStatus] = useState('');
  const build = () => assessmentMarkdown(assessment, mode);
  const copy = () => copyMarkdown(build, 'Assessment copied.', setStatus);
  const download = () => downloadMarkdown(build, `assessment-${assessment.createdAt.slice(0, 10)}.md`, setStatus);
  const titleId = `assessment-${assessment.id}`;
  return <section className="panel handback assessment" aria-labelledby={titleId} aria-live="off" data-assessment-id={assessment.id}>
    <p className="eyebrow">{assessment.complete ? 'EVERY AREA COVERED' : 'AN EARLY LOOK, FROM THE ANSWERS SO FAR'}</p>
    <h2 id={titleId}>Your assessment</h2>
    <p className="muted">Written {new Date(assessment.createdAt).toLocaleString()}</p>
    <h3>{mode === 'business' ? 'Your idea' : 'Your decision'}</h3>
    <p>{assessment.statement}</p>
    <h3 id={`${titleId}-areas`}>Area by area</h3>
    <ul className="assessment-areas" aria-labelledby={`${titleId}-areas`}>
      {assessment.areas.map(area => <li key={area.id}>
        <div className="assessment-area-head">
          <strong>{area.label}</strong>
          <span className={`score score-${area.score}`}>{scoreLabels[area.score]}</span>
        </div>
        <p>{area.reason}</p>
        {area.nextStep && <p className="muted">Next step: {area.nextStep}</p>}
      </li>)}
    </ul>
    <h3>Loopholes</h3>
    {assessment.loopholes.length ? <Points points={assessment.loopholes}/> : <p>No relevant reviewed source was found. These reflections do not establish factual claims.</p>}
    <h3>What is good</h3>
    {assessment.good.length ? <ul>{assessment.good.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="muted">Nothing recorded yet.</p>}
    <h3>What is bad</h3>
    {assessment.bad.length ? <ul>{assessment.bad.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="muted">Nothing recorded yet.</p>}
    <h3>What must be true</h3>
    {assessment.mustBeTrue.length ? <ul>{assessment.mustBeTrue.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="muted">Nothing recorded yet.</p>}
    <strong>{assessment.closing}</strong>
    <div className="actions">
      <button type="button" onClick={() => void copy()}>Copy assessment</button>
      <button type="button" onClick={() => void download()}>Download Markdown</button>
    </div>
    <p role="status">{status}</p>
  </section>;
}
