// The first message typed on the new-conversation screen is handed to the
// conversation page in memory only: unsent drafts never touch the URL or
// browser storage (see the Account page's privacy note).
const pending = new Map<string, string>();

export function handOverFirstMessage(sessionId: string, text: string) {
  pending.set(sessionId, text);
}

export function takeFirstMessage(sessionId: string): string | undefined {
  const text = pending.get(sessionId);
  pending.delete(sessionId);
  return text;
}
