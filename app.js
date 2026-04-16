// ─────────────────────────────────────────────
//  Zaapi Weekly Dashboard · app.js
//  Vanilla JS · no frameworks · no build step
// ─────────────────────────────────────────────

const FOREX_DEFAULT = 34;

// ── Utilities ────────────────────────────────

function toUSD(thb, rate) {
  return thb / rate;
}

function fmtUSD(thb, rate) {
  const usd = toUSD(thb, rate);
  if (usd >= 1000) return "$" + (usd / 1000).toFixed(1) + "k";
  return "$" + Math.round(usd).toLocaleString();
}

function fmtCPA(spendTHB, fti, rate) {
  if (!fti || fti === 0) return "—";
  return "$" + Math.round(toUSD(spendTHB, rate) / fti).toLocaleString();
}

function calculateWoW(current, previous) {
  if (previous === null || previous === undefined || previous === 0) return null;
  if (current === null || current === undefined) return null;
  return ((current - previous) / previous) * 100;
}

function fmtWoW(pct, invert) {
  if (pct === null) return { text: "—", cls: "neutral" };
  const improved = invert ? pct < 0 : pct > 0;
  const flat = Math.abs(pct) < 1;
  const sign = pct > 0 ? "+" : "";
  return {
    text: sign + pct.toFixed(0) + "%",
    cls: flat ? "neutral" : improved ? "up" : "down"
  };
}

function fmtVal(val, isCurrency, spendTHB, rate) {
  if (val === null || val === undefined) return "—";
  if (isCurrency) return fmtUSD(val, rate);
  return val.toLocaleString();
}

// ── State badge ──────────────────────────────

function renderState(data) {
  const el = document.getElementById("state-badge");
  const label = document.getElementById("state-label");
  const week = document.getElementById("week-label");

  const map = {
    Improving: { cls: "state-improving", icon: "↑" },
    Flat:      { cls: "state-flat",      icon: "→" },
    Blocked:   { cls: "state-blocked",   icon: "!" }
  };

  const s = map[data.state] || map["Flat"];
  el.className = "state-badge " + s.cls;
  el.querySelector(".state-icon").textContent = s.icon;
  label.textContent = data.state;
  week.textContent = data.week + "  ·  prev: " + data.week_prev;
}

// ── Snapshot cards ───────────────────────────

function renderSnapshot(data) {
  const rate = data.forex_rate || FOREX_DEFAULT;
  const s = data.snapshot;

  const cpfti     = s.fti > 0 ? toUSD(s.spend_thb, rate) / s.fti : null;
  const cpftiPrev = s.fti_prev > 0 ? toUSD(s.spend_prev_thb, rate) / s.fti_prev : null;
  const cpftiUSD  = cpfti ? "$" + Math.round(cpfti).toLocaleString() : "—";
  const cpftiPrevUSD = cpftiPrev ? "$" + Math.round(cpftiPrev).toLocaleString() : "—";

  const wSpend = fmtWoW(calculateWoW(s.spend_thb, s.spend_prev_thb));
  const wFTI   = fmtWoW(calculateWoW(s.fti, s.fti_prev));
  const wCPA   = fmtWoW(calculateWoW(cpfti, cpftiPrev), true); // invert: lower CPA = better

  const cards = [
    {
      id: "card-spend",
      label: "Spend",
      value: fmtUSD(s.spend_thb, rate),
      sub: "prev " + fmtUSD(s.spend_prev_thb, rate),
      wow: wSpend,
      note: "Google + Meta combined"
    },
    {
      id: "card-fti",
      label: "FTI",
      value: s.fti !== null ? s.fti : "—",
      sub: "prev " + (s.fti_prev !== null ? s.fti_prev : "—"),
      wow: wFTI,
      note: "cost/FTI " + cpftiUSD
    },
    {
      id: "card-qualified",
      label: "Qualified",
      value: s.qualified !== null ? s.qualified : "—",
      sub: s.qualified_prev !== null ? "prev " + s.qualified_prev : "incl. organic",
      wow: fmtWoW(calculateWoW(s.qualified, s.qualified_prev)),
      note: "enter from Pipedrive"
    },
    {
      id: "card-hq",
      label: "HQ+",
      value: s.hq !== null ? s.hq : "—",
      sub: s.hq_prev !== null ? "prev " + s.hq_prev : "main goal",
      wow: fmtWoW(calculateWoW(s.hq, s.hq_prev)),
      note: "enter from Pipedrive"
    }
  ];

  const grid = document.getElementById("snapshot-grid");
  grid.innerHTML = cards.map(c => `
    <div class="card" id="${c.id}">
      <div class="card-label">${c.label}</div>
      <div class="card-value">${c.value}</div>
      <div class="card-row">
        <span class="card-sub">${c.sub}</span>
        <span class="wow ${c.wow.cls}">${c.wow.text}</span>
      </div>
      <div class="card-note">${c.note}</div>
    </div>
  `).join("");
}

