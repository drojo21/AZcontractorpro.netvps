/**
 * db.mjs — one SQLite file through Node's built-in node:sqlite.
 *
 * Every contractor, site, release, lead, photo, review, demo, subscription and
 * Stripe event lives in DATA_DIR/acp.sqlite. What used to be the Registry
 * sheet, the Leads sheets, Netlify Blobs and the CRM's separate database is
 * this one file. Back it up (node cli.mjs backup) and you have backed up the
 * business; the sites themselves can always be rebuilt from it.
 */
import { DatabaseSync } from "node:sqlite";
import { config, ensureDirs } from "./config.mjs";

const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

// Append-only. Each entry runs once, in order, tracked by PRAGMA user_version.
const MIGRATIONS = [
  `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE TABLE sessions (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );

  CREATE TABLE contractors (
    id             INTEGER PRIMARY KEY,
    business_name  TEXT NOT NULL,
    owner_name     TEXT NOT NULL DEFAULT '',
    email          TEXT NOT NULL DEFAULT '',
    phone          TEXT NOT NULL DEFAULT '',
    trade          TEXT NOT NULL DEFAULT 'general',
    roc_number     TEXT NOT NULL DEFAULT '',
    license_class  TEXT NOT NULL DEFAULT '',
    city           TEXT NOT NULL DEFAULT '',
    stage          TEXT NOT NULL DEFAULT 'prospect',
    source         TEXT NOT NULL DEFAULT 'manual',
    next_follow_up TEXT,
    created_at     TEXT NOT NULL DEFAULT ${NOW},
    updated_at     TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE UNIQUE INDEX contractors_roc ON contractors(roc_number) WHERE roc_number <> '';
  CREATE INDEX contractors_stage ON contractors(stage);

  CREATE TABLE activity (
    id            INTEGER PRIMARY KEY,
    contractor_id INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL DEFAULT 'note',
    body          TEXT NOT NULL,
    author        TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX activity_contractor ON activity(contractor_id, id);

  CREATE TABLE sites (
    id              INTEGER PRIMARY KEY,
    contractor_id   INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    slug            TEXT NOT NULL UNIQUE,
    status          TEXT NOT NULL DEFAULT 'draft',
    tier            TEXT NOT NULL DEFAULT 'pro',
    spec            TEXT NOT NULL DEFAULT '{}',
    copy_overrides  TEXT NOT NULL DEFAULT '{}',
    notify_email    TEXT NOT NULL DEFAULT '',
    portal_pin_hash TEXT NOT NULL DEFAULT '',
    current_release TEXT NOT NULL DEFAULT '',
    published_at    TEXT,
    last_checks     TEXT NOT NULL DEFAULT '{}',
    demo_expires_at TEXT,
    created_at      TEXT NOT NULL DEFAULT ${NOW},
    updated_at      TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX sites_contractor ON sites(contractor_id);

  CREATE TABLE domains (
    domain     TEXT PRIMARY KEY,
    site_id    INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    is_primary INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX domains_site ON domains(site_id);

  CREATE TABLE releases (
    id         TEXT PRIMARY KEY,
    site_id    INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    pages      INTEGER NOT NULL DEFAULT 0,
    files      INTEGER NOT NULL DEFAULT 0,
    bytes      INTEGER NOT NULL DEFAULT 0,
    checks     TEXT NOT NULL DEFAULT '{}',
    author     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX releases_site ON releases(site_id, created_at);

  CREATE TABLE leads (
    id         INTEGER PRIMARY KEY,
    site_id    INTEGER REFERENCES sites(id) ON DELETE SET NULL,
    name       TEXT NOT NULL DEFAULT '',
    phone      TEXT NOT NULL DEFAULT '',
    email      TEXT NOT NULL DEFAULT '',
    city       TEXT NOT NULL DEFAULT '',
    service    TEXT NOT NULL DEFAULT '',
    timeline   TEXT NOT NULL DEFAULT '',
    message    TEXT NOT NULL DEFAULT '',
    page       TEXT NOT NULL DEFAULT '',
    status     TEXT NOT NULL DEFAULT 'new',
    notes      TEXT NOT NULL DEFAULT '',
    extra      TEXT NOT NULL DEFAULT '{}',
    dedupe_key TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX leads_site ON leads(site_id, id);
  CREATE INDEX leads_dedupe ON leads(site_id, dedupe_key, created_at);

  CREATE TABLE photos (
    id          TEXT PRIMARY KEY,
    site_id     INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    category    TEXT NOT NULL DEFAULT 'General',
    name        TEXT NOT NULL DEFAULT '',
    width       INTEGER NOT NULL DEFAULT 0,
    height      INTEGER NOT NULL DEFAULT 0,
    bytes       INTEGER NOT NULL DEFAULT 0,
    is_hero     INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    uploaded_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX photos_site ON photos(site_id, sort_order);

  CREATE TABLE reviews (
    id          INTEGER PRIMARY KEY,
    site_id     INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    city        TEXT NOT NULL DEFAULT '',
    rating      INTEGER NOT NULL DEFAULT 5,
    text        TEXT NOT NULL,
    email       TEXT NOT NULL DEFAULT '',
    source      TEXT NOT NULL DEFAULT 'review link',
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  TEXT NOT NULL DEFAULT ${NOW},
    decided_at  TEXT
  );
  CREATE INDEX reviews_site ON reviews(site_id, status);

  CREATE TABLE demos (
    id            INTEGER PRIMARY KEY,
    contractor_id INTEGER REFERENCES contractors(id) ON DELETE SET NULL,
    site_id       INTEGER REFERENCES sites(id) ON DELETE SET NULL,
    name          TEXT NOT NULL DEFAULT '',
    email         TEXT NOT NULL DEFAULT '',
    phone         TEXT NOT NULL DEFAULT '',
    business      TEXT NOT NULL DEFAULT '',
    roc           TEXT NOT NULL DEFAULT '',
    trade         TEXT NOT NULL DEFAULT '',
    city          TEXT NOT NULL DEFAULT '',
    message       TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'requested',
    detail        TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT ${NOW},
    emailed_at    TEXT
  );

  CREATE TABLE subscriptions (
    id                   TEXT PRIMARY KEY,
    site_id              INTEGER REFERENCES sites(id) ON DELETE SET NULL,
    contractor_id        INTEGER REFERENCES contractors(id) ON DELETE SET NULL,
    customer_id          TEXT NOT NULL DEFAULT '',
    tier                 TEXT NOT NULL DEFAULT '',
    status               TEXT NOT NULL DEFAULT '',
    email                TEXT NOT NULL DEFAULT '',
    current_period_end   TEXT,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    created_at           TEXT NOT NULL DEFAULT ${NOW},
    updated_at           TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX subscriptions_site ON subscriptions(site_id);

  CREATE TABLE stripe_events (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT ${NOW}
  );

  CREATE TABLE token_usage (
    id            INTEGER PRIMARY KEY,
    contractor_id INTEGER REFERENCES contractors(id) ON DELETE SET NULL,
    site_id       INTEGER REFERENCES sites(id) ON DELETE SET NULL,
    model         TEXT NOT NULL,
    purpose       TEXT NOT NULL DEFAULT '',
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_micros   INTEGER NOT NULL DEFAULT 0,
    request_id    TEXT UNIQUE,
    created_at    TEXT NOT NULL DEFAULT ${NOW}
  );

  CREATE TABLE throttle (
    key      TEXT PRIMARY KEY,
    count    INTEGER NOT NULL DEFAULT 0,
    first_at INTEGER NOT NULL
  );
  `,
  // Portal sign-in by one-time emailed link instead of a 6-digit PIN.
  // portal_epoch is in every portal session token: changing it signs them all out.
  `
  CREATE TABLE portal_links (
    token_hash TEXT PRIMARY KEY,
    site_id    INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    sent_to    TEXT NOT NULL DEFAULT '',
    expires_at TEXT NOT NULL,
    used_at    TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX portal_links_site ON portal_links(site_id);
  ALTER TABLE sites ADD COLUMN portal_epoch TEXT NOT NULL DEFAULT '';
  `,
];

