# engine/

The site generator and checker from `drojo21/acp-backend-tucson` (`lib/`, merged
2026-10-14). Plain ES modules, no dependencies, no Node-only APIs — the design
notes in that repo's `docs/FLOW.md` and `docs/RESEARCH-AZ-CONTRACTOR-SITES.md`
still apply. `test/engine.test.mjs` is its test suite, unchanged apart from paths.

Four changes for hosting on the VPS:

| File | Change | Why |
|---|---|---|
| `layout.mjs` | The lead form reads the response when it posts to its own host, and shows an error with the phone number on failure | A same-origin endpoint can report failure; a cross-origin one (Apps Script) still uses `no-cors` as before |
| `components.mjs` | Gallery uses `thumb` when present; review section links to `integrations.reviewUrl`; form carries `data-phone` and an error slot | Portal photos have a 600px thumbnail; every site has its own review page |
| `spec.mjs` | Accepts `integrations.reviewUrl` and `gallery[].thumb` | The two fields above |
| `compliance.mjs` | Links under `/_acp/` are not checked against generated files | They are served by the platform (lead and review endpoints) |

Fixes made here since, worth sending upstream:

| File | Change | Why |
|---|---|---|
| `site.mjs` | `404.html` escapes the business name, city and phone | They were the only unescaped spec text, and the free-demo form is public |
| `layout.mjs` | Footer hours are escaped | Hours typed in the admin editor reached every page as raw HTML |
| `spec.mjs` | Theme colours must be `#rgb` / `#rrggbb` (a bare `13242D` gets its `#`); anything else uses the trade colour | A value that only began like a colour went into CSS and `<meta name="theme-color">` unchanged |
| `layout.mjs` | Hero photo: `.hero.has-media>:not(.hero-img)` instead of `>*` | `>*` out-ranked `.hero-img`, so on every site with a photo the image lost `position:absolute` and rendered as a full-width block above the hero instead of behind it |
| `layout.mjs` | Pills: `.pills>li>a, .pills>li>span` | `.pills span` also matched the label span inside each pill, drawing a pill inside a pill |
| `layout.mjs` | Quote box: `.quote-direct div>span` | `.quote-direct span{display:block}` also matched `.quote-direct-ico` and knocked the phone icon off-centre |
| `layout.mjs` | `.hero-pill` is `display:flex;width:fit-content` | It sat beside the eyebrow whenever the eyebrow was short enough to fit on the same line |
