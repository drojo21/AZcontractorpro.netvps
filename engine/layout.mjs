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

*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:92px;-webkit-text-size-adjust:100%}
body{
  margin:0;background:var(--surface);color:var(--ink);
  font-family:var(--body);font-size:17px;line-height:1.6;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
}
img{max-width:100%;display:block;height:auto}
a{color:var(--brand)}
p{margin:0 0 var(--space-4)}
p:last-child{margin-bottom:0}
hr{border:0;border-top:1px solid var(--hairline);margin:var(--space-12) 0}

h1,h2,h3,h4{font-family:var(--display);margin:0 0 var(--space-4);color:var(--ink);text-wrap:balance;letter-spacing:-.015em}
h1{font-size:clamp(34px,5.2vw,54px);line-height:1.06;font-weight:800}
h2{font-size:clamp(26px,3.4vw,38px);line-height:1.12;font-weight:700}
h3{font-size:clamp(19px,1.9vw,22px);line-height:1.25;font-weight:700}
h4{font-size:17px;line-height:1.3;font-weight:700}

/* focus is never removed, only made legible on both themes */
:focus-visible{outline:3px solid var(--focus);outline-offset:2px;border-radius:2px}
.skip{position:absolute;left:-9999px;top:0;background:var(--brand);color:var(--on-brand);padding:var(--space-3) var(--space-4);z-index:200}
.skip:focus{left:var(--space-4);top:var(--space-4)}

.wrap{max-width:var(--max);margin:0 auto;padding:0 var(--space-6)}
section{padding:var(--space-16) 0}
@media (max-width:700px){section{padding:var(--space-12) 0}}
.alt{background:var(--surface-raised)}
.sunk{background:var(--surface-sunk)}
.band{background:var(--night);color:var(--on-night)}
.band h1,.band h2,.band h3{color:var(--on-night)}
.band a{color:var(--on-night)}
.eyebrow{font-size:13px;letter-spacing:.16em;text-transform:uppercase;font-weight:600;color:var(--brand);margin:0 0 var(--space-3)}
.band .eyebrow{color:var(--on-night-muted)}
.lede{font-size:clamp(18px,2vw,21px);line-height:1.5;color:var(--ink-muted);max-width:62ch}
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
  transition:transform .12s ease,background-color .12s ease,border-color .12s ease;
}
.btn:hover{transform:translateY(-1px)}
.btn:active{transform:translateY(0)}
.btn-primary{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
.btn-secondary{background:var(--brand);color:var(--on-brand);border-color:var(--brand)}
.btn-outline{background:transparent;color:var(--brand);border-color:var(--border-strong)}
.btn-outline:hover{border-color:var(--brand)}
.band .btn-outline{color:var(--on-night);border-color:var(--night-hairline)}
/* On the hero the ground IS --brand, so the outline button needs the inverse. */
.hero .btn-outline{color:var(--on-brand);border-color:rgba(255,255,255,.55)}
.hero .btn-outline:hover{border-color:var(--on-brand)}
.hero.has-media .btn-outline{color:var(--on-night);border-color:rgba(238,230,217,.55)}
.btn-row{display:flex;flex-wrap:wrap;gap:var(--space-3);margin-top:var(--space-6)}

/* ---------- header ---------- */
.site-head{
  position:sticky;top:0;z-index:100;background:var(--surface);
  border-bottom:1px solid var(--hairline);
}
.site-head.scrolled{box-shadow:0 2px 14px rgba(0,0,0,.09)}
.head-in{display:flex;align-items:center;gap:var(--space-4);max-width:var(--max);margin:0 auto;padding:var(--space-3) var(--space-6)}
.brand{display:flex;flex-direction:column;text-decoration:none;color:var(--ink);line-height:1.15;min-width:0}
.brand b{font-family:var(--display);font-weight:800;font-size:19px;letter-spacing:-.02em;color:var(--brand)}
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
.nav a{font-size:15.5px;text-decoration:none;color:var(--ink);font-weight:600;white-space:nowrap}
.nav a:hover,.nav a[aria-current="page"]{color:var(--brand)}
.nav a[aria-current="page"]{text-decoration:underline;text-underline-offset:5px;text-decoration-thickness:2px}
.head-cta{display:flex;align-items:center;gap:var(--space-3);margin-left:var(--space-2)}
.head-cta .btn{padding:12px 18px;min-height:46px;font-size:15px}
.nav-toggle{display:none;background:none;border:1px solid var(--hairline);border-radius:var(--radius-sm);width:46px;height:46px;cursor:pointer;margin-left:auto;color:var(--ink);font-size:20px;line-height:1}

@media (max-width:980px){
  .nav{
    display:none;position:absolute;top:100%;left:0;right:0;
    flex-direction:column;align-items:stretch;gap:0;
    background:var(--surface);border-bottom:1px solid var(--hairline);
    padding:var(--space-2) var(--space-6) var(--space-6);
  }
  .nav.open{display:flex}
  .nav a{padding:var(--space-4) 0;border-bottom:1px solid var(--hairline);font-size:17px}
  .nav-toggle{display:block}
  .head-cta{display:none}
}

/* ---------- hero ---------- */
.hero{background:var(--brand);color:var(--on-brand);padding:var(--space-16) 0 var(--space-12)}
.hero h1,.hero h2{color:var(--on-brand)}
.hero .eyebrow{color:var(--on-brand);opacity:.82}
.hero .lede{color:var(--on-brand);opacity:.93;margin-top:var(--space-4)}
.hero-in{max-width:var(--max);margin:0 auto;padding:0 var(--space-6)}
.hero-copy{max-width:40ch}
/* With a real photo the hero gets a scrim so type stays readable. */
.hero.has-media{position:relative;background:var(--night)}
.hero.has-media::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(19,36,45,.92) 0%,rgba(19,36,45,.72) 55%,rgba(19,36,45,.45) 100%)}
.hero.has-media>*{position:relative;z-index:2}
.hero-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1}

