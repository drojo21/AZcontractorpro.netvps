import { h, mount, table, pill, fmtDate, money } from "../lib.js";

export async function render(el, _p, { api, go, meta }) {
  const [{ subscriptions }, usage, sys] = await Promise.all([api("/subscriptions"), api("/usage"), api("/system")]);
  mount(el,
    h("div.head", null, h("h1", null, "Billing")),
    sys.stripe ? null : h("div.notice.err", null, "Stripe is not configured: set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in .env. Buy buttons go to the pricing section until then."),
    h("p.muted", null, "Stripe Checkout charges the setup fee today and starts the monthly plan after the delay you set. Payments activate the contractor's site and move them to Paid."),
    table([
      { label: "Customer", render: (r) => h("div", null, h("strong", null, r.business_name || r.email || r.customer_id), h("div.small.muted", null, r.email)) },
      { label: "Plan", render: (r) => meta.tiers[r.tier]?.name || r.tier || "—" },
      { label: "Status", render: (r) => pill(r.status) },
      { label: "Renews", render: (r) => (r.cancel_at_period_end ? `cancels ${fmtDate(r.current_period_end)}` : fmtDate(r.current_period_end)) },
      { label: "Site", render: (r) => r.slug || "—" },
    ], subscriptions, { onRow: (r) => r.contractor_id && go(`#/contractors/${r.contractor_id}`), empty: "No subscriptions yet." }),
    h("h2", { style: "margin-top:24px" }, "AI copy spend"),
    h("p.muted", null, `${usage.total.calls} call(s), ${money(usage.total.cost_micros)} in total.`),
    table([
      { label: "Contractor", key: "business_name" },
      { label: "Calls", key: "calls" },
      { label: "Tokens in / out", render: (r) => `${r.input_tokens} / ${r.output_tokens}` },
      { label: "Cost", render: (r) => money(r.cost_micros) },
    ], usage.byContractor, { empty: "No AI calls yet." }));
}
