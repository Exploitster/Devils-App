import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FrameworkArea, FrameworkVersion, FrameworkVersionSummary, KnowledgeItem, KnowledgeItemSummary, KnowledgePassage, Mode } from '../contracts';
import { notFound } from '../errors';
import { ftsMatch, searchTerms } from './query';
import { invalidStatus, passageId, type KnowledgeItemPatch, type KnowledgeSearch, type KnowledgeStatusChange, type KnowledgeStore, type NewKnowledgeItem } from './store';

// Lives in the same SQLite file as LocalStore, in its own tables. The FTS5 index reads
// passage text from knowledge_passages and triggers keep it in step.
const schema = `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS knowledge_items (id TEXT PRIMARY KEY, status TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS knowledge_passages (pk INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, item_id TEXT NOT NULL, title TEXT NOT NULL, text TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS knowledge_passages_item ON knowledge_passages(item_id);
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(title, text, content='knowledge_passages', content_rowid='pk', tokenize='porter unicode61');
CREATE TRIGGER IF NOT EXISTS knowledge_passages_insert AFTER INSERT ON knowledge_passages BEGIN INSERT INTO knowledge_fts(rowid, title, text) VALUES (new.pk, new.title, new.text); END;
CREATE TRIGGER IF NOT EXISTS knowledge_passages_delete AFTER DELETE ON knowledge_passages BEGIN INSERT INTO knowledge_fts(knowledge_fts, rowid, title, text) VALUES ('delete', old.pk, old.title, old.text); END;
CREATE TRIGGER IF NOT EXISTS knowledge_passages_update AFTER UPDATE ON knowledge_passages BEGIN INSERT INTO knowledge_fts(knowledge_fts, rowid, title, text) VALUES ('delete', old.pk, old.title, old.text); INSERT INTO knowledge_fts(rowid, title, text) VALUES (new.pk, new.title, new.text); END;
CREATE TABLE IF NOT EXISTS framework_versions (mode TEXT NOT NULL, version INTEGER NOT NULL, areas TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL, PRIMARY KEY(mode, version));`;
// Title words count double against passage text, matching the weighted index in PostgreSQL.
const rank = 'bm25(knowledge_fts, 2.0, 1.0)';

