#!/usr/bin/env node
/**
 * cli.mjs — run on the VPS for the things you would rather not click.
 *
 *   node cli.mjs user add <email> <password>         add an admin
 *   node cli.mjs user password <email> <password>    reset a password
 *   node cli.mjs sites                               list sites
 *   node cli.mjs link <slug>                         portal sign-in link to hand over (once, 3 days)
 *   node cli.mjs signout <slug>                      sign the portal out everywhere
 *   node cli.mjs publish <slug|--all>                rebuild and publish
 *   node cli.mjs import <file|dir> [--status draft|demo|active] [--publish]
 *   node cli.mjs roc <number|name>                   look up the ROC active list
 *   node cli.mjs backup                              snapshot the database
 *   node cli.mjs mail <to>                           send a test email
 *   node cli.mjs sweep                               expire overdue demos now
 */
import { openDb, db } from "./src/db.mjs";
import { ensureDirs } from "./src/config.mjs";
import { createUser, setPassword, createPortalLink, signOutPortal, LINK_TTL } from "./src/auth.mjs";
import { listSites, getSiteBySlug, publishSite, siteUrls } from "./src/sites.mjs";
import { importPath } from "./src/importer.mjs";
import { getLicense, searchLicenses } from "./src/roc.mjs";
import { backup, sweep } from "./src/system.mjs";
import { sendMail } from "./src/mail.mjs";

const [cmd, ...args] = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, d) => { const i = args.indexOf(`--${name}`); return i > -1 ? args[i + 1] : d; };
const die = (msg) => { console.error(msg); process.exit(1); };

ensureDirs();
openDb();

const commands = {
  user() {
    const [sub, email, password] = args;
    if (sub === "add") return console.log(`added ${createUser({ email, password }).email}`);
    if (sub === "password") { setPassword(email, password); return console.log("password changed; sessions signed out"); }
    die("usage: user add|password <email> <password>");
  },
  sites() {
    for (const s of listSites()) {
      console.log(`${s.slug.padEnd(36)} ${s.status.padEnd(9)} ${s.tier.padEnd(8)} ${s.current_release ? siteUrls(s).primary : "(not published)"}`);
    }
  },
  link() {
    const site = getSiteBySlug(args[0]) || die("usage: link <slug>");
    const { url, expires } = createPortalLink(site.id, { ttlMs: LINK_TTL.invite });
    console.log(`${url}\n(works once, until ${expires})`);
  },
  signout() {
    const site = getSiteBySlug(args[0]) || die("usage: signout <slug>");
    signOutPortal(site.id);
    console.log(`${site.slug}: every portal session signed out, unused sign-in links cancelled`);
  },
  publish() {
    const targets = flag("all") ? listSites().filter((s) => s.current_release || s.status !== "draft") : [getSiteBySlug(args[0]) || die("no such site")];
    for (const s of targets) {
      try {
        const r = publishSite(s.id, { force: flag("force"), author: "cli" });
        console.log(`ok   ${s.slug}  ${r.manifest.pageCount} pages  ${r.urls.primary}`);
      } catch (err) {
        console.log(`FAIL ${s.slug}  ${err.message}`);
        for (const i of err.extra?.checks?.issues?.filter((x) => x.level === "fail") || []) console.log(`       ${i.rule}: ${i.message}`);
      }
    }
  },
  import() {
    if (!args[0]) die("usage: import <file|dir> [--status draft|demo|active] [--publish]");
    const status = opt("status", "draft");
    for (const line of importPath(args[0], { status, publish: flag("publish") })) console.log(line);
  },
  roc() {
    const q = args.join(" ");
    const rows = getLicense(q) ? [getLicense(q)] : searchLicenses(q, 20);
    if (!rows.length) return console.log("not on the active licence list");
    for (const r of rows) console.log(`${r.roc_number}  ${r.license_class.padEnd(6)} ${(r.dba || r.business_name).padEnd(44)} ${r.city}  exp ${r.expiration_date}`);
  },
  backup() { const b = backup(); console.log(`${b.file} (${Math.round(b.bytes / 1024)} KB)`); },
  async mail() { await sendMail({ to: args[0] || die("usage: mail <to>"), subject: "AZ Contractor Pro test", text: "Outbound mail works." }); console.log("sent"); },
  sweep() { console.log(sweep()); },
  stats() {
    for (const t of ["contractors", "sites", "leads", "photos", "reviews", "demos", "subscriptions"]) {
      console.log(`${t.padEnd(14)} ${db().get(`SELECT COUNT(*) AS n FROM ${t}`).n}`);
    }
  },
};

const run = commands[cmd];
if (!run) {
  console.log("commands: user, sites, link, signout, publish, import, roc, backup, mail, sweep, stats");
  process.exit(cmd ? 1 : 0);
}
await run();
