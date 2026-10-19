/**
 * config.mjs — the one place that reads the environment and config/platform.json.
 *
 * Secrets come from the environment (or .env, loaded here without a
 * dependency). Non-secret settings — pricing, tier presets, brand — come from
 * config/platform.json so the admin, the demo emails and the billing code all
 * read the same values.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..");

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
if (!process.env.ACP_NO_DOTENV) loadDotEnv(process.env.ACP_ENV_FILE || path.join(ROOT, ".env"));

const env = (k, d = "") => (process.env[k] === undefined || process.env[k] === "" ? d : process.env[k]);
const flag = (k, d = false) => {
  const v = env(k, "");
  return v === "" ? d : /^(1|true|yes|on)$/i.test(v);
};
const list = (k) => env(k, "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

function readPlatform() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, "config", "platform.json"), "utf8"));
  } catch {
    return {};
  }
}

/**
 * Built as a function so tests can point a fresh config at a temp directory
 * and then call configure() — every module reads `config` at call time.
 */
function build() {
  const appUrl = env("APP_URL", `http://localhost:${env("PORT", "8787")}`).replace(/\/+$/, "");
  const dataDir = path.resolve(env("DATA_DIR", path.join(ROOT, ".data")));
  const platform = readPlatform();
  return {
    port: Number(env("PORT", "8787")),
    host: env("HOST", "127.0.0.1"),
    trustProxy: flag("TRUST_PROXY", true),

    appUrl,
    appHost: new URL(appUrl).host.toLowerCase(),
    secure: appUrl.startsWith("https://"),
    salesHosts: list("SALES_HOSTS"),
    sitesDomain: env("SITES_DOMAIN").toLowerCase().replace(/^\*\./, ""),
    publicIp: env("PUBLIC_IP"),

    dataDir,
    dbPath: path.join(dataDir, "acp.sqlite"),
    sitesDir: path.join(dataDir, "sites"),
    mediaDir: path.join(dataDir, "media"),
    backupDir: path.join(dataDir, "backups"),
    publicDir: path.join(ROOT, "public"),
    rocIndexPath: env("ROC_INDEX", path.join(ROOT, "data", "roc-index.json.gz")),

    adminEmail: env("ADMIN_EMAIL"),
    adminPassword: env("ADMIN_PASSWORD"),
    sessionSecret: env("SESSION_SECRET"),
    apiKey: env("API_KEY"),

    smtp: {
      host: env("SMTP_HOST"),
      port: Number(env("SMTP_PORT", "587")),
      secure: flag("SMTP_SECURE", false),
      user: env("SMTP_USER"),
      pass: env("SMTP_PASS"),
    },
    mailFrom: env("MAIL_FROM", "AZ Contractor Pro <no-reply@localhost>"),
    mailTransport: env("MAIL_TRANSPORT", env("SMTP_HOST") ? "smtp" : "log"),

    stripeKey: env("STRIPE_SECRET_KEY"),
    stripeWebhookSecret: env("STRIPE_WEBHOOK_SECRET"),
    monthlyDelayDays: Math.max(0, Math.min(90, Number(env("MONTHLY_START_DELAY_DAYS", "14")) || 0)),
    stripePortalUrl: env("STRIPE_PORTAL_URL"),

    anthropicKey: env("ANTHROPIC_API_KEY"),
    aiModel: env("AI_MODEL", "claude-opus-5-5"),

    maxUploadBytes: Number(env("MAX_UPLOAD_MB", "25")) * 1024 * 1024,
    maxPhotosPerSite: Number(env("MAX_PHOTOS_PER_SITE", "300")),
    releasesToKeep: Math.max(1, Number(env("RELEASES_TO_KEEP", "5")) || 5),

    brand: { name: "AZ Contractor Pro", phone: "", email: "", ...(platform.brand || {}) },
    tiers: platform.tiers || {},
    demo: { tier: "pro", expire_days: 30, ...(platform.demo || {}) },
  };
}

export const config = build();

/** Re-read the environment into the shared object (tests). */
export function configure(overrides = {}) {
  Object.assign(config, build(), overrides);
  return config;
}

export function ensureDirs() {
  for (const d of [config.dataDir, config.sitesDir, config.mediaDir, config.backupDir]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

/** Problems worth printing at startup. */
export function warnings() {
  const w = [];
  if (config.mailTransport === "log") w.push("SMTP is not configured — emails are only logged");
  if (!config.stripeKey) w.push("STRIPE_SECRET_KEY is not set — Buy buttons fall back to the pricing section");
  if (config.stripeKey && !config.stripeWebhookSecret) w.push("STRIPE_WEBHOOK_SECRET is not set — payments will not activate sites");
  if (!config.sitesDomain) w.push("SITES_DOMAIN is not set — sites are reachable only on custom domains and <APP_URL>/s/<slug>/");
  if (config.appUrl.startsWith("http://localhost")) w.push("APP_URL is localhost — links in emails will not work for anyone else");
  return w;
}