// ── WoW table ────────────────────────────────

function renderTable(data) {
  const rate = data.forex_rate || FOREX_DEFAULT;
  const s = data.snapshot;

  const cpfti     = s.fti > 0 ? toUSD(s.spend_thb, rate) / s.fti : null;
  const cpftiPrev = s.fti_prev > 0 ? toUSD(s.spend_prev_thb, rate) / s.fti_prev : null;

  const rows = [
    {
      metric: "Spend (combined)",
      cur: fmtUSD(s.spend_thb, rate),
      prev: fmtUSD(s.spend_prev_thb, rate),
      wow: fmtWoW(calculateWoW(s.spend_thb, s.spend_prev_thb))
    },
    {
      metric: "FTI",
      cur: s.fti !== null ? s.fti : "—",
      prev: s.fti_prev !== null ? s.fti_prev : "—",
      wow: fmtWoW(calculateWoW(s.fti, s.fti_prev))
    },
    {
      metric: "Cost / FTI",
      cur: cpfti ? "$" + Math.round(cpfti).toLocaleString() : "—",
      prev: cpftiPrev ? "$" + Math.round(cpftiPrev).toLocaleString() : "—",
      wow: fmtWoW(calculateWoW(cpfti, cpftiPrev), true)
    },
    {
      metric: "Qualified",
      cur: s.qualified !== null ? s.qualified : "—",
      prev: s.qualified_prev !== null ? s.qualified_prev : "—",
      wow: fmtWoW(calculateWoW(s.qualified, s.qualified_prev))
    },
    {
      metric: "HQ+",
      cur: s.hq !== null ? s.hq : "—",
      prev: s.hq_prev !== null ? s.hq_prev : "—",
      wow: fmtWoW(calculateWoW(s.hq, s.hq_prev))
    }
  ];

  const tbody = document.getElementById("wow-tbody");
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td class="metric-col">${r.metric}</td>
      <td class="num-col">${r.cur}</td>
      <td class="num-col muted">${r.prev}</td>
      <td class="num-col"><span class="wow ${r.wow.cls}">${r.wow.text}</span></td>
    </tr>
  `).join("");
}

// ── Region table ─────────────────────────────

function renderRegions(data) {
  const rate = data.forex_rate || FOREX_DEFAULT;
  const tbody = document.getElementById("region-tbody");

  tbody.innerHTML = data.region_spend.map(r => {
    const total = r.google + r.meta;
    const isHigh = r.lost_is_rank > 50;
    return `
      <tr>
        <td class="metric-col"><strong>${r.region}</strong></td>
        <td class="num-col">${fmtUSD(total, rate)}</td>
        <td class="num-col muted">${fmtUSD(r.google, rate)}</td>
        <td class="num-col muted">${fmtUSD(r.meta, rate)}</td>
        <td class="num-col">${r.fti > 0 ? r.fti.toFixed(1) : "—"}</td>
        <td class="num-col"><span class="${isHigh ? "tag-high" : "tag-low"}">${r.lost_is_rank.toFixed(0)}%</span></td>
      </tr>
    `;
  }).join("");
}

// ── Insights ─────────────────────────────────

function renderInsights(data) {
  const list = document.getElementById("insights-list");
  list.innerHTML = data.insights.map((txt, i) => `
    <li class="insight-item">
      <span class="insight-num">${i + 1}</span>
      <span>${txt}</span>
    </li>
  `).join("");
}

// ── Next step ────────────────────────────────

function renderNextStep(data) {
  const ns = data.next_step;
  const el = document.getElementById("next-step-text");
  el.textContent = typeof ns === "string" ? ns : ns.label;
}

// ── Boot ─────────────────────────────────────

async function init() {
  let data;
  try {
    const res = await fetch("data.json");
    data = await res.json();
  } catch (e) {
    document.body.innerHTML = `<div style="padding:2rem;font-family:monospace;color:#c00">
      Failed to load data.json — make sure it's in the same folder as index.html.<br>${e}
    </div>`;
    return;
  }

  renderState(data);
  renderSnapshot(data);
  renderTable(data);
  renderRegions(data);
  renderInsights(data);
  renderNextStep(data);

  document.getElementById("forex-rate").value = data.forex_rate || FOREX_DEFAULT;
  document.getElementById("forex-rate").addEventListener("input", () => {
    data.forex_rate = parseFloat(document.getElementById("forex-rate").value) || FOREX_DEFAULT;
    renderSnapshot(data);
    renderTable(data);
    renderRegions(data);
  });
}

document.addEventListener("DOMContentLoaded", init);
