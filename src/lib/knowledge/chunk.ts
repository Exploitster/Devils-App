// Owner text is split into passages of about TARGET words, never more than LIMIT, so a
// search result is a focused piece of guidance. Splits follow headings, then paragraphs,
// then sentences. Each passage after the first in a section repeats the last sentence of
// the passage before it, so a point that spans a split is still found whole.
const TARGET = 250;
const LIMIT = 400;
// The longest piece a passage is built from. A passage is one repeated sentence plus at
// least one new piece, each at most this size, so it stays within LIMIT.
const UNIT = LIMIT / 2;

const countWords = (text: string) => text.split(' ').filter(Boolean).length;

/** NFC, control characters removed, spaces collapsed, at most one blank line between paragraphs. */
export function normaliseText(text: string): string {
  return text.normalize('NFC').replace(/\r\n?|[\u2028\u2029]/g, '\n').replace(/\t/g, ' ')
    .replace(/[^\P{Cc}\n]/gu, '')
    .split('\n').map(line => line.replace(/[^\S\n]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}

interface Unit { text: string; paragraph: number; heading?: boolean; }

function sentencesOf(paragraph: string): string[] {
  return paragraph.split(/(?<=[.!?…]["'”’)\]]*)\s+/u).filter(Boolean);
}
/** Splits a sentence longer than UNIT words into word runs. */
function pieces(sentence: string): string[] {
  const words = sentence.split(' '); if (words.length <= UNIT) return [sentence];
  const result: string[] = []; for (let i = 0; i < words.length; i += UNIT) result.push(words.slice(i, i + UNIT).join(' ')); return result;
}
function sections(text: string): { heading?: string; paragraphs: string[] }[] {
  const result: { heading?: string; paragraphs: string[] }[] = [{ paragraphs: [] }];
  let open = false;
  for (const line of text.split('\n')) {
    const heading = /^#{1,6} (.+)$/.exec(line); const current = result.at(-1)!;
    if (heading) { result.push({ heading: heading[1].replace(/ #+$/, ''), paragraphs: [] }); open = false; }
    else if (!line) open = false;
    // Lines of one paragraph join with a space: PDFs and wrapped notes break lines mid-sentence.
    else if (open) current.paragraphs[current.paragraphs.length - 1] += ' ' + line;
    else { current.paragraphs.push(line); open = true; }
  }
  return result.filter(section => section.heading || section.paragraphs.length);
}
function join(units: Unit[]): string {
  return units.map((unit, i) => (i === 0 ? '' : unit.paragraph === units[i - 1].paragraph && !units[i - 1].heading ? ' ' : '\n\n') + unit.text).join('');
}

export function chunkText(raw: string): string[] {
  const passages: string[] = [];
  for (const section of sections(normaliseText(raw))) {
    const units: Unit[] = section.heading ? [{ text: section.heading, paragraph: -1, heading: true }] : [];
    section.paragraphs.forEach((paragraph, index) => {
      if (countWords(paragraph) <= UNIT) units.push({ text: paragraph, paragraph: index });
      else for (const sentence of sentencesOf(paragraph)) for (const piece of pieces(sentence)) units.push({ text: piece, paragraph: index });
    });
    let current: Unit[] = []; let size = 0; let added = false;
    const flush = () => {
      passages.push(join(current));
      const last = current.at(-1)!; const tail = sentencesOf(last.text).at(-1)!;
      current = [{ text: tail, paragraph: last.paragraph }]; size = countWords(tail); added = false;
    };
    for (const unit of units) {
      const words = countWords(unit.text);
      // A heading stays with what follows it; otherwise start a new passage past the target.
      if (added && !current.every(u => u.heading) && size + words > TARGET) flush();
      current.push(unit); size += words; added = true;
    }
    if (added) passages.push(join(current));
  }
  return passages;
}