.badges{display:flex;flex-wrap:wrap;gap:var(--space-2);margin-top:var(--space-8);list-style:none;padding:0}
.badges li{
  font-size:13.5px;font-weight:600;padding:8px 14px;border-radius:var(--radius-pill);
  border:1px solid rgba(255,255,255,.42);color:var(--on-brand);
}
.hero.has-media .badges li{color:var(--on-night);border-color:var(--night-hairline);background:rgba(255,255,255,.06)}

/* ---------- trust strip ---------- */
.strip{background:var(--night);color:var(--on-night);padding:var(--space-8) 0}
.strip-in{display:flex;flex-wrap:wrap;gap:var(--space-8);max-width:var(--max);margin:0 auto;padding:0 var(--space-6)}
.stat{flex:1 1 160px}
.stat b{display:block;font-family:var(--display);font-size:clamp(28px,3.4vw,40px);font-weight:800;line-height:1;color:var(--on-night);font-variant-numeric:tabular-nums}
.stat span{display:block;font-size:14px;color:var(--on-night-muted);margin-top:var(--space-2)}

/* ---------- grids & cards ---------- */
.grid{display:grid;gap:var(--space-6);grid-template-columns:repeat(auto-fit,minmax(272px,1fr))}
.grid-2{display:grid;gap:var(--space-12);grid-template-columns:1.15fr .85fr;align-items:start}
@media (max-width:860px){.grid-2{grid-template-columns:1fr;gap:var(--space-8)}}
.card{
  background:var(--surface);border:1px solid var(--hairline);border-radius:var(--radius-lg);
  padding:var(--space-6);display:flex;flex-direction:column;
  border-top:3px solid var(--accent);
}
.alt .card{background:var(--surface)}
.card h3{margin-bottom:var(--space-2)}
.card p{color:var(--ink-muted);font-size:15.5px}
a.card{text-decoration:none;color:inherit;transition:transform .12s ease,box-shadow .12s ease}
a.card:hover{transform:translateY(-2px);box-shadow:0 6px 22px rgba(0,0,0,.09)}
a.card .more{margin-top:auto;padding-top:var(--space-4);font-weight:700;font-size:15px;color:var(--brand)}
a.card .more::after{content:" \\2192"}

