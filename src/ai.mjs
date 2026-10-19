/**
 * ai.mjs — optional copy polish with Claude, billed to the contractor it is for.
 *
 * Ported from acp-backend-tucson/netlify/functions/copy.mjs. The engine's own
 * copy is always a complete, valid baseline; this only replaces the named
 * fields below, and the schema makes anything else (reviews in particular)
 * impossible to return. Every call is recorded in token_usage with its cost,
 * which is what the CRM's per-contractor usage view used to track.
 *
 * Off unless ANTHROPIC_API_KEY is set. AI_MODEL picks the model.
 */
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.mjs";
import { db } from "./db.mjs";
import { HttpError } from "./http.mjs";
import { normalize } from "../engine/spec.mjs";
import { homeCopy } from "../engine/copy.mjs";
import { addActivity } from "./contractors.mjs";

/** USD per million tokens, which is also micro-dollars per token. */
export const PRICES = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
};

/** Only these fields can come back; each is a plain string. */
export const COPY_FIELDS = {
  tagline: "Under 8 words, no trailing period.",
  heroLine: "One sentence under 28 words.",
  about: "Two or three sentences, under 70 words.",
  servicesIntro: "One sentence under 30 words.",
  metaDesc: "Under 150 characters.",
};

const SCHEMA = {
  type: "object",
  properties: Object.fromEntries(Object.entries(COPY_FIELDS).map(([k, d]) => [k, { type: "string", description: d }])),
  required: Object.keys(COPY_FIELDS),
  additionalProperties: false,
};

// Server-side refusal fallback exists for these; Haiku has none.
const SUPPORTS_FALLBACK = /^claude-(opus-5|fable-5|sonnet-5-5)/;

let _client = null;
/** Tests pass a fake with beta.messages.create. */
export function useAnthropicClient(c) { _client = c; }
const client = () => (_client ??= new Anthropic({ apiKey: config.anthropicKey }));

export const aiEnabled = () => Boolean(config.anthropicKey || _client);

export function costMicros(model, usage = {}) {
  const p = PRICES[model];
  if (!p) return 0;
  return Math.round(
    (usage.input_tokens || 0) * p.input +
    (usage.output_tokens || 0) * p.output +
    (usage.cache_read_input_tokens || 0) * p.cacheRead +
    (usage.cache_creation_input_tokens || 0) * p.cacheWrite,
  );
}

function brief(spec) {
  return [
    `${spec.business.name}, a ${spec.business.tradeLabel.toLowerCase()} contractor in ${spec.serviceArea.home}, Arizona.`,
    spec.business.owner ? `Owner: ${spec.business.owner}.` : "",
    spec.license.rocNumber ? `Arizona ROC #${spec.license.rocNumber}${spec.license.class ? ` (${spec.license.class})` : ""}.` : "",
    spec.business.yearsInBusiness ? `${spec.business.yearsInBusiness} years in business.` : "",
    `Serves ${spec.serviceArea.cities.join(", ")}. Customers: ${spec.business.targetCustomer}.`,
    `Services: ${spec.services.map((s) => s.name).join(", ")}.`,
    spec.contact.emergencyService ? "Offers emergency service." : "",
    spec.offers.paymentPlans ? "Offers payment plans." : "",
    spec.business.tagline ? `The owner's own tagline, keep its spirit: "${spec.business.tagline}".` : "",
  ].filter(Boolean).join("\n");
}

/**
 * Ask Claude for better copy for one site. Returns { copy, model, usage, costMicros }
 * and records the usage. Does not change the site; the caller decides.
 */
export async function suggestCopy(site, { notes = "" } = {}) {
  if (!aiEnabled()) throw new HttpError(503, "AI copy is off: set ANTHROPIC_API_KEY in .env");
  const { spec } = normalize(site.spec || {});
  const baseline = homeCopy(spec);
  const prompt = `You rewrite website copy for licensed Arizona trade contractors.

Voice: plain and confident, the way the contractor actually talks. No marketing
filler, no em dashes, no "nestled", "unparalleled", "premier" or "state of the
art". Short sentences. Specific over impressive. US spelling.

THE BUSINESS
${brief(spec)}
${notes ? `\nNOTES FROM THE CONTRACTOR\n${String(notes).slice(0, 1500)}\n` : ""}
THE CURRENT COPY, which is already serviceable. Improve what you can make more
specific or more natural, and keep what is already good:
${JSON.stringify({
    tagline: baseline.tagline, heroLine: baseline.heroLine, about: baseline.about,
    servicesIntro: baseline.servicesIntro, metaDesc: baseline.metaDesc,
  }, null, 2)}

Rules you must not break:
- Never invent a customer, a review, a quote, a rating, an award, a
  certification, a project count or a year that is not in the brief above.
- Never state or imply a licence number other than the one given.
- Keep every factual claim traceable to the brief.`;

  const model = config.aiModel;
  const request = {
    model,
    max_tokens: 4000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: prompt }],
  };
  if (SUPPORTS_FALLBACK.test(model)) {
    request.betas = ["server-side-fallback-2026-07-01"];
    request.fallbacks = "default";
  }

  let res;
  try {
    res = await client().beta.messages.create(request);
  } catch (err) {
    throw new HttpError(502, `Claude: ${err.status ? `${err.status} ` : ""}${err.message || "request failed"}`);
  }
  // The model that actually answered (a fallback may have) sets the price.
  const served = res.model || model;
  const cost = costMicros(served, res.usage);
  try {
    db().run(`INSERT INTO token_usage (contractor_id, site_id, model, purpose, input_tokens, output_tokens, cost_micros, request_id)
              VALUES (?, ?, ?, 'site copy', ?, ?, ?, ?)`,
      [site.contractor_id, site.id, served, res.usage?.input_tokens || 0, res.usage?.output_tokens || 0, cost, res.id || null]);
  } catch (err) {
    if (!String(err.message).includes("UNIQUE")) throw err;
  }

  if (res.stop_reason === "refusal") throw new HttpError(422, "Claude declined to rewrite this copy. The site keeps its own copy.");
  if (res.stop_reason === "max_tokens") throw new HttpError(502, "Claude's answer was cut off. Try again.");
  const text = (res.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new HttpError(502, "Claude did not return usable JSON."); }
  const copy = {};
  for (const k of Object.keys(COPY_FIELDS)) {
    if (typeof parsed?.[k] === "string" && parsed[k].trim()) copy[k] = parsed[k].trim();
  }
  addActivity(site.contractor_id, "ai", `AI copy suggested for ${site.slug} (${served}, $${(cost / 1e6).toFixed(4)})`, "ai");
  return { copy, baseline, model: served, usage: res.usage, costMicros: cost };
}

export function usageSummary() {
  return {
    byContractor: db().all(`SELECT c.id, c.business_name, COUNT(u.id) AS calls,
                              SUM(u.input_tokens) AS input_tokens, SUM(u.output_tokens) AS output_tokens,
                              SUM(u.cost_micros) AS cost_micros
                            FROM token_usage u JOIN contractors c ON c.id = u.contractor_id
                            GROUP BY c.id ORDER BY cost_micros DESC`),
    total: db().get("SELECT COUNT(*) AS calls, COALESCE(SUM(cost_micros), 0) AS cost_micros FROM token_usage"),
  };
}