/** Server-only local knowledge store. Each mutation commits under an immediate SQLite write lock. */
export class LocalKnowledgeStore implements KnowledgeStore {
  private db: DatabaseSync;
  constructor(path: string) { mkdirSync(dirname(path), { recursive: true }); this.db = new DatabaseSync(path); this.db.exec(schema); }
  close() { this.db.close(); }
  private transaction<T>(action: () => T): T { this.db.exec('BEGIN IMMEDIATE'); try { const value = action(); this.db.exec('COMMIT'); return value; } catch (error) { this.db.exec('ROLLBACK'); throw error; } }
  private read(id: string): KnowledgeItem | null { const row = this.db.prepare('SELECT data FROM knowledge_items WHERE id=?').get(id) as { data: string } | undefined; return row ? JSON.parse(row.data) as KnowledgeItem : null; }
  private existing(id: string): KnowledgeItem { const item = this.read(id); if (!item) throw notFound(); return item; }
  private save(item: KnowledgeItem): KnowledgeItem { this.db.prepare('INSERT INTO knowledge_items VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status, data=excluded.data').run(item.id, item.status, item.createdAt, JSON.stringify(item)); return item; }
  private removePassages(itemId: string) { this.db.prepare('DELETE FROM knowledge_passages WHERE item_id=?').run(itemId); }
  async createItem(input: NewKnowledgeItem, now: string) { return this.transaction(() => this.save({ ...input, id: randomUUID(), createdAt: now, updatedAt: now })); }
  async updateItem(id: string, patch: KnowledgeItemPatch, now: string) { return this.transaction(() => { const item = this.existing(id); if (item.status === 'approved') throw invalidStatus(); return this.save({ ...item, ...patch, updatedAt: now }); }); }
  async setStatus(id: string, change: KnowledgeStatusChange, now: string) {
    return this.transaction(() => {
      const { failureReason: _reason, processingStartedAt: _started, ...item } = this.existing(id); void [_reason, _started];
      if (item.status === 'approved') throw invalidStatus();
      return this.save({ ...item, ...change, updatedAt: now });
    });
  }
  async approveItem(id: string, passages: string[], now: string) {
    return this.transaction(() => {
      const item = this.existing(id); if (item.status !== 'review') throw invalidStatus();
      this.removePassages(id); const insert = this.db.prepare('INSERT INTO knowledge_passages(id, item_id, title, text) VALUES(?,?,?,?)');
      passages.forEach((text, index) => insert.run(passageId(id, index), id, item.title, text));
      return this.save({ ...item, status: 'approved', updatedAt: now });
    });
  }
  async withdrawItem(id: string, now: string) { return this.transaction(() => { const item = this.existing(id); if (item.status !== 'approved') throw invalidStatus(); this.removePassages(id); return this.save({ ...item, status: 'review', updatedAt: now }); }); }
  async deleteItem(id: string) { this.transaction(() => { this.existing(id); this.removePassages(id); this.db.prepare('DELETE FROM knowledge_items WHERE id=?').run(id); }); }
  async getItem(id: string) { return this.read(id); }
  async listItems(): Promise<KnowledgeItemSummary[]> {
    return (this.db.prepare('SELECT data FROM knowledge_items ORDER BY created_at DESC, id').all() as { data: string }[]).map(row => { const { text: _text, ...summary } = JSON.parse(row.data) as KnowledgeItem; void _text; return summary; });
  }
  async search(query: KnowledgeSearch, limit: number): Promise<KnowledgePassage[]> {
    const match = searchTerms(query.match); if (!match.length) return [];
    const boost = searchTerms(query.rank ?? '');
    // bm25() is lower for better matches. Ranking words add their own score only to passages the answer matched.
    const ranked = boost.length ? `LEFT JOIN (SELECT rowid AS pk, ${rank} AS score FROM knowledge_fts WHERE knowledge_fts MATCH :rank) r ON r.pk = m.pk` : '';
    const rows = this.db.prepare(`SELECT p.text FROM (SELECT rowid AS pk, ${rank} AS score FROM knowledge_fts WHERE knowledge_fts MATCH :match) m ${ranked}
      JOIN knowledge_passages p ON p.pk = m.pk JOIN knowledge_items i ON i.id = p.item_id AND i.status = 'approved'
      ORDER BY m.score + ${boost.length ? 'COALESCE(r.score, 0)' : '0'}, p.id LIMIT :limit`).all({ match: ftsMatch(match), ...(boost.length ? { rank: ftsMatch(boost) } : {}), limit }) as { text: string }[];
    return rows.map(row => ({ text: row.text }));
  }
  async publishVersion(mode: Mode, areas: FrameworkArea[], note: string | undefined, now: string): Promise<FrameworkVersion> {
    return this.transaction(() => {
      const { next } = this.db.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS next FROM framework_versions WHERE mode=?').get(mode) as { next: number };
      this.db.prepare('INSERT INTO framework_versions VALUES(?,?,?,?,?)').run(mode, next, JSON.stringify(areas), note ?? null, now);
      return { mode, version: next, areas, ...(note === undefined ? {} : { note }), createdAt: now };
    });
  }
  async listVersions(mode: Mode): Promise<FrameworkVersionSummary[]> {
    return (this.db.prepare('SELECT version, note, created_at FROM framework_versions WHERE mode=? ORDER BY version DESC').all(mode) as { version: number; note: string | null; created_at: string }[]).map(row => ({ mode, version: row.version, ...(row.note === null ? {} : { note: row.note }), createdAt: row.created_at }));
  }
  async getVersion(mode: Mode, version?: number): Promise<FrameworkVersion | null> {
    const row = (version === undefined ? this.db.prepare('SELECT version, areas, note, created_at FROM framework_versions WHERE mode=? ORDER BY version DESC LIMIT 1').get(mode) : this.db.prepare('SELECT version, areas, note, created_at FROM framework_versions WHERE mode=? AND version=?').get(mode, version)) as { version: number; areas: string; note: string | null; created_at: string } | undefined;
    return row ? { mode, version: row.version, areas: JSON.parse(row.areas) as FrameworkArea[], ...(row.note === null ? {} : { note: row.note }), createdAt: row.created_at } : null;
  }
}
