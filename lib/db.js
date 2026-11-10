'use strict';
/* Database (SQLite, ingebouwd in Node 22.5+; geen extra pakket nodig). Eén bestand: <DATA_DIR>/bassma.db */
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, sub TEXT, has_menu INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT, category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL, price_cents INTEGER NOT NULL, menu_price_cents INTEGER,
  sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(category_id, name)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  public_token TEXT NOT NULL UNIQUE,
  idem TEXT UNIQUE,
  created_at TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'web',
  type TEXT NOT NULL,
  slot_date TEXT NOT NULL, slot_time TEXT NOT NULL,
  name TEXT, phone TEXT, email TEXT, address TEXT, km REAL NOT NULL DEFAULT 0,
  note TEXT, items TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL, fee_cents INTEGER NOT NULL DEFAULT 0, total_cents INTEGER NOT NULL,
  pay_method TEXT NOT NULL,
  provider TEXT, checkout_id TEXT, checkout_ref TEXT, checkout_url TEXT, transaction_id TEXT,
  pay_status TEXT NOT NULL,
  reserved_until INTEGER,
  paid_at TEXT, refunded_cents INTEGER NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'nieuw',
  accepted_at TEXT, anonymized INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_orders_slot ON orders(slot_date, slot_time);
CREATE INDEX IF NOT EXISTS idx_orders_checkout ON orders(checkout_id);
CREATE TABLE IF NOT EXISTS print_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
  created_at TEXT NOT NULL, printed_at TEXT, next_try INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_print_once ON print_jobs(order_id) WHERE kind = 'order';
CREATE UNIQUE INDEX IF NOT EXISTS idx_print_courier ON print_jobs(order_id) WHERE kind = 'courier';
CREATE TABLE IF NOT EXISTS mail_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
  created_at TEXT NOT NULL, sent_at TEXT, next_try INTEGER NOT NULL DEFAULT 0,
  UNIQUE(order_id, kind)
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, order_id INTEGER, type TEXT NOT NULL, detail TEXT
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff'
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL, csrf TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, username TEXT, ip TEXT, ok INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_ts ON login_attempts(ts);
`;

function addColumn(db, table, col, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  db.exec(SCHEMA);
  /* kolommen die later zijn toegevoegd: bestaande databases blijven zo gewoon werken */
  addColumn(db, 'orders', 'eta_at', 'eta_at INTEGER');
  addColumn(db, 'orders', 'eta_minutes', 'eta_minutes REAL');
  addColumn(db, 'orders', 'stage_at', 'stage_at INTEGER');
  addColumn(db, 'orders', 'refund_busy', 'refund_busy INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'users', 'disabled', 'disabled INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'users', 'demo', 'demo INTEGER NOT NULL DEFAULT 0');
  return db;
}

/* Alles-of-niets: gebruikt voor het reserveren van tijdsloten en het markeren als betaald */
function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch (_) { /* al teruggedraaid */ } throw e; }
}

function logEvent(db, orderId, type, detail) {
  db.prepare('INSERT INTO events (ts, order_id, type, detail) VALUES (?, ?, ?, ?)')
    .run(new Date().toISOString(), orderId == null ? null : orderId, type, detail == null ? null : (typeof detail === 'string' ? detail : JSON.stringify(detail)));
}

module.exports = { open, tx, logEvent };
