/**
 * The shared shell: one stylesheet, one head, one header, one footer.
 *
 * Generated sites are multi-page now, so the CSS and JS are real files under
 * /assets instead of being inlined into every page. That is the point of
 * moving off the single-file output: a visitor loading a service page and then
 * a city page pays for the stylesheet once.
 */

import { esc, jsonScript, telHref, prose } from "./html.mjs";
import { cssVars, fontHref } from "./theme.mjs";

/* ============================================================
   STYLESHEET
   ============================================================ */

export function stylesheet(tk) {
  return `${cssVars(tk)}

@media (prefers-reduced-motion:no-preference){
  @view-transition{navigation:auto}
}

*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:92px;-webkit-text-size-adjust:100%}
body{
  margin:0;background:var(--surface);color:var(--ink);
  font-family:var(--body);font-size:17px;line-height:1.62;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
  overflow-x:hidden;
}
img{max-width:100%;display:block;height:auto}
a{color:var(--brand);transition:color .15s ease}
p{margin:0 0 var(--space-4)}
p:last-child{margin-bottom:0}
hr{border:0;border-top:1px solid var(--hairline);margin:var(--space-12) 0}

.ico{width:1.15em;height:1.15em;flex-shrink:0;vertical-align:middle}

h1,h2,h3,h4{font-family:var(--display);margin:0 0 var(--space-4);color:var(--ink);text-wrap:balance;letter-spacing:-.018em}
h1{font-size:clamp(34px,5vw,54px);line-height:1.05;font-weight:800}
h2{font-size:clamp(26px,3.4vw,38px);line-height:1.12;font-weight:700}
h3{font-size:clamp(19px,1.9vw,22px);line-height:1.25;font-weight:700}
h4{font-size:17px;line-height:1.3;font-weight:700}

/* focus is never removed, only made legible on both themes */
:focus-visible{outline:3px solid var(--focus);outline-offset:2px;border-radius:3px}
.skip{position:absolute;left:-9999px;top:0;background:var(--brand);color:var(--on-brand);padding:var(--space-3) var(--space-4);z-index:200;border-radius:var(--radius-sm);font-weight:700}
.skip:focus{left:var(--space-4);top:var(--space-4)}

.wrap{max-width:var(--max);margin:0 auto;padding:0 var(--space-6)}
section{padding:var(--space-20) 0;position:relative}
@media (max-width:700px){section{padding:var(--space-12) 0}}
.alt{background:var(--surface-raised);border-top:1px solid var(--hairline);border-bottom:1px solid var(--hairline)}
.sunk{background:var(--surface-sunk)}
.band{
  background:
    radial-gradient(circle at 88% 12%,rgba(255,255,255,.055) 0%,transparent 48%),
    linear-gradient(180deg,var(--night) 0%,#0E1C24 100%);
  color:var(--on-night);
}
.band h1,.band h2,.band h3{color:var(--on-night)}
.band a{color:var(--on-night)}
.eyebrow{
  display:inline-flex;align-items:center;gap:var(--space-2);
  font-size:12.5px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;
  color:var(--brand);margin:0 0 var(--space-3);
}
.eyebrow::before{content:"";width:18px;height:2px;background:var(--accent);border-radius:2px;display:inline-block}
.band .eyebrow{color:var(--on-night-muted)}
.lede{font-size:clamp(18px,2vw,21px);line-height:1.55;color:var(--ink-muted);max-width:62ch}
.band .lede{color:var(--on-night-muted)}
.muted{color:var(--ink-muted)}
.tnum{font-variant-numeric:tabular-nums}
.center{text-align:center}
.narrow{max-width:72ch}

/* ---------- buttons ---------- */
.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:var(--space-2);
  font-family:var(--display);font-weight:700;font-size:16px;line-height:1;
  padding:16px 24px;border-radius:var(--radius-md);text-decoration:none;
  border:2px solid transparent;cursor:pointer;min-height:52px;
  box-shadow:var(--shadow-sm);
  transition:transform .18s var(--ease-out),box-shadow .18s var(--ease-out),background-color .15s ease,border-color .15s ease;
}
.btn .ico{transition:transform .18s var(--ease-out)}
.btn:hover{transform:translateY(-2px);box-shadow:var(--shadow-md)}
.btn:hover .ico{transform:translateX(2px)}
.btn:active{transform:translateY(0)}
.btn-primary{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
.btn-secondary{background:var(--brand);color:var(--on-brand);border-color:var(--brand)}
.btn-outline{background:transparent;color:var(--brand);border-color:var(--border-strong);box-shadow:none}
.btn-outline:hover{border-color:var(--brand);background:var(--brand-soft)}
.band .btn-outline{color:var(--on-night);border-color:var(--night-hairline)}
.band .btn-outline:hover{border-color:var(--on-night);background:rgba(255,255,255,.06)}
/* On the hero the ground IS --brand, so the outline button needs the inverse. */
.hero .btn-outline{color:var(--on-brand);border-color:rgba(255,255,255,.55);background:rgba(255,255,255,.06)}
.hero .btn-outline:hover{border-color:var(--on-brand);background:rgba(255,255,255,.15)}
.hero.has-media .btn-outline{color:var(--on-night);border-color:rgba(238,230,217,.55)}
.btn-row{display:flex;flex-wrap:wrap;gap:var(--space-3);margin-top:var(--space-6)}

/* ---------- header ---------- */
.site-head{
  position:sticky;top:0;z-index:100;
  background:var(--surface);
  background:color-mix(in srgb,var(--surface) 92%,transparent);
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  border-bottom:1px solid var(--hairline);
  transition:box-shadow .2s ease;
}
.site-head.scrolled{box-shadow:var(--shadow-md)}
.head-in{display:flex;align-items:center;gap:var(--space-4);max-width:var(--max);margin:0 auto;padding:var(--space-3) var(--space-6)}
.brand{display:flex;flex-direction:column;text-decoration:none;color:var(--ink);line-height:1.15;min-width:0}
.brand b{font-family:var(--display);font-weight:800;font-size:19.5px;letter-spacing:-.02em;color:var(--brand)}
/*
  The ROC line is a compliance element, not decoration. A.R.S. 32-1124(B)(4)
  lets a contractor advertise a URL in place of the licence number only when
  the site shows the name and number prominently, and ROC substantive policy
  statement 2021.02 says it must be on the home page, clearly visible, in an
  appropriately sized font, and not in the footer. So it sits in the header on
  every page at a readable size, and is repeated in the hero.
*/
.roc-line{font-size:13.5px;color:var(--ink-muted);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nav{display:flex;gap:var(--space-6);margin-left:auto;align-items:center}
.nav a{
  font-size:15.5px;text-decoration:none;color:var(--ink);font-weight:600;white-space:nowrap;
  position:relative;padding:4px 0;
}
.nav a::after{
  content:"";position:absolute;left:0;right:0;bottom:-2px;height:2px;
  background:var(--brand);transform:scaleX(0);transform-origin:left;
  transition:transform .2s var(--ease-out);
}
.nav a:hover,.nav a[aria-current="page"]{color:var(--brand)}
.nav a:hover::after,.nav a[aria-current="page"]::after{transform:scaleX(1)}
.head-cta{display:flex;align-items:center;gap:var(--space-2);margin-left:var(--space-2)}
.head-cta .btn{padding:11px 16px;min-height:44px;font-size:14.5px}
.nav-toggle{display:none;background:var(--surface-raised);border:1px solid var(--hairline);border-radius:var(--radius-sm);width:46px;height:46px;cursor:pointer;margin-left:auto;color:var(--ink);font-size:20px;line-height:1}

@media (max-width:980px){
  .nav{
    display:none;position:absolute;top:100%;left:0;right:0;
    flex-direction:column;align-items:stretch;gap:0;
    background:var(--surface);border-bottom:1px solid var(--hairline);
    padding:var(--space-2) var(--space-6) var(--space-6);
    box-shadow:var(--shadow-lg);
  }
  .nav.open{display:flex}
  .nav a{padding:var(--space-4) 0;border-bottom:1px solid var(--hairline);font-size:17px}
  .nav a::after{display:none}
  .nav-toggle{display:block}
  .head-cta{display:none}
}

/* ---------- hero ---------- */
.hero{
  background:
    radial-gradient(circle at 82% 18%,rgba(255,255,255,.12) 0%,transparent 45%),
    radial-gradient(circle at 12% 88%,rgba(0,0,0,.18) 0%,transparent 52%),
    var(--brand);
  color:var(--on-brand);
  padding:var(--space-16) 0 var(--space-16);
  position:relative;overflow:hidden;
}
.hero::before{
  content:"";position:absolute;inset:0;pointer-events:none;
  background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);
  background-size:44px 44px;
  mask-image:radial-gradient(ellipse at 65% 35%,#000 15%,transparent 75%);
  -webkit-mask-image:radial-gradient(ellipse at 65% 35%,#000 15%,transparent 75%);
}
.hero h1,.hero h2{color:var(--on-brand)}
.hero .eyebrow{color:var(--on-brand);opacity:.9}
.hero .lede{color:var(--on-brand);opacity:.94;margin-top:var(--space-4)}
.hero-in{max-width:var(--max);margin:0 auto;padding:0 var(--space-6);position:relative;z-index:2}
.hero-grid{display:grid;gap:var(--space-12);grid-template-columns:1.2fr .8fr;align-items:center}
@media (max-width:920px){.hero-grid{grid-template-columns:1fr;gap:var(--space-8)}}
.hero-copy{max-width:58ch}

/* Live availability status pill */
.hero-pill{
  display:inline-flex;align-items:center;gap:var(--space-2);
  padding:6px 14px;border-radius:var(--radius-pill);
  background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.22);
  font-size:13px;font-weight:600;color:var(--on-brand);
  margin-bottom:var(--space-4);
}
.hero.has-media .hero-pill{color:var(--on-night);background:rgba(19,36,45,.75)}
.status-dot{
  width:8px;height:8px;border-radius:50%;background:#4ADE80;
  box-shadow:0 0 0 3px rgba(74,222,128,.28);
  animation:pulse-dot 2.2s infinite ease-in-out;
}
@keyframes pulse-dot{
  0%,100%{transform:scale(1);opacity:1}
  50%{transform:scale(1.22);opacity:.75}
}

/* Interactive Quick Project Planner Card in Hero */
.hero-card{
  background:var(--surface);color:var(--ink);
  border-radius:var(--radius-lg);padding:var(--space-6);
  box-shadow:var(--shadow-lg);
  border:1px solid var(--hairline);
  border-top:4px solid var(--accent);
}
.hero-card-head{display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-4)}
.hero-card-ico{
  width:44px;height:44px;border-radius:var(--radius-md);
  background:var(--brand-soft);color:var(--brand);
  display:inline-flex;align-items:center;justify-content:center;
  font-size:20px;flex-shrink:0;
}
.hero-card-head strong{display:block;font-family:var(--display);font-size:18px;line-height:1.2;color:var(--ink)}
.hero-card-head span{display:block;font-size:13.5px;color:var(--ink-muted);margin-top:2px}
.hero-chips{display:flex;flex-direction:column;gap:var(--space-2)}
.hero-chip{
  display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);
  padding:11px 14px;border-radius:var(--radius-md);
  background:var(--surface-raised);border:1px solid var(--hairline);
  color:var(--ink);text-decoration:none;font-weight:600;font-size:15px;
  transition:transform .16s var(--ease-out),border-color .16s ease,background-color .16s ease,color .16s ease;
}
.hero-chip .ico{color:var(--brand);opacity:.7;transition:transform .16s var(--ease-out),opacity .16s ease}
.hero-chip:hover{
  transform:translateX(4px);border-color:var(--brand);
  background:var(--brand-soft);color:var(--brand);
}
.hero-chip:hover .ico{transform:translateX(3px);opacity:1}
.hero-card-foot{
  margin-top:var(--space-4);padding-top:var(--space-3);
  border-top:1px solid var(--hairline);
  display:flex;align-items:center;justify-content:space-between;gap:var(--space-2);
  font-size:13px;color:var(--ink-muted);flex-wrap:wrap;
}
.hero-card-foot a{font-family:var(--display);font-weight:700;color:var(--brand);text-decoration:none;font-variant-numeric:tabular-nums}
.hero-card-foot a:hover{text-decoration:underline}

/* With a real photo the hero gets a scrim so type stays readable. */
.hero.has-media{position:relative;background:var(--night)}
.hero.has-media::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(19,36,45,.94) 0%,rgba(19,36,45,.78) 55%,rgba(19,36,45,.52) 100%);z-index:1}
.hero.has-media>*{position:relative;z-index:2}
.hero-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}

.badges{display:flex;flex-wrap:wrap;gap:var(--space-2);margin-top:var(--space-8);list-style:none;padding:0}
.badges li{
  display:inline-flex;align-items:center;gap:6px;
  font-size:13.5px;font-weight:600;padding:7px 13px;border-radius:var(--radius-pill);
  border:1px solid rgba(255,255,255,.38);background:rgba(255,255,255,.08);
  color:var(--on-brand);backdrop-filter:blur(6px);
}
.badges li .ico{width:15px;height:15px;opacity:.9}
.hero.has-media .badges li{color:var(--on-night);border-color:var(--night-hairline);background:rgba(255,255,255,.08)}

/* ---------- trust strip ---------- */
.strip{
  background:var(--night);color:var(--on-night);padding:var(--space-8) 0;
  border-bottom:3px solid var(--accent);
}
.strip-in{display:flex;flex-wrap:wrap;gap:var(--space-6);max-width:var(--max);margin:0 auto;padding:0 var(--space-6)}
.stat{
  flex:1 1 165px;padding-left:var(--space-4);
  border-left:2px solid var(--night-hairline);
}
.stat:first-child{border-left-color:var(--accent)}
.stat b{display:block;font-family:var(--display);font-size:clamp(28px,3.4vw,40px);font-weight:800;line-height:1;color:var(--on-night);font-variant-numeric:tabular-nums}
.stat span{display:block;font-size:14px;color:var(--on-night-muted);margin-top:var(--space-2)}

/* ---------- grids & cards ---------- */
.grid{display:grid;gap:var(--space-6);grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
.grid-2{display:grid;gap:var(--space-12);grid-template-columns:1.15fr .85fr;align-items:start}
@media (max-width:860px){.grid-2{grid-template-columns:1fr;gap:var(--space-8)}}
.card{
  background:var(--surface);border:1px solid var(--hairline);border-radius:var(--radius-lg);
  padding:var(--space-6);display:flex;flex-direction:column;
  border-top:3px solid var(--accent);
  box-shadow:var(--shadow-sm);
  position:relative;overflow:hidden;
}
.alt .card{background:var(--surface)}
.card-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-4)}
.card-icon{
  width:42px;height:42px;border-radius:var(--radius-md);
  background:var(--brand-soft);color:var(--brand);
  display:inline-flex;align-items:center;justify-content:center;
  font-size:19px;transition:transform .2s var(--ease-out),background-color .2s ease,color .2s ease;
}
.card-num{
  font-family:var(--display);font-size:12.5px;font-weight:700;letter-spacing:.12em;
  color:var(--ink-muted);opacity:.65;font-variant-numeric:tabular-nums;
}
.card h3{margin-bottom:var(--space-2);transition:color .15s ease}
.card p{color:var(--ink-muted);font-size:15.5px}
a.card{text-decoration:none;color:inherit;transition:transform .22s var(--ease-out),box-shadow .22s var(--ease-out),border-color .22s ease}
a.card:hover{transform:translateY(-4px);box-shadow:var(--shadow-md);border-color:var(--border-strong);border-top-color:var(--brand)}
a.card:hover .card-icon{background:var(--brand);color:var(--on-brand);transform:scale(1.06)}
a.card:hover h3{color:var(--brand)}
a.card .more{
  margin-top:auto;padding-top:var(--space-4);
  display:inline-flex;align-items:center;gap:6px;
  font-weight:700;font-size:15px;color:var(--brand);
}
a.card .more .ico{transition:transform .2s var(--ease-out)}
a.card:hover .more .ico{transform:translateX(4px)}

.aside-card{
  background:var(--surface-raised);border:1px solid var(--hairline);
  border-radius:var(--radius-lg);padding:var(--space-8);
  box-shadow:var(--shadow-sm);border-top:3px solid var(--brand);
}
.alt .aside-card{background:var(--surface)}
.aside-ico{
  width:44px;height:44px;border-radius:var(--radius-md);
  background:var(--brand-soft);color:var(--brand);
  display:inline-flex;align-items:center;justify-content:center;
  font-size:20px;margin-bottom:var(--space-4);
}

/* ---------- process steps ---------- */
.steps{list-style:none;padding:0;margin:0;display:grid;gap:var(--space-6);grid-template-columns:repeat(auto-fit,minmax(225px,1fr))}
.step{
  background:var(--surface);border:1px solid var(--hairline);
  border-top:3px solid var(--brand);border-radius:var(--radius-lg);
  padding:var(--space-6);box-shadow:var(--shadow-sm);
  transition:transform .2s var(--ease-out),box-shadow .2s var(--ease-out);
}
.step:hover{transform:translateY(-3px);box-shadow:var(--shadow-md)}
.step-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-3)}
.step b{
  display:inline-block;font-family:var(--display);font-size:12.5px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--brand);background:var(--brand-soft);
  padding:4px 10px;border-radius:var(--radius-pill);
}
.step-ico{color:var(--accent);font-size:18px;display:inline-flex}
.step h3{font-size:19px;margin-bottom:var(--space-2)}
.step p{font-size:15.5px;color:var(--ink-muted)}
.band .step{background:var(--night-raised);border-color:var(--night-hairline);border-top-color:var(--accent)}
.band .step b{color:var(--on-night);background:rgba(255,255,255,.08)}
.band .step p{color:var(--on-night-muted)}

/* ---------- arizona notes: the local-knowledge block ---------- */
.notes{
  list-style:none;padding:0;margin:0;counter-reset:n;
  display:grid;gap:var(--space-4);grid-template-columns:repeat(auto-fit,minmax(300px,1fr));
}
.notes li{
  counter-increment:n;position:relative;
  padding:var(--space-6) var(--space-6) var(--space-6) 64px;
  background:var(--night-raised);border:1px solid var(--night-hairline);
  border-left:3px solid var(--accent);border-radius:var(--radius-md);
  font-size:16px;color:var(--on-night);line-height:1.55;
}
.notes li::before{
  content:counter(n,decimal-leading-zero);position:absolute;left:var(--space-4);top:var(--space-6);
  width:32px;height:32px;border-radius:var(--radius-sm);
  background:rgba(255,255,255,.07);
  display:flex;align-items:center;justify-content:center;
  font-family:var(--display);font-weight:700;font-size:13.5px;letter-spacing:.08em;color:var(--accent);
}
.notes-light li{background:var(--surface-raised);border-color:var(--hairline);border-left-color:var(--brand);color:var(--ink)}
.notes-light li::before{background:var(--brand-soft);color:var(--brand)}

/* ---------- checklist ---------- */
.ticks{list-style:none;padding:0;margin:var(--space-6) 0 0}
.ticks li{position:relative;padding:var(--space-3) 0 var(--space-3) var(--space-8);border-bottom:1px solid var(--hairline);font-size:16px}
.ticks li:last-child{border-bottom:0}
.ticks li::before{content:"";position:absolute;left:0;top:19px;width:16px;height:9px;border-left:2.5px solid var(--accent);border-bottom:2.5px solid var(--accent);transform:rotate(-45deg)}

/* ---------- gallery & lightbox ---------- */
.gallery{display:grid;gap:var(--space-6);grid-template-columns:repeat(auto-fit,minmax(265px,1fr))}
.gallery figure{
  margin:0;border:1px solid var(--hairline);border-radius:var(--radius-lg);
  overflow:hidden;background:var(--surface-raised);box-shadow:var(--shadow-sm);
  transition:transform .22s var(--ease-out),box-shadow .22s var(--ease-out);
}
.gallery figure:hover{transform:translateY(-3px);box-shadow:var(--shadow-md)}
.gallery-btn{
  display:block;width:100%;padding:0;border:0;background:none;cursor:pointer;
  position:relative;overflow:hidden;text-align:left;
}
.gallery img{
  aspect-ratio:4/3;object-fit:cover;width:100%;
  transition:transform .38s var(--ease-out);
}
.gallery-btn:hover img,.gallery-btn:focus-visible img{transform:scale(1.04)}
.gallery-zoom{
  position:absolute;right:var(--space-3);bottom:var(--space-3);
  display:inline-flex;align-items:center;gap:6px;
  padding:6px 12px;border-radius:var(--radius-pill);
  background:rgba(19,36,45,.82);color:#fff;font-size:13px;font-weight:600;
  opacity:0;transform:translateY(6px);
  transition:opacity .2s ease,transform .2s var(--ease-out);
}
.gallery-btn:hover .gallery-zoom,.gallery-btn:focus-visible .gallery-zoom{opacity:1;transform:none}
.gallery figcaption{padding:var(--space-3) var(--space-4);font-size:14px;font-weight:600;color:var(--ink-muted)}

/* Top-layer Lightbox Dialog */
dialog.lightbox{
  padding:0;border:1px solid var(--night-hairline);border-radius:var(--radius-lg);
  background:var(--night);color:var(--on-night);max-width:min(940px,92vw);width:100%;
  box-shadow:var(--shadow-lg);
  opacity:0;transform:scale(.95);
  transition-property:opacity,transform,display,overlay;
  transition-duration:.25s;
  transition-timing-function:var(--ease-out);
  transition-behavior:allow-discrete;
}
:is(dialog.lightbox[open]):where(:not([data-closing])){
  opacity:1;transform:scale(1);
  @starting-style{opacity:0;transform:scale(.95)}
}
dialog.lightbox::backdrop{
  background-color:rgba(10,18,23,0);
  backdrop-filter:blur(4px);
  transition-property:background-color,display,overlay;
  transition-duration:.25s;
  transition-timing-function:var(--ease-out);
  transition-behavior:allow-discrete;
}
:is(dialog.lightbox[open]):where(:not([data-closing]))::backdrop{
  background-color:rgba(10,18,23,.82);
  @starting-style{background-color:rgba(10,18,23,0)}
}
.lb-inner{display:flex;flex-direction:column}
.lb-bar{
  display:flex;align-items:center;justify-content:space-between;gap:var(--space-4);
  padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--night-hairline);
}
.lb-cap{font-size:14.5px;font-weight:600;color:var(--on-night)}
.lb-actions{display:flex;align-items:center;gap:var(--space-2)}
.lb-nav,.lb-close{
  background:var(--night-raised);border:1px solid var(--night-hairline);
  color:var(--on-night);width:38px;height:38px;border-radius:var(--radius-sm);
  display:inline-flex;align-items:center;justify-content:center;cursor:pointer;
}
.lb-nav:hover,.lb-close:hover{border-color:var(--accent);color:var(--accent)}
.lb-img{width:100%;max-height:76vh;object-fit:contain;background:#0A1217}

/* ---------- reviews ---------- */
.reviews{display:grid;gap:var(--space-6);grid-template-columns:repeat(auto-fit,minmax(285px,1fr))}
.review{
  margin:0;background:var(--surface);border:1px solid var(--hairline);
  border-radius:var(--radius-lg);padding:var(--space-6);
  box-shadow:var(--shadow-sm);display:flex;flex-direction:column;
  border-top:3px solid var(--accent);
}
.review-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-3)}
.stars{color:var(--accent);letter-spacing:3px;font-size:16px;margin:0}
.review-quo{color:var(--brand);opacity:.22;font-size:24px}
.review p{font-size:16px;font-style:italic}
.review footer{margin-top:auto;padding-top:var(--space-4);border-top:1px solid var(--hairline);font-size:14.5px;color:var(--ink-muted)}
.review cite{font-style:normal;font-weight:700;color:var(--ink);display:block}
.review-ask{
  border:2px dashed var(--border-strong);border-radius:var(--radius-lg);
  padding:var(--space-8);text-align:center;max-width:60ch;margin:0 auto;
  background:var(--surface);box-shadow:var(--shadow-sm);
}
.review-ask-ico{
  width:48px;height:48px;border-radius:50%;background:var(--brand-soft);color:var(--brand);
  display:inline-flex;align-items:center;justify-content:center;font-size:22px;margin-bottom:var(--space-3);
}

/* ---------- areas ---------- */
.pills{display:flex;flex-wrap:wrap;gap:var(--space-2);padding:0;margin:var(--space-6) 0 0;list-style:none}
.pills a,.pills span{
  display:inline-flex;align-items:center;gap:6px;
  padding:10px 16px;border-radius:var(--radius-pill);
  border:1px solid var(--hairline);background:var(--surface);
  font-size:15px;text-decoration:none;color:var(--ink);font-weight:600;
  box-shadow:var(--shadow-sm);
  transition:transform .16s var(--ease-out),border-color .16s ease,color .16s ease,background-color .16s ease;
}
.pills a .ico,.pills span .ico{color:var(--brand);width:16px;height:16px}
.pills a:hover{transform:translateY(-2px);border-color:var(--brand);color:var(--brand);background:var(--brand-soft)}

/* ---------- faq ---------- */
.faq{max-width:78ch;display:flex;flex-direction:column;gap:var(--space-3)}
.faq details{
  background:var(--surface);border:1px solid var(--hairline);
  border-radius:var(--radius-md);padding:0 var(--space-6);
  box-shadow:var(--shadow-sm);transition:border-color .2s ease,box-shadow .2s ease;
  overflow:hidden;
}
.faq details[open]{border-color:var(--brand);box-shadow:var(--shadow-md)}
.faq details::details-content{
  block-size:0;overflow:clip;
  transition:block-size .3s var(--ease-out),content-visibility .3s allow-discrete;
}
.faq details[open]::details-content{block-size:auto}
.faq summary{
  cursor:pointer;list-style:none;padding:var(--space-4) var(--space-8) var(--space-4) 0;
  font-family:var(--display);font-weight:700;font-size:17.5px;position:relative;color:var(--ink);
}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{
  content:"";position:absolute;right:var(--space-2);top:50%;width:10px;height:10px;
  border-right:2.5px solid var(--brand);border-bottom:2.5px solid var(--brand);
  transform:translateY(-70%) rotate(45deg);transition:transform .22s var(--ease-out);
}
.faq details[open] summary{color:var(--brand)}
.faq details[open] summary::after{transform:translateY(-30%) rotate(225deg)}
.faq details p{padding:0 0 var(--space-6);color:var(--ink-muted);max-width:68ch}

/* ---------- form & quote split ---------- */
.quote-split{display:grid;gap:var(--space-12);grid-template-columns:1fr 1.15fr;align-items:start}
@media (max-width:900px){.quote-split{grid-template-columns:1fr;gap:var(--space-8)}}
.quote-expect{list-style:none;padding:0;margin:var(--space-8) 0;display:flex;flex-direction:column;gap:var(--space-4)}
.quote-expect li{display:flex;align-items:flex-start;gap:var(--space-4)}
.quote-expect b{
  width:34px;height:34px;border-radius:var(--radius-sm);
  background:rgba(255,255,255,.1);color:var(--accent);
  font-family:var(--display);font-size:13.5px;font-weight:800;
  display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;
}
.alt .quote-expect b{background:var(--brand-soft);color:var(--brand)}
.quote-expect strong{display:block;font-family:var(--display);font-size:16.5px;margin-bottom:2px}
.quote-expect span{display:block;font-size:14.5px;color:var(--on-night-muted)}
.alt .quote-expect span{color:var(--ink-muted)}
.quote-direct{
  display:flex;align-items:center;gap:var(--space-4);
  padding:var(--space-4) var(--space-6);border-radius:var(--radius-md);
  background:rgba(255,255,255,.06);border:1px solid var(--night-hairline);
}
.alt .quote-direct{background:var(--surface);border-color:var(--hairline)}
.quote-direct-ico{
  width:44px;height:44px;border-radius:50%;background:var(--accent);color:var(--on-accent);
  display:inline-flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;
}
.quote-direct span{display:block;font-size:13.5px;color:var(--on-night-muted)}
.alt .quote-direct span{color:var(--ink-muted)}
.quote-direct a{font-family:var(--display);font-size:20px;font-weight:800;text-decoration:none}

.quote{
  background:var(--surface);border:1px solid var(--hairline);
  border-radius:var(--radius-lg);padding:var(--space-8);
  box-shadow:var(--shadow-lg);border-top:4px solid var(--accent);
  transition:box-shadow .3s ease,transform .3s ease;
}
.quote.pulse-highlight{box-shadow:0 0 0 4px var(--accent),var(--shadow-lg)}
.band .quote{background:var(--night-raised);border-color:var(--night-hairline);border-top-color:var(--accent)}
.field-row{display:grid;gap:var(--space-4);grid-template-columns:1fr 1fr}
@media (max-width:560px){.field-row{grid-template-columns:1fr;gap:0}}
.field{margin-bottom:var(--space-4)}
.field label{display:block;font-size:14.5px;font-weight:700;margin-bottom:var(--space-2)}
.band .field label{color:var(--on-night)}
.field input,.field select,.field textarea{
  width:100%;padding:13px 14px;font:inherit;font-size:16px;color:var(--ink);
  background:var(--surface);border:1px solid var(--border-strong);border-radius:var(--radius-sm);
  transition:border-color .15s ease,box-shadow .15s ease;
}
.band .field input,.band .field select,.band .field textarea{background:var(--surface);color:var(--ink)}
.field textarea{min-height:105px;resize:vertical}
.field input:focus,.field select:focus,.field textarea:focus{outline:3px solid var(--focus);outline-offset:1px;border-color:var(--brand)}
.field [aria-invalid="true"]{border-color:var(--danger);box-shadow:0 0 0 1px var(--danger)}
.field .err{display:none;color:var(--danger);font-size:14px;margin-top:var(--space-2);font-weight:600}
.field [aria-invalid="true"]~.err{display:block}

/* Interactive timeline pills */
.time-pills{display:grid;grid-template-columns:repeat(2,1fr);gap:var(--space-2)}
@media (max-width:480px){.time-pills{grid-template-columns:1fr}}
.time-pill{
  padding:10px 12px;border-radius:var(--radius-sm);
  border:1px solid var(--border-strong);background:var(--surface);
  color:var(--ink);font:inherit;font-size:14px;font-weight:600;
  cursor:pointer;text-align:center;transition:all .15s ease;
}
.time-pill:hover{border-color:var(--brand)}
.time-pill.active{background:var(--brand);color:var(--on-brand);border-color:var(--brand);box-shadow:var(--shadow-sm)}
.js .sr-select{position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none}
html:not(.js) .time-pills{display:none}

.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.form-note{font-size:14px;color:var(--ink-muted);margin-top:var(--space-4);text-align:center}
.form-err{color:var(--danger);font-weight:600;font-size:15px;margin:0 0 var(--space-4)}
.band .form-err{color:#F2B8A8}
.band .form-note{color:var(--on-night-muted)}
.form-ok{
  display:none;border:1px solid var(--ok);border-left:4px solid var(--ok);
  border-radius:var(--radius-md);padding:var(--space-6);background:var(--surface);
  color:var(--ink);font-size:17px;box-shadow:var(--shadow-md);
}
.form-ok.show{display:block}

/* ---------- CTA card band ---------- */
.cta-card{
  background:var(--surface);border:1px solid var(--hairline);
  border-left:5px solid var(--accent);border-radius:var(--radius-lg);
  padding:var(--space-8) var(--space-12);box-shadow:var(--shadow-md);
  display:flex;align-items:center;justify-content:space-between;gap:var(--space-8);flex-wrap:wrap;
}
@media (max-width:700px){.cta-card{padding:var(--space-6)}}
.cta-copy{max-width:56ch}

/* ---------- footer ---------- */
.site-foot{background:var(--night);color:var(--on-night-muted);padding:var(--space-16) 0 var(--space-8);font-size:15.5px}
.site-foot a{color:var(--on-night);text-decoration:none}
.site-foot a:hover{text-decoration:underline}
.foot-grid{display:grid;gap:var(--space-8);grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}
.site-foot h4{color:var(--on-night);font-size:14px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:var(--space-4)}
.site-foot ul{list-style:none;padding:0;margin:0}
.site-foot li{margin-bottom:var(--space-2)}
.site-foot address{font-style:normal;line-height:1.7}
.foot-bottom{border-top:1px solid var(--night-hairline);margin-top:var(--space-12);padding-top:var(--space-6);display:flex;flex-wrap:wrap;gap:var(--space-4);justify-content:space-between;font-size:14px}
.foot-roc{color:var(--on-night);font-variant-numeric:tabular-nums}

/* ---------- mobile call bar ---------- */
.callbar{display:none}
@media (max-width:700px){
  .callbar{
    display:flex;position:fixed;left:0;right:0;bottom:0;z-index:120;
    border-top:1px solid var(--night-hairline);box-shadow:0 -4px 18px rgba(0,0,0,.22);
  }
  .callbar a{
    flex:1;display:flex;align-items:center;justify-content:center;gap:var(--space-2);
    padding:16px 10px;font-family:var(--display);font-weight:700;font-size:16px;text-decoration:none;min-height:56px;
  }
  .callbar .call{background:var(--accent);color:var(--on-accent)}
  .callbar .quote-link{background:var(--night);color:var(--on-night)}
  body{padding-bottom:58px}
}

/* Footer and pill links are navigation, not prose, so they get a real tap
   target on a phone rather than an 18px line of text. */
@media (max-width:700px){
  .site-foot li{margin-bottom:0}
  .site-foot li a{display:inline-block;padding:11px 0;min-height:44px;line-height:22px}
  .site-foot address a{display:inline-block;padding:7px 0}
  .pills a,.pills span{padding:12px 18px}
  .foot-bottom a{display:inline-block;padding:8px 0}
}

/* ---------- breadcrumbs ---------- */
.crumbs{font-size:14px;color:var(--ink-muted);padding:var(--space-4) 0 0}
.crumbs ol{list-style:none;display:flex;flex-wrap:wrap;gap:var(--space-2);padding:0;margin:0}
.crumbs li::after{content:"/";margin-left:var(--space-2);color:var(--border-strong)}
.crumbs li:last-child::after{content:""}
.crumbs a{color:var(--ink-muted)}

/* ---------- motion & print ---------- */
/*
  Scoped to .js, which an inline script in <head> sets. Without it the rule
  never applies, so with JS disabled, JS still loading, or JS erroring, the
  content is simply visible. Hiding content by default and relying on an
  IntersectionObserver to bring it back means one script failure renders a
  blank page.
*/
.js .reveal{opacity:0;transform:translateY(18px);transition:opacity .55s var(--ease-out),transform .55s var(--ease-out)}
.js .reveal.in{opacity:1;transform:none}
.js .reveal .card,.js .reveal .step,.js .reveal .review,.js .reveal .notes li,.js .reveal .gallery figure{
  opacity:0;transform:translateY(14px);
  transition:opacity .48s var(--ease-out),transform .48s var(--ease-out),box-shadow .22s var(--ease-out),border-color .22s ease;
  transition-delay:calc(var(--i,0) * 65ms);
}
.js .reveal.in .card,.js .reveal.in .step,.js .reveal.in .review,.js .reveal.in .notes li,.js .reveal.in .gallery figure{
  opacity:1;transform:none;
}
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  .js .reveal,.js .reveal .card,.js .reveal .step,.js .reveal .review,.js .reveal .notes li,.js .reveal .gallery figure{
    opacity:1;transform:none;transition:none;
  }
  .btn:hover,a.card:hover,.step:hover,.gallery figure:hover,.pills a:hover,.hero-chip:hover{transform:none}
  .status-dot{animation:none}
  .faq details::details-content{transition:none!important}
  dialog.lightbox{transform:none;transition-duration:.1s}
  @starting-style{dialog.lightbox[open]{transform:none}}
}
@media print{
  .site-head,.callbar,.btn-row,.quote,.nav,.hero-card,dialog.lightbox{display:none}
  body{background:#fff;color:#000;font-size:12pt}
  .hero,.strip,.band,.site-foot{background:#fff!important;color:#000!important}
  .hero h1,.band h2,.site-foot h4{color:#000!important}
  a[href^="http"]::after{content:" (" attr(href) ")";font-size:9pt}
}
`;
}

