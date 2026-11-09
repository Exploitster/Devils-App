// Shared by both knowledge backends so they agree on which words a search uses.
// PostgreSQL's English stop words, plus the tails left when contractions split ("I'll" -> "ll").
const stopWords = new Set(`i me my myself we our ours ourselves you your yours yourself yourselves he him his himself she her hers herself
it its itself they them their theirs themselves what which who whom this that these those am is are was were be been being have has had
having do does did doing a an the and but if or because as until while of at by for with about against between into through during before
after above below to from up down in out on off over under again further then once here there when where why how all any both each few
more most other some such no nor not only own same so than too very s t can will just don should now ll re ve d m`.split(/\s+/));

/** The meaningful words of some text: NFC, lowercased, letters and digits only, stop words and repeats removed. */
export function searchTerms(text: string): string[] {
  const words = text.normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words.filter(word => !stopWords.has(word)))];
}

/** An FTS5 query that ORs each word as a quoted string, so no input can act as a search operator. */
export function ftsMatch(terms: string[]): string {
  return terms.map(term => `"${term.replaceAll('"', '""')}"`).join(' OR ');
}
