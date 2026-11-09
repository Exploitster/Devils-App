import { describe, expect, it } from 'vitest';
import { ftsMatch, searchTerms } from '../src/lib/knowledge/query';

describe('knowledge search terms', () => {
  it('keeps the meaningful words of an answer, lowercased and without repeats', () => {
    expect(searchTerms("I'll charge ten dollars a month for the subscription")).toEqual(['charge', 'ten', 'dollars', 'month', 'subscription']);
    expect(searchTerms('Pricing, PRICING and pricing!')).toEqual(['pricing']);
    expect(searchTerms('Café owners')).toEqual(['café', 'owners']);
  });
  it('returns no terms for text made only of stop words', () => {
    expect(searchTerms('and the of')).toEqual([]);
    expect(searchTerms('   ')).toEqual([]);
  });
  it('turns search operators and quotes into plain quoted words joined by OR', () => {
    const terms = searchTerms('price" OR NEAR(* -');
    expect(terms).toEqual(['price', 'near']);
    expect(ftsMatch(terms)).toBe('"price" OR "near"');
  });
});
