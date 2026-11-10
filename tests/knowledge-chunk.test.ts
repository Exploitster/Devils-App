import { describe, expect, it } from 'vitest';
import { chunkText, normaliseText } from '../src/lib/knowledge/chunk';

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
// Sentences of 12 to 21 words, each unique so a passage's position can be traced.
function sentences(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix} sentence ${i + 1} ${'word '.repeat(7 + (i % 10)).trim()} ends here.`);
}
function lastSentence(passage: string): string { return passage.split(/(?<=[.!?])\s+/).at(-1)!; }

describe('chunking owner notes into passages', () => {
  it('keeps passages within a heading, under 400 words, each starting with the last sentence of the one before', () => {
    const paragraphs = (prefix: string) => Array.from({ length: 5 }, (_, p) => sentences(`${prefix} p${p}`, 7).join(' '));
    const note = `# Setting the price\n\n${paragraphs('Pricing').join('\n\n')}\n\n## Finding customers\n\n${paragraphs('Channels').join('\n\n')}`;
    expect(words(note)).toBeGreaterThan(1100); expect(words(note)).toBeLessThan(1300);
    const passages = chunkText(note);
    expect(passages.length).toBeGreaterThan(4);
    for (const passage of passages) {
      expect(words(passage)).toBeLessThanOrEqual(400);
      expect(passage.includes('Pricing p') && passage.includes('Channels p')).toBe(false);
      expect(passage.includes('Finding customers') && passage.includes('Pricing p')).toBe(false);
    }
    const pricing = passages.filter(p => p.includes('Pricing p')); const channels = passages.filter(p => p.includes('Channels p'));
    expect(pricing[0].startsWith('Setting the price\n\nPricing p0')).toBe(true); expect(channels[0].startsWith('Finding customers\n\nChannels p0')).toBe(true);
    for (const section of [pricing, channels]) for (let i = 1; i < section.length; i++) expect(section[i].startsWith(lastSentence(section[i - 1]))).toBe(true);
    for (const sentence of note.split('\n').filter(line => !line.startsWith('#')).join(' ').trim().split(/(?<=\.)\s+/)) expect(passages.some(p => p.includes(sentence))).toBe(true);
  });
  it('splits one long paragraph on sentence boundaries', () => {
    const paragraph = sentences('Solo', 54).join(' ');
    expect(words(paragraph)).toBeGreaterThan(850); expect(words(paragraph)).toBeLessThan(950);
    const passages = chunkText(paragraph);
    expect(passages.length).toBeGreaterThan(2);
    for (const passage of passages) { expect(words(passage)).toBeLessThanOrEqual(400); expect(passage).toMatch(/^Solo sentence \d+ .* ends here\.$/); }
  });
  it('strips control characters, collapses whitespace and returns nothing for blank text', () => {
    expect(normaliseText('Cafe\u0301\u0000 prices\t\t  rise.\r\n\r\n\r\n\r\nThen   fall.\u0007')).toBe('Caf\u00e9 prices rise.\n\nThen fall.');
    expect(chunkText('Short \u0000note   here.')).toEqual(['Short note here.']);
    expect(chunkText('')).toEqual([]);
    expect(chunkText(' \n\t \r\n ')).toEqual([]);
  });
});
