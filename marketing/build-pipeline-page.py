#!/usr/bin/env python3
"""Build marketing/out/pipeline.html, the outreach pipeline board artifact.

Embeds the top-60 prospect list with personalized email drafts and call scripts;
statuses and notes persist via the artifact db capability.
Run from repo root after generate-outreach.py.
"""
import csv, json, re, html

rows = list(csv.DictReader(open("research/permit-census/out/prospects.csv")))

def clean_name(raw):
    if "/" in raw:
        head, tail = raw.split("/", 1)
        if not re.search(r"\b(INC|LLC|CORP|POOL|SPA)\b", tail.upper()) and len(head) >= 8:
            raw = head
    name = raw.strip().title()
    for a, b in [("Llc", "LLC"), ("Inc.", "Inc"), ("'S", "'s"), ("Of ", "of "), ("And ", "and ")]:
        name = name.replace(a, b)
    return re.sub(r"[,.]+$", "", name)

def counties_of(juris):
    seen = []
    for part in juris.split("; "):
        j = part.rpartition(":")[0]
        c = ("Hillsborough" if ("Hillsborough" in j or j == "Tampa") else
             "Pasco" if "Pasco" in j else
             "Pinellas" if ("Pinellas" in j or "Clearwater" in j or "St Pete" in j) else None)
        if c and c not in seen:
            seen.append(c)
    return seen

prospects = []
for r in rows:
    n = int(r["permits_24mo"])
    name = clean_name(r["contractor"])
    counties = counties_of(r["jurisdictions"])
    cty = (counties[0] if len(counties) == 1
           else " and ".join(counties) if len(counties) == 2
           else ", ".join(counties[:-1]) + ", and " + counties[-1])
    per_mo = n / 24
    pace = (f"about {per_mo:.0f} pools a month" if per_mo >= 1.5
            else "better than a pool a month" if n >= 24
            else f"{n} pools in two years")
    stat = f"{n} residential pool permits across {cty} in the last 24 months"
    subject = f"{n} permits, {len(counties)} count{'ies' if len(counties) > 1 else 'y'}, one price book?"
    body = (f"Hi,\n\nPublic permit records show {name} pulled {stat}. That's {pace}, "
            f"which usually means several designers quoting at once"
            f"{' across county lines' if len(counties) > 1 else ''}.\n\n"
            "I'm building Pool Forge, design and quoting software made for exactly that shop: "
            "draw the pool over a satellite image of the customer's yard, your price book prices it "
            "while you draw, and a clean quote PDF comes out the other end.\n\n"
            "I'm onboarding ten Tampa Bay builders as founding beta users. Free during beta, "
            "set up hands-on, and the roadmap gets shaped by your quoting workflow.\n\n"
            "Worth a 15-minute look this week?\n\nBilly\nPool Forge, Tampa\npool-forge.com")
    opener = (f'"Hi, this is Billy, I build software for pool builders here in Tampa. '
              f'I was going through county permit records and {name} came up with {stat}. '
              f'Who does the design and quoting when a lead comes in?"')
    prospects.append({
        "id": f"p{int(r['rank']):03d}", "rank": int(r["rank"]), "name": name,
        "permits": n, "phone": r["phones"], "email": r["email"],
        "counties": " · ".join(counties), "lic": r["licenses"],
        "subject": subject, "body": body, "opener": opener,
    })

data = json.dumps(prospects).replace("</", "<\\/")