/* ============================================================
   CLIENT SCRIPT
   ============================================================ */

export function script() {
  return `(function(){
  "use strict";
  var reducedMotion=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var head=document.querySelector(".site-head");
  if(head){
    var onScroll=function(){head.classList.toggle("scrolled",window.scrollY>8)};
    addEventListener("scroll",onScroll,{passive:true});onScroll();
  }
  var t=document.querySelector(".nav-toggle"),n=document.getElementById("nav");
  if(t&&n){
    t.addEventListener("click",function(){
      var open=n.classList.toggle("open");
      t.setAttribute("aria-expanded",open?"true":"false");
    });
    n.addEventListener("click",function(e){if(e.target.closest("a")){n.classList.remove("open");t.setAttribute("aria-expanded","false")}});
    addEventListener("keydown",function(e){if(e.key==="Escape"&&n.classList.contains("open")){n.classList.remove("open");t.setAttribute("aria-expanded","false");t.focus()}});
  }

  /* ---- live Arizona availability status ---- */
  var pill=document.querySelector(".hero-pill[data-hours]");
  if(pill){
    try{
      var hrs=JSON.parse(pill.getAttribute("data-hours")||"[]");
      var azNow=new Date(new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"}));
      var dayMap=["Su","Mo","Tu","We","Th","Fr","Sa"];
      var today=dayMap[azNow.getDay()];
      var mins=azNow.getHours()*60+azNow.getMinutes();
      var toMins=function(s){var p=String(s||"").split(":");return parseInt(p[0],10)*60+parseInt(p[1]||0,10)};
      var fmtTime=function(s){
        var p=String(s||"").split(":"),h=parseInt(p[0],10),m=p[1]||"00";
        var ap=h>=12?"PM":"AM";h=h%12||12;
        return m==="00"?h+" "+ap:h+":"+m+" "+ap;
      };
      for(var i=0;i<hrs.length;i++){
        var days=String(hrs[i].days||"").split(",");
        if(days.indexOf(today)>-1){
          var o=toMins(hrs[i].opens),c=toMins(hrs[i].closes);
          var txt=pill.querySelector(".status-text");
          if(txt&&mins>=o&&mins<c){
            txt.textContent="Open today until "+fmtTime(hrs[i].closes)+" · Fast same-day callbacks";
          }
          break;
        }
      }
    }catch(_e){}
  }

  /* ---- scroll reveals ---- */
  var reveals=[].slice.call(document.querySelectorAll(".reveal"));
  var revealAll=function(){reveals.forEach(function(el){el.classList.add("in")})};
  if("IntersectionObserver" in window){
    var io=new IntersectionObserver(function(es){
      es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target)}})
    },{threshold:.08,rootMargin:"0px 0px -40px 0px"});
    reveals.forEach(function(el){io.observe(el)});
    /*
      Safety net. A missed observer callback, a fast scroll, a print, or a
      tool that renders the page without a real viewport must never leave a
      section at opacity 0. After 2.5s everything is shown regardless.
    */
    setTimeout(revealAll,2500);
    addEventListener("beforeprint",revealAll);
  }else{
    revealAll();
  }

  /* ---- animated stat counters ---- */
  var counters=[].slice.call(document.querySelectorAll(".stat b[data-count]"));
  if(counters.length&&!reducedMotion&&"IntersectionObserver" in window){
    var countIo=new IntersectionObserver(function(es){
      es.forEach(function(entry){
        if(!entry.isIntersecting)return;
        var el=entry.target;
        countIo.unobserve(el);
        var target=parseInt(el.getAttribute("data-count"),10);
        var suffix=el.getAttribute("data-suffix")||"";
        if(!target||isNaN(target))return;
        var start=performance.now(),dur=850;
        var tick=function(now){
          var p=Math.min(1,(now-start)/dur);
          var eased=1-Math.pow(1-p,3);
          var cur=Math.round(target*eased);
          el.textContent=cur.toLocaleString("en-US")+suffix;
          if(p<1)requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    },{threshold:.3});
    counters.forEach(function(c){countIo.observe(c)});
  }

  /* ---- top-layer lightbox dialog ---- */
  var supportsDisplayTransition;
  function canTransitionDisplay(){
    if(supportsDisplayTransition!==undefined)return supportsDisplayTransition;
    if(!window.CSS||!CSS.supports||!CSS.supports("transition-behavior","allow-discrete")||!document.body)return false;
    var probe=document.createElement("div");
    probe.style.cssText="transition: display 1s allow-discrete !important; display: block;";
    document.body.appendChild(probe);
    getComputedStyle(probe).display;
    probe.style.display="none";
    supportsDisplayTransition=getComputedStyle(probe).display==="block";
    probe.remove();
    return supportsDisplayTransition;
  }
  function supportsTopLayerExit(){
    return Boolean(window.CSS&&CSS.supports&&CSS.supports("overlay","auto")&&canTransitionDisplay());
  }
  function closeTopLayer(dialog){
    if(!supportsTopLayerExit()&&dialog.getAnimations){
      dialog.setAttribute("data-closing","");
      var anims=dialog.getAnimations({subtree:true});
      if(anims.length>0){
        Promise.race([
          Promise.allSettled(anims.map(function(a){return a.finished})),
          new Promise(function(r){setTimeout(r,2000)})
        ]).then(function(){
          if(!dialog.hasAttribute("data-closing"))return;
          dialog.removeAttribute("data-closing");
          dialog.close();
        });
        return;
      }
      dialog.removeAttribute("data-closing");
    }
    dialog.close();
  }
  var lb=document.querySelector("dialog.lightbox");
  var gBtns=[].slice.call(document.querySelectorAll(".gallery-btn"));
  if(lb&&gBtns.length){
    var lbImg=lb.querySelector(".lb-img"),lbCap=lb.querySelector(".lb-cap");
    var lbIdx=0;
    var showIdx=function(idx){
      lbIdx=(idx+gBtns.length)%gBtns.length;
      var b=gBtns[lbIdx];
      if(lbImg){lbImg.src=b.getAttribute("data-full")||"";lbImg.alt=b.getAttribute("data-alt")||""}
      if(lbCap)lbCap.textContent=b.getAttribute("data-caption")||"";
    };
    gBtns.forEach(function(btn,idx){
      btn.addEventListener("click",function(){
        showIdx(idx);
        if(lb.showModal)lb.showModal();
      });
    });
    var prevBtn=lb.querySelector("[data-lb-prev]"),nextBtn=lb.querySelector("[data-lb-next]"),closeBtn=lb.querySelector("[data-lb-close]");
    if(prevBtn)prevBtn.addEventListener("click",function(){showIdx(lbIdx-1)});
    if(nextBtn)nextBtn.addEventListener("click",function(){showIdx(lbIdx+1)});
    if(closeBtn)closeBtn.addEventListener("click",function(){closeTopLayer(lb)});
    lb.addEventListener("cancel",function(e){e.preventDefault();closeTopLayer(lb)});
    lb.addEventListener("keydown",function(e){
      if(e.key==="ArrowLeft")showIdx(lbIdx-1);
      if(e.key==="ArrowRight")showIdx(lbIdx+1);
    });
    if(typeof HTMLDialogElement!=="undefined"&&!("closedBy" in HTMLDialogElement.prototype)){
      lb.addEventListener("click",function(event){
        if(event.target!==lb)return;
        var rect=lb.getBoundingClientRect();
        var isDialogContent=rect.top<=event.clientY&&event.clientY<=rect.top+rect.height&&rect.left<=event.clientX&&event.clientX<=rect.left+rect.width;
        if(isDialogContent)return;
        closeTopLayer(lb);
      });
    }
  }

  /* ---- hero service quick-select chips & query params ---- */
  var form=document.getElementById("quote-form");
  var selectService=function(name){
    if(!form||!name)return;
    var sel=form.elements["service"];
    if(!sel)return;
    for(var i=0;i<sel.options.length;i++){
      if(sel.options[i].text.toLowerCase()===name.toLowerCase()){
        sel.selectedIndex=i;break;
      }
    }
  };
  [].slice.call(document.querySelectorAll("[data-pick-service]")).forEach(function(chip){
    chip.addEventListener("click",function(e){
      var svc=chip.getAttribute("data-pick-service");
      var qSec=document.getElementById("quote");
      if(qSec&&form){
        e.preventDefault();
        selectService(svc);
        qSec.scrollIntoView({behavior:reducedMotion?"auto":"smooth"});
        form.classList.add("pulse-highlight");
        setTimeout(function(){form.classList.remove("pulse-highlight")},1400);
        var nm=form.elements["name"];
        if(nm)setTimeout(function(){nm.focus({preventScroll:true})},350);
      }
    });
  });

  if(!form)return;

  /* ---- timeline quick-pills & phone formatting ---- */
  var timeSelect=form.elements["timeline"];
  var timePills=[].slice.call(form.querySelectorAll(".time-pill"));
  if(timeSelect&&timePills.length){
    timePills.forEach(function(btn){
      btn.addEventListener("click",function(){
        var val=btn.getAttribute("data-timeline");
        timePills.forEach(function(b){b.classList.toggle("active",b===btn)});
        for(var i=0;i<timeSelect.options.length;i++){
          if(timeSelect.options[i].text===val){timeSelect.selectedIndex=i;break}
        }
      });
    });
  }
  var phoneInput=form.elements["phone"];
  if(phoneInput){
    phoneInput.addEventListener("input",function(){
      var d=phoneInput.value.replace(/\\D/g,"");
      if(d.length===11&&d.charAt(0)==="1")d=d.slice(1);
      if(d.length>=7&&d.length<=10){
        phoneInput.value="("+d.slice(0,3)+") "+d.slice(3,6)+"-"+d.slice(6,10);
      }
    });
  }

  /* ---- lead form ---- */
  var endpoint=form.getAttribute("data-endpoint")||"";
  var required=["name","phone"];
  var setErr=function(el,msg){
    el.setAttribute("aria-invalid","true");
    var e=el.parentNode.querySelector(".err");
    if(e)e.textContent=msg;
  };
  var clearErr=function(el){
    el.removeAttribute("aria-invalid");
    var e=el.parentNode.querySelector(".err");
    if(e)e.textContent="";
  };
  form.addEventListener("input",function(e){if(e.target.name)clearErr(e.target)});
  form.addEventListener("submit",function(e){
    e.preventDefault();
    var bad=null;
    required.forEach(function(k){
      var el=form.elements[k];
      if(!el)return;
      var v=String(el.value||"").trim();
      if(!v){setErr(el,"Please fill this in.");bad=bad||el;return}
      if(k==="phone"&&v.replace(/[^0-9]/g,"").length<10){setErr(el,"A 10-digit phone number, please.");bad=bad||el}
    });
    var em=form.elements["email"];
    if(em&&String(em.value||"").trim()&&!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]{2,}$/.test(em.value.trim())){
      setErr(em,"That email does not look right.");bad=bad||em;
    }
    if(bad){bad.focus();return}
    /* honeypot: a bot fills the hidden field, a person never sees it */
    if(form.elements["company_url"]&&form.elements["company_url"].value){return}

    var data={};
    new FormData(form).forEach(function(v,k){if(k!=="company_url")data[k]=v});
    data.business=form.getAttribute("data-business")||"";
    data.page=location.pathname;
    data.submitted=new Date().toISOString();

    var btn=form.querySelector('button[type="submit"]');
    var errBox=document.getElementById("form-err");
    var done=function(){
      form.style.display="none";
      var ok=document.getElementById("form-ok");
      if(ok){ok.classList.add("show");ok.setAttribute("tabindex","-1");ok.focus()}
    };
    var failed=function(msg){
      if(btn)btn.disabled=false;
      if(!errBox)return;
      var phone=form.getAttribute("data-phone")||"";
      errBox.textContent=(msg||"That did not go through.")+(phone?" Please call "+phone+" and you will get a person.":"");
      errBox.hidden=false;
    };
    if(endpoint&&endpoint.charAt(0)==="/"&&endpoint.charAt(1)!=="/"){
      /*
        Same server as the page, so the answer is readable: show a real error
        and the phone number instead of a thank-you for a lead that was lost.
      */
      if(btn)btn.disabled=true;
      if(errBox)errBox.hidden=true;
      fetch(endpoint,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(data)})
        .then(function(r){
          if(r.ok)return done();
          return r.json().then(function(j){failed(j&&j.error)},function(){failed()});
        })
        .catch(function(){failed("We could not reach the server.")});
    }else if(endpoint){
      /*
        A cross-origin endpoint such as an Apps Script web app sends no CORS
        headers, so the response is opaque either way. no-cors still delivers it.
      */
      fetch(endpoint,{method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(data)})
        .then(done).catch(done);
    }else{
      done();
    }
  });
})();`;
}

