import { h, mount, table, pill, fmtTime } from "../lib.js";
import { newContractor } from "./contractors.js";

export async function render(el, _p, { api, go, meta }) {
  const { sites } = await api("/sites");
  mount(el,
    h("div.head", null, h("h1", null, "Websites"),
      h("button.btn.primary", { type: "button", onclick: () => newContractor({ api, go, meta }) }, "New contractor + site")),
    h("p.muted", null, "Every site is built here and served from this server: ",
      meta.sitesDomain ? h("span.kbd", null, `<address>.${meta.sitesDomain}`) : null, " plus any custom domain."),
    table([
      { label: "Business", render: (r) => h("div", null, h("strong", null, r.business_name), h("div.small.muted.mono", null, r.slug)) },
      { label: "Status", render: (r) => pill(r.status) },
      { label: "Plan", render: (r) => meta.tiers[r.tier]?.name || r.tier },
      { label: "Checks", render: (r) => (r.checks ? (r.checks.fail ? pill("fail") : pill("ok")) : "—") },
      { label: "Leads", key: "leads" },
      { label: "Published", render: (r) => fmtTime(r.published_at) },
      { label: "Address", render: (r) => (r.current_release ? h("a", { href: r.urls.primary, target: "_blank", rel: "noopener", onclick: (e) => e.stopPropagation() }, r.urls.primary.replace(/^https?:\/\//, "").replace(/\/$/, "")) : "—") },
    ], sites, { onRow: (r) => go(`#/sites/${r.id}`), empty: "No websites yet. Add a contractor, then create their site." }));
}
