import { h, mount, table, pill, fmtTime, fmtDate } from "../lib.js";

export async function render(el, _p, { api, go }) {
  const o = await api("/overview");
  const stat = (n, label, href) => h("a.stat", { href, style: "text-decoration:none;color:inherit" }, h("b", null, n), h("span", null, label));
  mount(el,
    h("div.head", null, h("h1", null, "Dashboard"),
      h("div.row", null,
        h("a.btn.primary", { href: "#/contractors?new=1" }, "New contractor"),
        h("a.btn", { href: "#/sites" }, "All websites"))),
    h("div.stats", null,
      stat(o.sites.live, "Live sites", "#/sites"),
      stat(o.sites.demo, "Demo sites", "#/sites"),
      stat(o.leads.week, "Leads this week", "#/leads"),
      stat(o.leads.new, "Leads not yet contacted", "#/leads"),
      stat(o.subscriptions.active, "Paying customers", "#/billing"),
      stat(o.pendingReviews, "Reviews awaiting approval", "#/sites")),
    o.subscriptions.past_due ? h("div.notice.err", null, `${o.subscriptions.past_due} subscription(s) past due — see Billing.`) : null,
    h("div.card", null, h("h2", null, "Pipeline"),
      h("div.row", null, o.stages.map((s) => h("a.btn", { href: `#/contractors?stage=${s.id}` }, `${s.label}`, h("span.pill", null, s.n))))),
    h("div.grid", null,
      h("div", null, h("h2", null, "Follow-ups due"),
        table([
          { label: "Contractor", key: "business_name" },
          { label: "Stage", render: (r) => pill(r.stage) },
          { label: "Due", render: (r) => fmtDate(r.next_follow_up) },
        ], o.followUps, { onRow: (r) => go(`#/contractors/${r.id}`), empty: "No follow-ups due." })),
      h("div", null, h("h2", null, "Latest free-demo requests"),
        table([
          { label: "Business", render: (r) => r.business || `ROC ${r.roc}` || r.name },
          { label: "Status", render: (r) => pill(r.status) },
          { label: "When", render: (r) => fmtTime(r.created_at) },
        ], o.demos, { onRow: () => go("#/demos"), empty: "No demo requests yet." }))),
    h("h2", { style: "margin-top:16px" }, "Recent leads"),
    table([
      { label: "Name", key: "name" },
      { label: "For", key: "business_name" },
      { label: "Service", key: "service" },
      { label: "Phone", key: "phone" },
      { label: "Status", render: (r) => pill(r.status) },
      { label: "When", render: (r) => fmtTime(r.created_at) },
    ], o.leads.recent, { onRow: (r) => go(`#/contractors/${r.contractor_id}`), empty: "No leads yet. They arrive here from every site's quote form." }));
}
