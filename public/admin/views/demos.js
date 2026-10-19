import { h, mount, table, pill, fmtTime } from "../lib.js";

export async function render(el, _p, { api, go }) {
  const { demos } = await api("/demos");
  mount(el,
    h("div.head", null, h("h1", null, "Free demos")),
    h("p.muted", null, "Requests from the sales site's \"Build my free demo site\" form. Active licences are built and emailed automatically; anything else lands here as needs review."),
    table([
      { label: "Requested by", render: (r) => h("div", null, h("strong", null, r.name), h("div.small.muted", null, `${r.email} · ${r.phone || "no phone"}`)) },
      { label: "Business / ROC", render: (r) => [r.business, r.roc && `ROC ${r.roc}`].filter(Boolean).join(" · ") || "—" },
      { label: "Status", render: (r) => pill(r.status) },
      { label: "Detail", render: (r) => h("span.small", null, r.detail) },
      { label: "When", render: (r) => fmtTime(r.created_at) },
    ], demos, { onRow: (r) => r.contractor_id && go(`#/contractors/${r.contractor_id}`), empty: "No demo requests yet." }));
}