/* ============================================================
   SHELL
   ============================================================ */

/** depth 0 = root page, 1 = one directory down. Keeps links relative. */
export function rel(depth) {
  return depth > 0 ? "../".repeat(depth) : "";
}

/**
 * Where a city name should link.
 *
 * The home city does not get its own area page: the home page already targets
 * "<trade> contractor in <home city>", and a second page on the same query
 * competes with it rather than adding reach. Area pages cover the rest of the
 * territory, which is where there is no page yet.
 */
export function areaHref(spec, city, depth = 0) {
  const r = rel(depth);
  return city === spec.serviceArea.home ? `${r}index.html` : `${r}areas/${slugify(city)}.html`;
}

/** Cities that get their own generated page. */
export function areaCities(spec) {
  return spec.serviceArea.cities.filter(c => c !== spec.serviceArea.home);
}

export function head({ spec, title, desc, canonical, depth = 0, schema = [], ogImage = "" }) {
  const r = rel(depth);
  const tk = spec.__tokens;
  const ld = schema
    .filter(Boolean)
    .map(o => `<script type="application/ld+json">${jsonScript(o)}</script>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>document.documentElement.className+=" js";</script>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ""}
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="geo.region" content="US-AZ">
<meta name="geo.placename" content="${esc(spec.serviceArea.home)}">

<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(spec.business.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ""}
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ""}
<meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fontHref(tk.fonts.display, tk.fonts.body)}">
<link rel="stylesheet" href="${r}assets/site.css">
<meta name="theme-color" content="${tk.light.brand}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="${tk.dark.surface}" media="(prefers-color-scheme: dark)">
${ld}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>`;
}

/**
 * Site header. The ROC line here is what satisfies the prominent-display
 * requirement on every page, not just the home page.
 */
export function header(spec, { depth = 0, current = "" } = {}) {
  const r = rel(depth);
  const p = spec.site.pages;
  const links = [
    ["services", `${r}services/`, "Services"],
    ["areas", `${r}areas/`, "Service Area"],
    ["gallery", `${r}gallery/`, "Our Work"],
    ["reviews", `${r}reviews/`, "Reviews"],
    ["about", `${r}about/`, "About"],
    ["faq", `${r}faq/`, "FAQ"],
    ["contact", `${r}contact/`, "Contact"]
  ].filter(([k]) => {
    if (k === "services") return p.servicePages;
    if (k === "areas") return p.areaPages && spec.serviceArea.cities.length > 1;
    if (k === "gallery") return p.gallery && spec.proof.gallery.length > 0;
    if (k === "reviews") return p.reviews;
    if (k === "about") return p.about;
    if (k === "faq") return p.faq;
    if (k === "contact") return p.contact;
    return true;
  });

  return `<header class="site-head">
  <div class="head-in">
    <a class="brand" href="${r}index.html">
      <b>${esc(spec.business.name)}</b>
      <span class="roc-line">${spec.license.rocNumber
        ? `Arizona ROC #${esc(spec.license.rocNumber)}${spec.license.class ? ` · ${esc(spec.license.class)}` : ""} · ${esc(spec.serviceArea.home)}, AZ`
        : `${esc(spec.serviceArea.home)}, AZ`}</span>
    </a>
    <button class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="nav" aria-label="Open menu">&#9776;</button>
    <nav class="nav" id="nav" aria-label="Main">
      ${links.map(([k, href, label]) =>
        `<a href="${href}"${current === k ? ' aria-current="page"' : ""}>${esc(label)}</a>`).join("\n      ")}
    </nav>
    <div class="head-cta">
      <a class="btn btn-primary" href="tel:${esc(telHref(spec.contact.phone))}">Call ${esc(spec.contact.phoneDisplay)}</a>
    </div>
  </div>
</header>`;
}

export function footer(spec, { depth = 0 } = {}) {
  const r = rel(depth);
  const year = new Date().getFullYear();
  const hours = spec.contact.hours
    .map(h => `${esc(String(h.days).replace(/,/g, " "))} ${esc(h.opens)}&ndash;${esc(h.closes)}`)
    .join("<br>");

  const serviceLinks = spec.site.pages.servicePages
    ? spec.services.slice(0, 6).map(s => `<li><a href="${r}services/${esc(s.slug)}.html">${esc(s.name)}</a></li>`).join("\n        ")
    : "";
  const areaLinks = spec.site.pages.areaPages && spec.serviceArea.cities.length > 1
    ? spec.serviceArea.cities.slice(0, 8).map(c =>
        `<li><a href="${esc(areaHref(spec, c, depth))}">${esc(c)}</a></li>`).join("\n        ")
    : spec.serviceArea.cities.map(c => `<li>${esc(c)}</li>`).join("\n        ");

  return `<footer class="site-foot">
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <h4>${esc(spec.business.name)}</h4>
        <address>
          ${spec.contact.address.street ? `${esc(spec.contact.address.street)}<br>` : ""}
          ${esc(spec.contact.address.city)}, ${esc(spec.contact.address.state)} ${esc(spec.contact.address.zip)}<br>
          <a href="tel:${esc(telHref(spec.contact.phone))}">${esc(spec.contact.phoneDisplay)}</a><br>
          ${spec.contact.email ? `<a href="mailto:${esc(spec.contact.email)}">${esc(spec.contact.email)}</a>` : ""}
        </address>
      </div>
      ${serviceLinks ? `<div><h4>Services</h4><ul>\n        ${serviceLinks}\n      </ul></div>` : ""}
      <div><h4>Service Area</h4><ul>
        ${areaLinks}
      </ul></div>
      <div>
        <h4>Hours</h4>
        <p>${hours}</p>
        ${spec.contact.emergencyService ? `<p><strong style="color:var(--on-night)">Emergency service available</strong></p>` : ""}
      </div>
    </div>
    <div class="foot-bottom">
      <span>&copy; ${year} ${esc(spec.business.name)}. All rights reserved.</span>
      ${spec.license.rocNumber
        ? `<span class="foot-roc">Arizona ROC #${esc(spec.license.rocNumber)}${spec.license.class ? ` (${esc(spec.license.class)})` : ""} &middot; <a href="${esc(spec.license.verifyUrl)}" target="_blank" rel="noopener">Verify this license</a></span>`
        : ""}
    </div>
  </div>
</footer>`;
}

export function callBar(spec, { depth = 0 } = {}) {
  const r = rel(depth);
  return `<div class="callbar">
  <a class="call" href="tel:${esc(telHref(spec.contact.phone))}">Call ${esc(spec.contact.phoneDisplay)}</a>
  <a class="quote-link" href="${r}contact/">Get a quote</a>
</div>`;
}

export function tail(spec, { depth = 0 } = {}) {
  return `${callBar(spec, { depth })}
<script src="${rel(depth)}assets/site.js" defer></script>
</body>
</html>`;
}

/** Local copy so layout does not have to import the whole html module twice. */
function slugify(s) {
  return String(s || "").toLowerCase().replace(/['’]/g, "").replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export { slugify };
