// ─────────────────────────────────────────────
//  Zaapi Weekly Dashboard · app.js
// ─────────────────────────────────────────────

const FOREX_DEFAULT = 34;
let spendChart = null;
let ftiChart = null;
let outcomeChart = null;
let efficiencyChart = null;
let selectedRange = "L4W";
let selectedRegion = "Global";


function readStoredForexRate() {
  const raw = localStorage.getItem("zaapi_forex_rate");
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toUSD(thb, rate) {
  return thb / rate;
}

function fmtUSD(thb, rate) {
  const usd = toUSD(thb, rate);
  if (usd >= 1000) return "$" + (usd / 1000).toFixed(1) + "k";
  return "$" + Math.round(usd).toLocaleString();
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

function renderState(data) {
  const el = document.getElementById("state-badge");
  const label = document.getElementById("state-label");

  const map = {
    Improving: { cls: "state-improving", icon: "↑" },
    Flat: { cls: "state-flat", icon: "→" },
    Blocked: { cls: "state-blocked", icon: "!" }
  };

  const s = map[data.state] || map.Flat;
  el.className = "state-badge " + s.cls;
  el.querySelector(".state-icon").textContent = s.icon;
  label.textContent = data.state;
}

function renderSnapshot(data) {
  const rate = data.forex_rate || FOREX_DEFAULT;
  const s = data.snapshot;

  const cpfti = s.fti > 0 ? toUSD(s.spend_thb, rate) / s.fti : null;
  const cpftiPrev = s.fti_prev > 0 ? toUSD(s.spend_prev_thb, rate) / s.fti_prev : null;
  const cpftiUSD = cpfti ? "$" + Math.round(cpfti).toLocaleString() : "—";

  const cards = [
    {
      label: "Spend",
      value: fmtUSD(s.spend_thb, rate),
      sub: "prev " + fmtUSD(s.spend_prev_thb, rate),
      wow: fmtWoW(calculateWoW(s.spend_thb, s.spend_prev_thb)),
      note: "Google + Meta combined"
    },
    {
      label: "FTI",
      value: s.fti !== null ? s.fti : "—",
      sub: "prev " + (s.fti_prev !== null ? s.fti_prev : "—"),
      wow: fmtWoW(calculateWoW(s.fti, s.fti_prev)),
      note: "cost/FTI " + cpftiUSD
    },
    {
      label: "Qualified",
      value: s.qualified !== null ? s.qualified : "—",
      sub: s.qualified_prev !== null ? "prev " + s.qualified_prev : "incl. organic",
      wow: fmtWoW(calculateWoW(s.qualified, s.qualified_prev)),
      note: "enter from Pipedrive"
    },
    {
      label: "HQ+",
      value: s.hq !== null ? s.hq : "—",
      sub: s.hq_prev !== null ? "prev " + s.hq_prev : "main goal",
      wow: fmtWoW(calculateWoW(s.hq, s.hq_prev)),
      note: "enter from Pipedrive"
    }
  ];

  const grid = document.getElementById("snapshot-grid");
  grid.innerHTML = cards.map(c => `
    <div class="card">
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

function renderTable(data) {
  const rate = data.forex_rate || FOREX_DEFAULT;
  const s = data.snapshot;

  const cpfti = s.fti > 0 ? toUSD(s.spend_thb, rate) / s.fti : null;
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

function renderInsights(data) {
  const list = document.getElementById("insights-list");
  list.innerHTML = data.insights.map((txt, i) => `
    <li class="insight-item">
      <span class="insight-num">${i + 1}</span>
      <span>${txt}</span>
    </li>
  `).join("");
}

function renderNextStep(data) {
  const ns = data.next_step;
  const el = document.getElementById("next-step-text");
  el.textContent = typeof ns === "string" ? ns : ns.label;
}

function buildChart(ctx, labels, datasets, yAsCurrency = false) {
  return new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: value => yAsCurrency ? "$" + value : value
          }
        }
      },
      plugins: {
        legend: { position: "bottom" }
      }
    }
  });
}

function getFilteredHistory(history, range) {
  const ranges = { L4W: 4, L8W: 8, L12W: 12 };
  const windowSize = ranges[range];
  if (!windowSize || range === "MAX") return history;
  return history.slice(-windowSize);
}

function renderGraphs(data) {
  if (typeof Chart === "undefined") return;
  const rate = data.forex_rate || FOREX_DEFAULT;
  const regionHistoryMap = data.history_by_region || {};
  const baseHistory = selectedRegion === "Global"
    ? (Array.isArray(data.history) ? data.history : [])
    : (Array.isArray(regionHistoryMap[selectedRegion]) ? regionHistoryMap[selectedRegion] : []);
  const history = getFilteredHistory(baseHistory, selectedRange);
  const labels = history.map(h => h.week);

  const buildDatasets = rows => ({
    ads: {
      spend: [
        { label: "Spend", data: rows.map(h => typeof h.spend === "number" ? h.spend / rate : null), borderColor: "#2d7ff9", backgroundColor: "#2d7ff9", borderWidth: 2, pointRadius: 2, pointHoverRadius: 4, tension: 0.15 },
        { label: "Spend Target", data: rows.map(h => typeof h.spend_target === "number" ? h.spend_target / rate : null), borderColor: "#5aa1ff", backgroundColor: "#5aa1ff", borderWidth: 2, borderDash: [5, 4], pointRadius: 1.5, pointHoverRadius: 3, tension: 0.15 }
      ],
      fti: [
        { label: "FTI", data: rows.map(h => h.fti), borderColor: "#0f9e75", backgroundColor: "#0f9e75", borderWidth: 2, pointRadius: 2, pointHoverRadius: 4, tension: 0.15 },
        { label: "FTI Google", data: rows.map(h => typeof h.fti_google === "number" ? h.fti_google : null), borderColor: "#4ac39e", backgroundColor: "#4ac39e", borderWidth: 2, pointRadius: 1.5, pointHoverRadius: 3, tension: 0.15 },
        { label: "FTI Meta", data: rows.map(h => typeof h.fti_meta === "number" ? h.fti_meta : null), borderColor: "#79d6bb", backgroundColor: "#79d6bb", borderWidth: 2, pointRadius: 1.5, pointHoverRadius: 3, tension: 0.15 }
      ]
    },
    business: {
      outcome: [
        { label: "Qualified", data: rows.map(h => h.qualified), borderColor: "#ff8a00", backgroundColor: "#ff8a00", borderWidth: 2, pointRadius: 2, pointHoverRadius: 4, tension: 0.15 },
        { label: "HQ+", data: rows.map(h => h.hq), borderColor: "#8d5cf6", backgroundColor: "#8d5cf6", borderWidth: 2, pointRadius: 2, pointHoverRadius: 4, tension: 0.15 }
      ],
      efficiency: [
        { label: "Cost per FTI", data: rows.map(h => typeof h.cost_per_fti === "number" ? h.cost_per_fti / rate : null), borderColor: "#2d7ff9", backgroundColor: "#2d7ff9", borderWidth: 2, pointRadius: 2, pointHoverRadius: 4, tension: 0.15 },
        { label: "Cost per Qualified", data: rows.map(h => typeof h.cost_per_qualified === "number" ? h.cost_per_qualified / rate : null), borderColor: "#ff8a00", backgroundColor: "#ff8a00", borderWidth: 2, pointRadius: 2, pointHoverRadius: 4, tension: 0.15 },
        { label: "Cost per HQ+", data: rows.map(h => typeof h.cost_per_hq === "number" ? h.cost_per_hq / rate : null), borderColor: "#8d5cf6", backgroundColor: "#8d5cf6", borderWidth: 2, pointRadius: 2, pointHoverRadius: 4, tension: 0.15 }
      ]
    }
  });

  const datasets = buildDatasets(history);

  if (spendChart) spendChart.destroy();
  if (ftiChart) ftiChart.destroy();
  if (outcomeChart) outcomeChart.destroy();
  if (efficiencyChart) efficiencyChart.destroy();

  spendChart = buildChart(document.getElementById("spend-chart"), labels, datasets.ads.spend, true);
  ftiChart = buildChart(document.getElementById("fti-chart"), labels, datasets.ads.fti, false);
  outcomeChart = buildChart(document.getElementById("outcome-chart"), labels, datasets.business.outcome, false);
  efficiencyChart = buildChart(document.getElementById("efficiency-chart"), labels, datasets.business.efficiency, true);
}

function setupGraphFilters(data) {
  const timeButtons = Array.from(document.querySelectorAll("#time-range-controls [data-range]"));
  const regionButtons = Array.from(document.querySelectorAll("#region-controls [data-region]"));

  const markActive = (buttons, currentValue, key) => {
    buttons.forEach(btn => {
      const isActive = btn.dataset[key] === currentValue;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", String(isActive));
    });
  };

  markActive(timeButtons, selectedRange, "range");
  markActive(regionButtons, selectedRegion, "region");

  timeButtons.forEach(btn => {
    if (btn.dataset.bound === "true") return;
    btn.dataset.bound = "true";
    btn.addEventListener("click", () => {
      selectedRange = btn.dataset.range || "L4W";
      markActive(timeButtons, selectedRange, "range");
      renderGraphs(data);
    });
  });

  regionButtons.forEach(btn => {
    if (btn.dataset.bound === "true") return;
    btn.dataset.bound = "true";
    btn.addEventListener("click", () => {
      selectedRegion = btn.dataset.region || "Global";
      markActive(regionButtons, selectedRegion, "region");
      renderGraphs(data);
    });
  });
}

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

  data.forex_rate = readStoredForexRate() || data.forex_rate || FOREX_DEFAULT;

  renderState(data);
  renderSnapshot(data);
  renderTable(data);
  renderRegions(data);
  renderInsights(data);
  renderNextStep(data);
  setupGraphFilters(data);
  renderGraphs(data);

  window.addEventListener("zaapi:forex-change", (event) => {
    const nextRate = parseFloat(event.detail?.rate);
    data.forex_rate = Number.isFinite(nextRate) && nextRate > 0 ? nextRate : FOREX_DEFAULT;
    renderSnapshot(data);
    renderTable(data);
    renderRegions(data);
    renderGraphs(data);
  });
}

document.addEventListener("DOMContentLoaded", init);
