import { h, mount, makeApi, fail, busy } from "./lib.js";

const api = makeApi({
  base: "/api/admin",
  headers: () => ({ "x-acp-csrf": "1" }),
  onAuthFail: () => { if (state.user) { state.user = null; render(); } },
});

const state = { user: null, meta: null };
const root = document.getElementById("app");

const NAV = [
  ["#/", "Dashboard", "dashboard"],
  ["#/contractors", "Contractors", "contractors"],
  ["#/sites", "Websites", "sites"],
  ["#/leads", "Leads", "leads"],
  ["#/demos", "Free demos", "demos"],
  ["#/billing", "Billing", "billing"],
  ["#/settings", "Settings", "settings"],
];

const ROUTES = [
  [/^#\/?$/, "dashboard"],
  [/^#\/contractors\/?$/, "contractors"],
  [/^#\/contractors\/(\d+)$/, "contractor"],
  [/^#\/sites\/?$/, "sites"],
  [/^#\/sites\/(\d+)$/, "site"],
  [/^#\/leads\/?$/, "leads"],
  [/^#\/demos\/?$/, "demos"],
  [/^#\/billing\/?$/, "billing"],
  [/^#\/settings\/?$/, "settings"],
];

export const go = (hash) => { location.hash = hash; };

function loginView() {
  const email = h("input", { type: "email", autocomplete: "username", required: true });
  const password = h("input", { type: "password", autocomplete: "current-password", required: true });
  const btn = h("button.btn.primary", { type: "submit", style: "width:100%;margin-top:6px" }, "Sign in");
  const form = h("form", {
    onsubmit: (e) => {
      e.preventDefault();
      busy(btn, async () => {
        const r = await api("/login", { method: "POST", body: { email: email.value, password: password.value } });
        state.user = r.user;
        await boot();
      });
    },
  },
  h("h1", null, "AZ Contractor Pro"),
  h("p.muted", null, "Website creator, hosting and CRM."),
  h("div.field", null, h("label", { for: "le" }, "Email"), Object.assign(email, { id: "le" })),
  h("div.field", null, h("label", { for: "lp" }, "Password"), Object.assign(password, { id: "lp" })),
  btn);
  mount(root, h("div.login", null, form));
  email.focus();
}

let side;
function shell() {
  side = h("nav.side", { "aria-label": "Main" },
    h("div.brand", null, "AZ Contractor Pro", h("small", null, "Admin")),
    NAV.map(([href, label, key]) => h("a", { href, "data-key": key }, label)),
    h("div.bottom", null,
      h("div", null, state.user.email),
      h("button", { type: "button", onclick: async () => { await api("/logout", { method: "POST" }).catch(() => {}); state.user = null; render(); } }, "Sign out")));
  const main = h("main", { id: "main", tabindex: -1 });
  const top = h("div.topbar", null,
    h("button", { type: "button", "aria-label": "Menu", onclick: () => side.classList.toggle("open") }, "☰"),
    h("strong", null, "AZ Contractor Pro"));
  mount(root, top, h("div.shell", null, side, main));
  side.addEventListener("click", (e) => { if (e.target.tagName === "A") side.classList.remove("open"); });
  return main;
}

let mainEl;
async function render() {
  if (!state.user) return loginView();
  if (!mainEl || !mainEl.isConnected) mainEl = shell();
  const [hash, qs = ""] = (location.hash || "#/").split("?");
  let view = "dashboard";
  let params = [];
  for (const [re, name] of ROUTES) {
    const m = re.exec(hash);
    if (m) { view = name; params = m.slice(1); break; }
  }
  const navKey = { contractor: "contractors", site: "sites" }[view] || view;
  for (const a of side.querySelectorAll("a")) {
    if (a.dataset.key === navKey) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  mount(mainEl, h("p.muted", null, "Loading…"));
  try {
    const mod = await import(`./views/${view}.js`);
    await mod.render(mainEl, params, { api, go, meta: state.meta, user: state.user, query: new URLSearchParams(qs) });
  } catch (err) {
    if (err.status === 401) return;
    mount(mainEl, h("div.notice.err", null, err.message || String(err)));
    fail(err);
  }
  mainEl.focus({ preventScroll: true });
}

async function boot() {
  try {
    const me = await api("/me");
    state.user = me.user;
    state.meta = await api("/meta");
  } catch {
    state.user = null;
  }
  render();
}

window.addEventListener("hashchange", render);
boot();
