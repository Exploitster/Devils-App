import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/app';
import reviewedSources from '../../../data/evidence/seed.json';
import { LocalPrice } from '@/components/local-price';
import { pageJsonLd, publicPages, siteOrigin } from '@/lib/site-content';

export const dynamicParams = false;
export function generateStaticParams() { return publicPages.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = publicPages.find(item => item.slug === slug);
  if (!page) return {};
  return {
    title: page.title, description: page.description,
    alternates: { canonical: `${siteOrigin}/${slug}` },
    openGraph: { type: 'website', title: page.title, description: page.description, url: `${siteOrigin}/${slug}`, siteName: 'Devils Advocate' },
    twitter: { card: 'summary', title: page.title, description: page.description },
  };
}
export default async function InformationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = publicPages.find(item => item.slug === slug);
  if (!page) notFound();
  return <Shell><article className="content-page">
    {pageJsonLd(page).map((node, index) => <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(node).replaceAll('<', '\\u003c') }} />)}
    <nav aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true"> / </span><span>{page.title}</span></nav>
    <header className="content-heading"><p className="eyebrow">DEVILS ADVOCATE</p><h1>{page.heading}</h1><p className="lead">{page.intro}</p></header>
    <div className="content-grid">{page.sections.map(section => <section className="panel" key={section.title}><h2>{section.title}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</section>)}</div>
    {slug === 'pricing' && <section className="panel"><h2>₹2,000 INR / month</h2><LocalPrice/><Link className="button primary" href="/billing">Review the monthly plan</Link><p className="fine">Live subscriptions are currently closed. Current free access continues.</p></section>}
    {page.questions && <section className="panel" aria-labelledby="questions-title"><h2 id="questions-title">Questions and answers</h2>{page.questions.map(({ question, answer }) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</section>}
    {slug === 'sources' && <section className="panel" aria-labelledby="source-list-title"><h2 id="source-list-title">Current reviewed collection</h2><p>These records support specific claims. Read their limitations before applying them to another situation.</p>{reviewedSources.map(source => <details key={source.id}><summary>{source.title}</summary><p>{source.author} · {source.work} · {source.edition}</p><ul>{source.limitations.map(limit => <li key={limit}>{limit}</li>)}</ul><a href={source.url} target="_blank" rel="noopener noreferrer">Read the original source</a></details>)}</section>}
    {slug === 'contact' && <p><a href="https://github.com/Exploitster/Devils-App/issues" target="_blank" rel="noopener noreferrer">Open the public technical issue tracker</a></p>}
    {slug === 'how-it-works' && <p><Link className="button" href="/#try-sample">Try a sample without an account</Link></p>}
    <section className="content-related" aria-labelledby="related-title"><h2 id="related-title">Explore the details</h2><div className="actions">{page.related.map(related => <Link className="button quiet" key={related} href={`/${related}`}>{publicPages.find(item => item.slug === related)!.title}</Link>)}</div></section>
    <p className="fine">For the policies governing your account and purchases, read the <Link href="/terms">Terms of use</Link> and <Link href="/privacy">Privacy notice</Link>.</p>
  </article></Shell>;
}