page = """<title>Beta Outreach Pipeline</title>
<style>
:root {
  --paper:#FAF9F5; --ink:#141413; --slate:#697485; --hairline:#D2D9E2;
  --accent:#00B6FF; --tint:#E5F4FF; --surface:#FFFFFF;
  --green:#24CB71; --orange:#FF7237; --purple:#874FFF;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper:#141413; --ink:#FAF9F5; --slate:#9AA4B2; --hairline:#33363B;
    --accent:#00B6FF; --tint:#0E2A3A; --surface:#1C1D1F;
  }
}
:root[data-theme="dark"] {
  --paper:#141413; --ink:#FAF9F5; --slate:#9AA4B2; --hairline:#33363B;
  --accent:#00B6FF; --tint:#0E2A3A; --surface:#1C1D1F;
}
* { box-sizing:border-box; }
body { background:var(--paper); color:var(--ink); margin:0;
  font-family:"Archivo","SF Pro Display",system-ui,helvetica,sans-serif; font-size:14px; line-height:1.5; }
.mono { font-family:"Spline Sans Mono","SF Mono",menlo,monospace; font-variant-numeric:tabular-nums; }
main { max-width:1020px; margin:0 auto; padding:40px 24px 80px; }
.eyebrow { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--slate); font-weight:600; }
h1 { font-size:clamp(26px,4vw,36px); font-weight:700; letter-spacing:-0.02em; margin:6px 0 4px; }
.dek { color:var(--slate); margin:0 0 20px; max-width:70ch; }
#banner { display:none; background:var(--tint); border:1px solid var(--hairline); border-radius:6px;
  padding:10px 14px; margin-bottom:16px; font-size:13px; }
.funnel { display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:1px;
  background:var(--hairline); border:1px solid var(--hairline); border-radius:6px; overflow:hidden; margin-bottom:22px; }
.fcell { background:var(--surface); padding:10px 14px; cursor:pointer; border:none; text-align:left;
  font:inherit; color:inherit; }
.fcell.active { background:var(--tint); }
.fnum { font-size:22px; font-weight:700; }
.flabel { font-size:11px; color:var(--slate); letter-spacing:.08em; text-transform:uppercase; }
.toolbar { display:flex; gap:10px; margin-bottom:14px; }
#search { flex:1; max-width:340px; padding:8px 12px; border:1px solid var(--hairline); border-radius:6px;
  background:var(--surface); color:var(--ink); font:inherit; }
.card { border:1px solid var(--hairline); border-radius:6px; background:var(--surface); margin-bottom:8px; }
.chead { display:grid; grid-template-columns:34px 1fr auto; gap:10px; padding:10px 14px; align-items:center;
  cursor:pointer; }
.chead:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }
.rk { color:var(--slate); font-size:12px; }
.cname { font-weight:600; }
.cmeta { color:var(--slate); font-size:12px; }
.statuschip { font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase;
  padding:3px 10px; border-radius:99px; border:1px solid var(--hairline); color:var(--slate); white-space:nowrap; }
.s-emailed .statuschip { color:var(--accent); border-color:var(--accent); }
.s-called .statuschip { color:var(--purple); border-color:var(--purple); }
.s-demo .statuschip { color:var(--orange); border-color:var(--orange); }
.s-beta .statuschip { background:var(--green); border-color:var(--green); color:#FFFFFF; }
.s-passed .statuschip { opacity:.55; text-decoration:line-through; }
.cbody { display:none; border-top:1px solid var(--hairline); padding:14px; }
.card.open .cbody { display:block; }
.row2 { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; }
.chip { font:inherit; font-size:12px; padding:6px 12px; border-radius:6px; border:1px solid var(--hairline);
  background:var(--surface); color:var(--ink); cursor:pointer; text-decoration:none; display:inline-block; }
.chip:hover { background:var(--tint); }
.chip.set { background:var(--ink); color:var(--paper); border-color:var(--ink); }
.contact { font-size:13px; margin-bottom:10px; }
.contact a { color:var(--accent); text-decoration:none; }
.script { background:var(--paper); border:1px solid var(--hairline); border-radius:6px; padding:10px 12px;
  font-size:12.5px; color:var(--slate); white-space:pre-wrap; margin-bottom:10px; }
textarea.note { width:100%; min-height:52px; padding:8px 10px; border:1px solid var(--hairline);
  border-radius:6px; background:var(--paper); color:var(--ink); font:inherit; font-size:13px; resize:vertical; }
footer { margin-top:32px; color:var(--slate); font-size:12px; border-top:1px solid var(--hairline); padding-top:14px; }
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700&family=Spline+Sans+Mono&display=swap">
<main>
  <div class="eyebrow">Pool Forge · founding beta, ten seats</div>
  <h1>Beta Outreach Pipeline</h1>
  <p class="dek">Top 60 Tampa Bay pool builders by 24-month permit volume, with contact info from their own
  permit filings. Click a company for its personalized email draft and call script. Status and notes save live.</p>
  <div id="banner">Live saving is unavailable in this view. You can browse, but status changes will not persist.</div>
  <div class="funnel" id="funnel"></div>
  <div class="toolbar"><input id="search" type="search" placeholder="Search company, phone, email"></div>
  <div id="list"></div>
  <footer>Data: county permit records Sep 2024 to Aug 2026 · pipeline source: marketing/ in the Pool Forge repo ·
  full census: research/permit-census/out/contractor-census.csv</footer>
</main>
<script id="pdata" type="application/json">__DATA__</script>
<script>
const PROSPECTS = JSON.parse(document.getElementById("pdata").textContent);
const STATUSES = ["new","emailed","called","demo","beta","passed"];
const LABELS = {new:"Not contacted",emailed:"Emailed",called:"Called",demo:"Demo booked",beta:"Beta",passed:"Passed"};
let state = {};          // id -> {status, note}
let db = null;
let filter = "all";
let q = "";

const $ = (s, el) => (el || document).querySelector(s);
const esc = s => s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function stOf(id) { return (state[id] && state[id].status) || "new"; }

function renderFunnel() {
  const counts = {all: PROSPECTS.length};
  STATUSES.forEach(s => counts[s] = 0);
  PROSPECTS.forEach(p => counts[stOf(p.id)]++);
  $("#funnel").innerHTML = ["all", ...STATUSES].map(s =>
    `<button class="fcell ${filter===s?"active":""}" data-f="${s}">
       <div class="fnum mono">${counts[s]}${s==="beta"?" / 10":""}</div>
       <div class="flabel">${s==="all"?"All":LABELS[s]}</div></button>`).join("");
}

function cardHTML(p) {
  const st = stOf(p.id);
  const note = (state[p.id] && state[p.id].note) || "";
  const mailto = p.email ? `mailto:${p.email}?subject=${encodeURIComponent(p.subject)}&body=${encodeURIComponent(p.body)}` : null;
  return `<div class="card s-${st}" id="${p.id}">
    <div class="chead" tabindex="0" role="button" aria-expanded="false">
      <span class="rk mono">${p.rank}</span>
      <span><span class="cname">${esc(p.name)}</span>
        <span class="cmeta"> · ${p.permits} permits · ${esc(p.counties)}</span></span>
      <span class="statuschip">${LABELS[st]}</span>
    </div>
    <div class="cbody">
      <div class="contact">
        ${p.phone ? `<a href="tel:${p.phone.split(" / ")[0].replace(/[^\\d]/g,"")}">${esc(p.phone)}</a> · ` : ""}
        ${p.email ? `<a href="${mailto}">${esc(p.email)}</a>` : "<em>no contact on permits, look up</em>"}
        <span class="cmeta"> · ${esc(p.lic)}</span>
      </div>
      <div class="row2">
        ${STATUSES.map(s => `<button class="chip ${st===s?"set":""}" data-set="${s}">${LABELS[s]}</button>`).join("")}
      </div>
      <div class="row2">
        ${mailto ? `<a class="chip" href="${mailto}">Open email draft</a>` : ""}
        <button class="chip" data-copy="body">Copy email text</button>
        <button class="chip" data-copy="opener">Copy call opener</button>
      </div>
      <div class="script">${esc(p.opener)}</div>
      <textarea class="note" placeholder="Notes (who you talked to, objections, next step)">${esc(note)}</textarea>
    </div>
  </div>`;
}

function renderList() {
  const ql = q.toLowerCase();
  const vis = PROSPECTS.filter(p =>
    (filter === "all" || stOf(p.id) === filter) &&
    (!ql || (p.name + p.phone + p.email).toLowerCase().includes(ql)));
  $("#list").innerHTML = vis.map(cardHTML).join("") ||
    '<p class="cmeta">Nothing matches.</p>';
}

function render() { renderFunnel(); renderList(); }

async function save(id) {
  if (!db) return;
  const body = {status: stOf(id), note: (state[id] && state[id].note) || "",
                updatedAt: new Date().toISOString()};
  try { await db.doc("prospects/" + id).set(body); } catch (e) { /* last-writer-wins; ignore */ }
}

document.addEventListener("click", e => {
  const f = e.target.closest("[data-f]");
  if (f) { filter = f.dataset.f; render(); return; }
  const setBtn = e.target.closest("[data-set]");
  if (setBtn) {
    const id = setBtn.closest(".card").id;
    state[id] = Object.assign({}, state[id], {status: setBtn.dataset.set});
    save(id); render();
    const card = $("#" + id); if (card) card.classList.add("open");
    return;
  }
  const copyBtn = e.target.closest("[data-copy]");
  if (copyBtn) {
    const id = copyBtn.closest(".card").id;
    const p = PROSPECTS.find(x => x.id === id);
    navigator.clipboard.writeText(copyBtn.dataset.copy === "body" ? p.subject + "\\n\\n" + p.body : p.opener);
    copyBtn.textContent = "Copied"; setTimeout(() => render(), 900);
    return;
  }
  const head = e.target.closest(".chead");
  if (head) head.parentElement.classList.toggle("open");
});
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.classList.contains("chead"))
    e.target.parentElement.classList.toggle("open");
});
document.addEventListener("input", e => { if (e.target.id === "search") { q = e.target.value; renderList(); } });
document.addEventListener("change", e => {
  if (e.target.classList.contains("note")) {
    const id = e.target.closest(".card").id;
    state[id] = Object.assign({}, state[id], {note: e.target.value});
    save(id);
  }
});

render();
claude.use("db").then(d => {
  db = d;
  if (!db) { $("#banner").style.display = "block"; return; }
  db.collection("prospects").onSnapshot(snap => {
    const open = new Set([...document.querySelectorAll(".card.open")].map(c => c.id));
    snap.docs.forEach(doc => { if (doc.exists) state[doc.id] = doc.data(); });
    render();
    open.forEach(id => { const c = document.getElementById(id); if (c) c.classList.add("open"); });
  }, () => { $("#banner").style.display = "block"; });
});
</script>
"""
page = page.replace("__DATA__", data)
import os
os.makedirs("marketing/out", exist_ok=True)
open("marketing/out/pipeline.html", "w").write(page)
print("wrote marketing/out/pipeline.html", len(page), "bytes")
