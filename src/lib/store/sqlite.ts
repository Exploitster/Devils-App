import type { DatabaseSync } from 'node:sqlite';

/** Runs the action under an immediate SQLite write lock, rolling back if it throws. */
export function immediateTransaction<T>(db: DatabaseSync, action: () => T): T {
  db.exec('BEGIN IMMEDIATE'); try { const value = action(); db.exec('COMMIT'); return value; } catch (error) { db.exec('ROLLBACK'); throw error; }
}
