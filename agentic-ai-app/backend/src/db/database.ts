/**
 * SQLite database using sql.js (pure JS — no native compilation needed).
 * We persist the database to disk manually after each write.
 */

import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import path from 'path';
import fs from 'fs';
import {
  CREATE_SESSIONS_TABLE,
  CREATE_MESSAGES_TABLE,
  CREATE_TOOL_EXECUTIONS_TABLE,
  CREATE_AGENT_RULES_TABLE,
  CREATE_FEEDBACK_TABLE,
  CREATE_LEARNED_PATTERNS_TABLE,
  DEFAULT_RULES,
} from './schema';
import { migrateAddUserId } from './migrate-add-user-id';

const DB_PATH = path.resolve(process.env.DB_PATH || './data/sessions.db');

let SQL: SqlJsStatic;
let db: Database;

function persist(): void {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function initDb(): Promise<void> {
  SQL = await initSqlJs();

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON;');
  initSchema();
  persist();

  console.log('[DB] SQLite initialized at', DB_PATH);
}

function initSchema(): void {
  db.run(CREATE_SESSIONS_TABLE);
  db.run(CREATE_MESSAGES_TABLE);
  db.run(CREATE_TOOL_EXECUTIONS_TABLE);
  db.run(CREATE_AGENT_RULES_TABLE);
  db.run(CREATE_FEEDBACK_TABLE);
  db.run(CREATE_LEARNED_PATTERNS_TABLE);

  // Run migration to add user_id if needed
  migrateAddUserId();

  const result = db.exec('SELECT COUNT(*) as c FROM agent_rules');
  const count = (result[0]?.values[0]?.[0] as number) ?? 0;

  if (count === 0) {
    for (const rule of DEFAULT_RULES) {
      db.run(
        'INSERT OR IGNORE INTO agent_rules (rule_key, rule_value, description) VALUES (?, ?, ?)',
        [rule.key, rule.value, rule.description]
      );
    }
  }
}

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

export function saveToDisk(): void {
  persist();
}

export async function initDatabase(): Promise<void> {
  await initDb();
}

export interface Row {
  [key: string]: string | number | null | Uint8Array;
}

/**
 * Execute a SELECT and return all rows as plain objects.
 * FIX: always frees the statement even if an error is thrown.
 */
export function queryAll(sql: string, params: (string | number | null)[] = []): Row[] {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows: Row[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as Row);
    }
    return rows;
  } finally {
    stmt.free(); // always free — prevents memory leak on error
  }
}

export function queryOne(sql: string, params: (string | number | null)[] = []): Row | null {
  return queryAll(sql, params)[0] ?? null;
}

export function execute(sql: string, params: (string | number | null)[] = []): void {
  db.run(sql, params);
  persist();
}

export default getDb;
