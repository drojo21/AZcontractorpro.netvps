/** system.mjs — health, backups and the periodic sweep. */
import fs from "node:fs";
import path from "node:path";
import { config, warnings } from "./config.mjs";
import { db, nowIso } from "./db.mjs";
import { mailMode } from "./mail.mjs";
import { imagesAvailable } from "./photos.mjs";
import { aiEnabled } from "./ai.mjs";
import { rocIndex } from "./roc.mjs";
import { expireDemos } from "./sites.mjs";

export const VERSION = "3.0.0";

export function health() {
  return {
    ok: true,
    version: VERSION,
    time: nowIso(),
    sites: db().get("SELECT COUNT(*) AS n FROM sites WHERE current_release <> ''").n,
    mail: mailMode(),
    images: imagesAvailable(),
    stripe: Boolean(config.stripeKey),
    ai: aiEnabled(),
  };
}

export function systemInfo() {
  const roc = rocIndex();
  let diskBytes = 0;
  const linked = new Set();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      const st = fs.statSync(p);
      // Release photos are hard links to the media files: count each file once.
      if (st.nlink > 1) {
        const key = `${st.dev}:${st.ino}`;
        if (linked.has(key)) continue;
        linked.add(key);
      }
      diskBytes += st.size;
    }
  };
  try { walk(config.dataDir); } catch { /* missing dir */ }
  return {
    ...health(),
    node: process.version,
    appUrl: config.appUrl,
    sitesDomain: config.sitesDomain,
    salesHosts: config.salesHosts,
    publicIp: config.publicIp,
    dataDir: config.dataDir,
    diskBytes,
    roc: { available: roc.available, snapshot: roc.snapshotDate, licences: roc.records.size },
    warnings: warnings(),
    backups: listBackups(),
  };
}

/** A consistent copy of the database (VACUUM INTO is safe while the server runs). */
export function backup() {
  fs.mkdirSync(config.backupDir, { recursive: true });
  const file = path.join(config.backupDir, `acp-${nowIso().replace(/[:.]/g, "-")}.sqlite`);
  db().raw.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  // Keep the last 14.
  const old = listBackups().slice(14);
  for (const b of old) fs.rmSync(path.join(config.backupDir, b.name), { force: true });
  return { file, bytes: fs.statSync(file).size };
}

export function listBackups() {
  try {
    return fs.readdirSync(config.backupDir).filter((f) => f.endsWith(".sqlite")).sort().reverse()
      .map((name) => ({ name, bytes: fs.statSync(path.join(config.backupDir, name)).size }));
  } catch { return []; }
}

/** Hourly: expire overdue demos, clear old throttle rows. */
export function sweep() {
  const expired = expireDemos();
  db().run("DELETE FROM throttle WHERE first_at < ?", [Date.now() - 24 * 3600 * 1000]);
  db().run("DELETE FROM sessions WHERE expires_at < ?", [nowIso()]);
  return { expired };
}
