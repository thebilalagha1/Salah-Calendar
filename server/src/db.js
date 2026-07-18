import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "..", "data.db"));

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,           -- Google 'sub' claim, stable per Google account
    email TEXT NOT NULL,
    name TEXT,
    picture TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS kv (
    user_id TEXT NOT NULL REFERENCES users(id),
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, key)
  );
`);

export function upsertUser({ id, email, name, picture }) {
  db.prepare(
    `INSERT INTO users (id, email, name, picture) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture`
  ).run(id, email, name || null, picture || null);
  return db.prepare("SELECT id, email, name, picture FROM users WHERE id = ?").get(id);
}

export function getUser(id) {
  return db.prepare("SELECT id, email, name, picture FROM users WHERE id = ?").get(id);
}

export function getValue(userId, key) {
  const row = db.prepare("SELECT value FROM kv WHERE user_id = ? AND key = ?").get(userId, key);
  return row ? row.value : null;
}

export function setValue(userId, key, value) {
  db.prepare(
    `INSERT INTO kv (user_id, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(userId, key, value);
}

export default db;
