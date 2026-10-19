/** A small path router: "/sites/:id/photos/:pid" → ctx.params. */
export class Router {
  constructor(prefix = "") {
    this.prefix = prefix;
    this.routes = [];
  }
  on(method, pattern, handler) {
    const keys = [];
    const re = new RegExp("^" + (this.prefix + pattern).replace(/\/$/, "")
      .replace(/:(\w+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "/?$");
    this.routes.push({ method, re, keys, handler });
    return this;
  }
  get(p, h) { return this.on("GET", p, h); }
  post(p, h) { return this.on("POST", p, h); }
  patch(p, h) { return this.on("PATCH", p, h); }
  put(p, h) { return this.on("PUT", p, h); }
  delete(p, h) { return this.on("DELETE", p, h); }

  /** Run the matching handler. Returns false when nothing matched the path. */
  async handle(ctx) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.re.exec(ctx.path);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== ctx.method && !(r.method === "GET" && ctx.method === "HEAD")) continue;
      ctx.params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      await r.handler(ctx);
      return true;
    }
    if (pathMatched) {
      ctx.json(405, { ok: false, error: "method not allowed" });
      return true;
    }
    return false;
  }
}
