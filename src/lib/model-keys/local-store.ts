import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ModelKeyStore, StoredModelKey } from './store';

const schema = `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS user_model_keys (user_id TEXT PRIMARY KEY, data TEXT NOT NULL);`;

export class LocalModelKeyStore implements ModelKeyStore {
  private db: DatabaseSync;
  constructor(path: string) { if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true }); this.db = new DatabaseSync(path); this.db.exec(schema); }
  close() { this.db.close(); }
  async get(userId: string) { const row = this.db.prepare('SELECT data FROM user_model_keys WHERE user_id=?').get(userId) as { data: string } | undefined; return row ? JSON.parse(row.data) as StoredModelKey : null; }
  async put(record: StoredModelKey) { this.db.prepare('INSERT INTO user_model_keys VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data').run(record.userId, JSON.stringify(record)); }
  async delete(userId: string) { this.db.prepare('DELETE FROM user_model_keys WHERE user_id=?').run(userId); }
}
