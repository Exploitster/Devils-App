import { DatabaseSync } from 'node:sqlite';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LOCAL_DIR = '.local';

/**
 * Turns a saved session into one saved before case prep: an old clarify-and-debate thread with a
 * hand-back card and no case record. The e2e server writes to a fresh `.local/e2e-*.sqlite` file per
 * run, so the file that holds this session id is the one the server is using.
 */
export function seedLegacySession(sessionId: string, position: string) {
  const db = openDatabaseFor(sessionId);
  try {
    const row = db.prepare("SELECT data FROM records WHERE kind='sessions' AND id=?").get(sessionId) as { data: string };
    const session = JSON.parse(row.data);
    const at = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const reply = 'Underlying question: is paid support enough to cover what the open source database costs to serve?';
    session.revision = 3;
    session.state = {
      ...session.state,
      phase: 'card',
      position,
      underlyingQuestion: 'Is paid support enough to cover serving costs?',
      strengths: ['You named who would pay and why.'],
      openQuestions: ['Which customers have already asked for paid support?'],
      nextStep: 'Interview five teams that run the database in production.',
      summary: 'An open source database funded by support contracts.',
    };
    delete session.state.casePrep;
    session.messages = [
      { id: 'legacy-user', role: 'user', text: position, createdAt: at, citations: [] },
      { id: 'legacy-assistant', role: 'assistant', text: reply, createdAt: at, citations: [] },
    ];
    session.cards = [{
      id: 'legacy-card', version: 1, sessionRevision: 3, position,
      strengths: ['You named who would pay and why.'], counterpoints: [],
      openQuestions: ['Which customers have already asked for paid support?'],
      nextStep: 'Interview five teams that run the database in production.',
      closing: 'Your call. Always.', createdAt: at,
    }];
    db.prepare("UPDATE records SET data=? WHERE kind='sessions' AND id=?").run(JSON.stringify(session), sessionId);
    return { reply };
  } finally {
    db.close();
  }
}

function openDatabaseFor(sessionId: string): DatabaseSync {
  const files = readdirSync(LOCAL_DIR)
    .filter(name => /^e2e-.*\.sqlite$/.test(name))
    .map(name => join(LOCAL_DIR, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const file of files) {
    const db = new DatabaseSync(file);
    try {
      db.exec('PRAGMA busy_timeout=5000');
      if (db.prepare("SELECT 1 FROM records WHERE kind='sessions' AND id=?").get(sessionId)) return db;
    } catch { /* another run's file may be mid-write or not yet initialised */ }
    db.close();
  }
  throw new Error(`No e2e database holds session ${sessionId}`);
}
