import { h, mount, table, field, busy, toast, fmtDate, kb, confirmDialog, fail } from "../lib.js";

export async function render(el, _p, ctx) {
  const { api, user } = ctx;
  const [sys, { users }] = await Promise.all([api("/system"), api("/users")]);

  const email = h("input", { type: "email" });
  const pw = h("input", { type: "password", autocomplete: "new-password" });
  const addBtn = h("button.btn", { type: "button", onclick: () => busy(addBtn, async () => { await api("/users", { method: "POST", body: { email: email.value, password: pw.value } }); toast("Added"); render(el, _p, ctx); }) }, "Add person");

  const cur = h("input", { type: "password", autocomplete: "current-password" });
  const next = h("input", { type: "password", autocomplete: "new-password" });
  const pwBtn = h("button.btn", { type: "button", onclick: () => busy(pwBtn, async () => { await api("/password", { method: "POST", body: { current: cur.value, password: next.value } }); toast("Password changed"); cur.value = next.value = ""; }) }, "Change password");

  const to = h("input", { type: "email", value: user.email });
  const mailBtn = h("button.btn", { type: "button", onclick: () => busy(mailBtn, async () => { await api("/mail-test", { method: "POST", body: { to: to.value } }); toast(`Sent (${sys.mail})`); }) }, "Send test email");
  const bkBtn = h("button.btn", { type: "button", onclick: () => busy(bkBtn, async () => { const r = await api("/backup", { method: "POST" }); toast(`Backup written: ${kb(r.bytes)}`); render(el, _p, ctx); }) }, "Back up the database now");

  const row = (k, v) => h("tr", null, h("th", null, k), h("td", null, v));
  mount(el,
    h("div.head", null, h("h1", null, "Settings")),
    sys.warnings.length ? h("div.notice.err", null, h("strong", null, "Needs attention"), h("ul", null, sys.warnings.map((w) => h("li", null, w)))) : null,
    h("div.grid", null,
      h("div.card", null, h("h2", null, "Server"),
        h("table", null, h("tbody", null,
          row("Version", `${sys.version} on Node ${sys.node}`), row("Admin address", sys.appUrl),
          row("Site addresses", sys.sitesDomain ? `*.${sys.sitesDomain}` : "custom domains only"),
          row("Sales site", sys.salesHosts.join(", ") || `${sys.appUrl}/sales/`),
          row("Public IP", sys.publicIp || "not set (PUBLIC_IP)"),
          row("Email", sys.mail), row("Photo processing", sys.images ? "on" : "off (sharp missing)"),
          row("Stripe", sys.stripe ? "on" : "off"), row("AI copy", sys.ai ? "on" : "off"),
          row("ROC licence list", sys.roc.available ? `${sys.roc.licences.toLocaleString()} active, snapshot ${sys.roc.snapshot}` : "missing"),
          row("Data", `${sys.dataDir} · ${kb(sys.diskBytes)}`)))),
      h("div.card", null, h("h2", null, "Backups"),
        h("p.small.muted", null, "deploy/backup.sh runs nightly from cron and copies the database and photos. This button writes a database snapshot now."),
        bkBtn,
        h("ul.timeline", { style: "margin-top:10px" }, sys.backups.slice(0, 6).map((b) => h("li.mono", null, `${b.name} · ${kb(b.bytes)}`))))),
    h("div.grid", null,
      h("div.card", null, h("h2", null, "Team"),
        table([
          { label: "Email", key: "email" }, { label: "Since", render: (r) => fmtDate(r.created_at) },
          { label: "", render: (r) => (r.id === user.id ? "you" : h("button.btn.small.danger", { type: "button", onclick: async () => { if (await confirmDialog("Remove?", `Remove ${r.email}?`, "Remove")) { await api(`/users/${r.id}`, { method: "DELETE" }).catch(fail); render(el, _p, ctx); } } }, "Remove")) },
        ], users),
        h("div.cols", { style: "margin-top:12px" }, field("Email", email), field("Password (10+ characters)", pw)), addBtn),
      h("div.card", null, h("h2", null, "Your password"), field("Current", cur), field("New (10+ characters)", next), pwBtn,
        h("h2", { style: "margin-top:20px" }, "Email check"), field("Send a test to", to), mailBtn)));
}