/* ---------- process steps ---------- */
.steps{list-style:none;padding:0;margin:0;display:grid;gap:var(--space-6);grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.step{border-top:2px solid var(--brand);padding-top:var(--space-4)}
.step b{display:block;font-family:var(--display);font-size:13px;letter-spacing:.14em;color:var(--brand);margin-bottom:var(--space-2)}
.step h3{font-size:19px;margin-bottom:var(--space-2)}
.step p{font-size:15.5px;color:var(--ink-muted)}
.band .step{border-top-color:var(--on-night-muted)}
.band .step b{color:var(--on-night-muted)}
.band .step p{color:var(--on-night-muted)}

/* ---------- arizona notes: the local-knowledge block ---------- */
.notes{list-style:none;padding:0;margin:0;counter-reset:n}
.notes li{
  counter-increment:n;position:relative;padding:var(--space-4) 0 var(--space-4) var(--space-12);
  border-bottom:1px solid var(--night-hairline);font-size:16.5px;color:var(--on-night-muted);
}
.notes li:last-child{border-bottom:0}
.notes li::before{
  content:counter(n,decimal-leading-zero);position:absolute;left:0;top:var(--space-4);
  font-family:var(--display);font-weight:700;font-size:14px;letter-spacing:.1em;color:var(--on-night);opacity:.55;
}
.notes-light li{border-bottom-color:var(--hairline);color:var(--ink-muted)}
.notes-light li::before{color:var(--brand);opacity:1}

/* ---------- checklist ---------- */
.ticks{list-style:none;padding:0;margin:var(--space-6) 0 0}
.ticks li{position:relative;padding:var(--space-3) 0 var(--space-3) var(--space-8);border-bottom:1px solid var(--hairline);font-size:16px}
.ticks li::before{content:"";position:absolute;left:0;top:19px;width:16px;height:9px;border-left:2.5px solid var(--accent);border-bottom:2.5px solid var(--accent);transform:rotate(-45deg)}

/* ---------- gallery ---------- */
.gallery{display:grid;gap:var(--space-4);grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}
.gallery figure{margin:0;border:1px solid var(--hairline);border-radius:var(--radius-md);overflow:hidden;background:var(--surface-raised)}
.gallery img{aspect-ratio:4/3;object-fit:cover;width:100%}
.gallery figcaption{padding:var(--space-3) var(--space-4);font-size:14px;color:var(--ink-muted)}

/* ---------- reviews ---------- */
.reviews{display:grid;gap:var(--space-6);grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
.review{margin:0;background:var(--surface);border:1px solid var(--hairline);border-radius:var(--radius-lg);padding:var(--space-6)}
.stars{color:var(--accent);letter-spacing:3px;font-size:15px;margin-bottom:var(--space-3)}
.review p{font-size:16px}
.review footer{margin-top:var(--space-4);font-size:14.5px;color:var(--ink-muted)}
.review cite{font-style:normal;font-weight:700;color:var(--ink);display:block}
.review-ask{border:2px dashed var(--border-strong);border-radius:var(--radius-lg);padding:var(--space-8);text-align:center;max-width:60ch;margin:0 auto}

/* ---------- areas ---------- */
.pills{display:flex;flex-wrap:wrap;gap:var(--space-2);padding:0;margin:var(--space-6) 0 0;list-style:none}
.pills a,.pills span{
  display:inline-block;padding:9px 16px;border-radius:var(--radius-pill);
  border:1px solid var(--hairline);background:var(--surface);
  font-size:15px;text-decoration:none;color:var(--ink);font-weight:600;
}
.pills a:hover{border-color:var(--brand);color:var(--brand)}

/* ---------- faq ---------- */
.faq{max-width:76ch}
.faq details{border-bottom:1px solid var(--hairline)}
.faq summary{
  cursor:pointer;list-style:none;padding:var(--space-4) var(--space-8) var(--space-4) 0;
  font-family:var(--display);font-weight:700;font-size:17.5px;position:relative;color:var(--ink);
}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{
  content:"";position:absolute;right:var(--space-2);top:50%;width:11px;height:11px;
  border-right:2.5px solid var(--brand);border-bottom:2.5px solid var(--brand);
  transform:translateY(-70%) rotate(45deg);transition:transform .18s ease;
}
.faq details[open] summary::after{transform:translateY(-30%) rotate(225deg)}
.faq details p{padding:0 0 var(--space-6);color:var(--ink-muted);max-width:68ch}

/* ---------- form ---------- */
.quote{background:var(--surface);border:1px solid var(--hairline);border-radius:var(--radius-lg);padding:var(--space-8);max-width:620px}
.band .quote{background:var(--night-raised);border-color:var(--night-hairline)}
.field{margin-bottom:var(--space-4)}
.field label{display:block;font-size:14.5px;font-weight:700;margin-bottom:var(--space-2)}
.band .field label{color:var(--on-night)}
.field input,.field select,.field textarea{
  width:100%;padding:14px;font:inherit;font-size:16px;color:var(--ink);
  background:var(--surface);border:1px solid var(--border-strong);border-radius:var(--radius-sm);
}
.band .field input,.band .field select,.band .field textarea{background:var(--surface);color:var(--ink)}
.field textarea{min-height:110px;resize:vertical}
.field input:focus,.field select:focus,.field textarea:focus{outline:3px solid var(--focus);outline-offset:1px}
.field [aria-invalid="true"]{border-color:var(--danger);box-shadow:0 0 0 1px var(--danger)}
.field .err{display:none;color:var(--danger);font-size:14px;margin-top:var(--space-2);font-weight:600}
.field [aria-invalid="true"]~.err{display:block}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.form-note{font-size:14px;color:var(--ink-muted);margin-top:var(--space-4)}
.form-err{color:var(--danger);font-weight:600;font-size:15px;margin:0 0 var(--space-4)}
.band .form-err{color:#F2B8A8}
.band .form-note{color:var(--on-night-muted)}
.form-ok{
  display:none;border:1px solid var(--ok);border-left:4px solid var(--ok);
  border-radius:var(--radius-md);padding:var(--space-6);background:var(--surface);
  font-size:17px;max-width:620px;
}
.form-ok.show{display:block}

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
    border-top:1px solid var(--night-hairline);
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
.js .reveal{opacity:0;transform:translateY(14px);transition:opacity .5s ease,transform .5s ease}
.js .reveal.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  .js .reveal{opacity:1;transform:none;transition:none}
  .btn:hover,a.card:hover{transform:none}
}
@media print{
  .site-head,.callbar,.btn-row,.quote,.nav{display:none}
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
    n.addEventListener("click",function(e){if(e.target.tagName==="A")n.classList.remove("open")});
  }
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

  /* ---- lead form ---- */
  var form=document.getElementById("quote-form");
  if(!form)return;
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
    .map(h => `${h.days.replace(/,/g, " ")} ${h.opens}&ndash;${h.closes}`)
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
