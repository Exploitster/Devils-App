import { describe, expect, it } from 'vitest';
import { publicPages, publicSlugs, siteOrigin, pageJsonLd } from '../src/lib/site-content';

describe('customer information content', () => {
  it('gives each indexable page a unique title, description and substantive sections', () => {
    expect(publicSlugs).toHaveLength(14);
    expect(new Set(publicPages.map(page => page.title)).size).toBe(publicPages.length);
    expect(new Set(publicPages.map(page => page.description)).size).toBe(publicPages.length);
    for (const page of publicPages) {
      expect(page.sections.length).toBeGreaterThanOrEqual(3);
      expect(page.sections.flatMap(section => section.paragraphs).join(' ').length).toBeGreaterThan(700);
      expect(page.related.every(slug => publicSlugs.includes(slug))).toBe(true);
    }
  });
  it('describes the actual monthly offer and never invents refund guarantees', () => {
    const pricing = publicPages.find(page => page.slug === 'pricing')!;
    expect(JSON.stringify(pricing)).toContain('₹2,000');
    expect(JSON.stringify(pricing)).toContain('No yearly plan');
    expect(JSON.stringify(publicPages.find(page => page.slug === 'refunds'))).toContain('purchase terms');
    expect(JSON.stringify(pageJsonLd(pricing))).not.toContain('InStock');
  });
  it('makes FAQ structured answers identical to visible answers with canonical URLs', () => {
    const faq = publicPages.find(page => page.slug === 'faq')!;
    const nodes = pageJsonLd(faq);
    const schema = nodes.find(node => node['@type'] === 'FAQPage')!;
    expect(schema.mainEntity).toEqual(faq.questions!.map(({ question, answer }) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } })));
    expect(nodes[0].url).toBe(`${siteOrigin}/faq`);
  });
});
