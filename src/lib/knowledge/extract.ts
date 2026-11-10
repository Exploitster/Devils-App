import { AppError } from '../errors';

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  // Loaded only when a PDF is processed, so no other route bundles or starts the PDF reader.
  const { extractText } = await import('unpdf');
  const { text } = await extractText(bytes, { mergePages: true });
  if (!text.trim()) throw new AppError('PDF_NO_TEXT', 'This PDF has no text layer', 422);
  return text;
}
