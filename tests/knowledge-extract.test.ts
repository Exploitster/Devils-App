import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractPdfText } from '../src/lib/knowledge/extract';

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

describe('PDF text extraction', () => {
  it('returns the text of a PDF with a text layer', async () => {
    expect(await extractPdfText(fixture('note.pdf'))).toContain('Charge for the outcome the customer can measure.');
  });
  it('fails a PDF without a text layer with a plain reason', async () => {
    await expect(extractPdfText(fixture('scan.pdf'))).rejects.toMatchObject({ code: 'PDF_NO_TEXT', message: 'This PDF has no text layer' });
  });
});