let _db = null;

class DB {
  constructor(file) {
    this.raw = new DatabaseSync(file);
    this.raw.exec("PRAGMA journal_mode = WAL");
    this.raw.exec("PRAGMA foreign_keys = ON");
    this.raw.exec("PRAGMA busy_timeout = 5000");
    this.migrate();
  }
  migrate() {
    const v = this.raw.prepare("PRAGMA user_version").get().user_version;
    for (let i = v; i < MIGRATIONS.length; i++) {
      this.tx(() => {
        this.raw.exec(MIGRATIONS[i]);
        this.raw.exec(`PRAGMA user_version = ${i + 1}`);
      });
    }
  }
  get(sql, params = []) { return this.raw.prepare(sql).get(...params) || null; }
  all(sql, params = []) { return this.raw.prepare(sql).all(...params); }
  run(sql, params = []) {
    const r = this.raw.prepare(sql).run(...params);
    return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
  }
  /** Nested calls join the outer transaction. */
  tx(fn) {
    if (this._inTx) return fn();
    this._inTx = true;
    this.raw.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      this.raw.exec("COMMIT");
      return out;
    } catch (err) {
      this.raw.exec("ROLLBACK");
      throw err;
    } finally {
      this._inTx = false;
    }
  }
  close() { this.raw.close(); }
}

export function openDb(file = config.dbPath) {
  if (_db) return _db;
  if (file !== ":memory:") ensureDirs();
  _db = new DB(file);
  return _db;
}

/** Tests open a fresh database per suite. */
export function resetDb(file = ":memory:") {
  if (_db) { try { _db.close(); } catch { /* already closed */ } }
  _db = null;
  return openDb(file);
}

export const db = () => openDb();
export const nowIso = () => new Date().toISOString();

export function getSetting(key, fallback = null) {
  const row = db().get("SELECT value FROM settings WHERE key = ?", [key]);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db().run(`INSERT INTO settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [key, String(value)]);
}

/** Sliding-window counter. True when the caller is over the limit. */
export function overLimit(key, max, windowMs) {
  const d = db();
  const now = Date.now();
  const row = d.get("SELECT count, first_at FROM throttle WHERE key = ?", [key]);
  if (!row || now - row.first_at > windowMs) {
    d.run(`INSERT INTO throttle (key, count, first_at) VALUES (?, 1, ?)
           ON CONFLICT(key) DO UPDATE SET count = 1, first_at = excluded.first_at`, [key, now]);
    return false;
  }
  d.run("UPDATE throttle SET count = count + 1 WHERE key = ?", [key]);
  return row.count + 1 > max;
}

export function parseJson(s, fallback = {}) {
  try { return JSON.parse(s); } catch { return fallback; }
}
