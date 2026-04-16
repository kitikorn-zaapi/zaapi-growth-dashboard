// ─────────────────────────────────────────────
//  Zaapi · Search Diagnosis · search.js
//  Standalone page — reads data.json
// ─────────────────────────────────────────────

const FOREX_DEFAULT = 34;

// ── State ─────────────────────────────────────
let selectedRegion = "Global";
let selectedRange  = "L4W";
let appData        = null;
let perfChart      = null;
let capChart       = null;

// ── Weekly log (hardcoded, updated manually) ──
const WEEKLY_LOG = [
  {
    week:       "CW13-2026",
    region:     "TH",
    signal:     "FTI collapsed 4.6 — AI Max at 48% of spend",
    suggestion: "Pause AI Max, revert match types",
    action:     "Paused AI Max, added negative keywords",
    result:     "good",
    learning:   "AI Max expansion caused FTI collapse. Device targeting triggers over-expansion."
  },
  {
    week:       "CW14-2026",
    region:     "TH",
    signal:     "FTI recovering 9.2, IS up 24→42%",
    suggestion: "Hold — wait for 2-week signal confirmation",
    action:     "Held budget, monitored IS",
    result:     "good",
    learning:   "IS recovery confirmed. Holding was correct — prevented premature scaling."
  },
  {
    week:       "CW15-2026",
    region:     "TH",
    signal:     "FTI up +144% WoW (9→22), Lost IS 58%",
    suggestion: "Scale TH Search +10%",
    action:     "Scaled TH main campaign +10%",
    result:     "pending",
    learning:   "—"
  },
  {
    week:       "CW14-2026",
    region:     "SEA",
    signal:     "IS 42%, 0 FTI — campaign in learning",
    suggestion: "Hold — rotate creatives, add negatives",
    action:     "Rotated ad creatives, added 12 negatives",
    result:     "mixed",
    learning:   "SEA needs longer learning window. Creative rotation improved CTR but FTI still low."
  },
  {
    week:       "CW14-2026",
    region:     "ROW",
    signal:     "IS 12%, Lost IS 87%, 0 FTI for 5 weeks",
    suggestion: "Reset — rebuild with 3 exact match KWs",
    action:     "Paused campaign, rebuilt with exact match",
    result:     "pending",
    learning:   "—"
  },
  {
    week:       "CW11-2026",
    region:     "TH",
    signal:     "Spend surge +36% WoW, FTI flat 14.7",
    suggestion: "Reduce spend — efficiency deteriorating",
    action:     "No action taken (missed signal)",
    result:     "bad",
    learning:   "Spend increased without FTI response. Should have reduced or held. Cost/FTI hit 24,660 THB."
  },
  {
    week:       "CW08-2025",
    region:     "Global",
    signal:     "FTI spike 1109 — likely data anomaly",
    suggestion: "Investigate before scaling",
    action:     "Investigated — Windsor FTI inflation confirmed",
    result:     "good",
    learning:   "Windsor ad group reports inflate FTI ~3×. Always use Google Ads CSV for FTI source of truth."
  }
];

// ── Utilities ─────────────────────────────────


function readStoredForexRate() {
  const raw = localStorage.getItem("zaapi_forex_rate");
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toUSD(thb, rate) {
  return thb / rate;
}

function getFilteredHistory(history, range) {
  if (!Array.isArray(history) || !history.length) return [];
  const windows = { L4W: 4, L8W: 8, L12W: 12 };
  const n = windows[range];
  if (!n) return history;
  return history.slice(-n);
}

function getHistory(data) {
  const rate = data.forex_rate || FOREX_DEFAULT;
  let base;
  if (selectedRegion === "Global") {
    base = Array.isArray(data.history) ? data.history : [];
  } else {
    const byRegion = data.history_by_region || {};
    base = Array.isArray(byRegion[selectedRegion]) ? byRegion[selectedRegion] : [];
    // Fallback to global if region has no data
    if (!base.length) base = Array.isArray(data.history) ? data.history : [];
  }
  return { rows: getFilteredHistory(base, selectedRange), rate };
}

// ── Charts ────────────────────────────────────

function buildChart(ctx, labels, datasets, yLeftLabel, yRightLabel) {
  const scales = {
    x: {
      ticks: {
        font: { family: "'DM Mono', monospace", size: 10 },
        color: "#b0ada5",
        maxTicksLimit: 12,
        autoSkip: true
      },
      grid: { color: "#f0ede8" }
    },
    yLeft: {
      type: "linear",
      position: "left",
      beginAtZero: true,
      title: {
        display: !!yLeftLabel,
        text: yLeftLabel || "",
        font: { family: "'DM Mono', monospace", size: 10 },
        color: "#b0ada5"
      },
      ticks: {
        font: { family: "'DM Mono', monospace", size: 10 },
        color: "#b0ada5"
      },
      grid: { color: "#f0ede8" }
    }
  };

  if (yRightLabel) {
    scales.yRight = {
      type: "linear",
      position: "right",
      beginAtZero: true,
      title: {
        display: true,
        text: yRightLabel,
        font: { family: "'DM Mono', monospace", size: 10 },
        color: "#b0ada5"
      },
      ticks: {
        font: { family: "'DM Mono', monospace", size: 10 },
        color: "#b0ada5"
      },
      grid: { drawOnChartArea: false }
    };
  }

  return new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            font: { family: "'DM Mono', monospace", size: 10 },
            color: "#7a786f",
            boxWidth: 10,
            boxHeight: 10,
            padding: 12
          }
        },
        tooltip: {
          backgroundColor: "#1a1916",
          titleFont: { family: "'DM Mono', monospace", size: 10 },
          bodyFont:  { family: "'DM Mono', monospace", size: 10 },
          padding: 8
        }
      },
      scales
    }
  });
}

function renderPerfChart(rows, rate) {
  if (perfChart) { perfChart.destroy(); perfChart = null; }
  const ctx = document.getElementById("perf-chart");
  if (!rows.length) return;

  // Check if Google-only spend is available
  const hasSearchSpend = rows.some(r => typeof r.spend_google === "number");
  const spendLabel = hasSearchSpend ? "Search Spend (USD)" : "Total Spend (USD) ⚠";

  const labels = rows.map(r => r.week);
  const datasets = [
    {
      label: "FTI (Google)",
      data: rows.map(r => {
        // Use fti_google if available (Google-only), else fall back to total fti
        const v = typeof r.fti_google === "number" ? r.fti_google : r.fti;
        return v != null ? v : null;
      }),
      borderColor: "#0f9e75",
      backgroundColor: "#0f9e75",
      yAxisID: "yLeft",
      borderWidth: 2,
      pointRadius: 2,
      pointHoverRadius: 4,
      tension: 0.15,
      spanGaps: true
    },
    {
      label: "HQ+",
      data: rows.map(r => r.hq != null ? r.hq : null),
      borderColor: "#8d5cf6",
      backgroundColor: "#8d5cf6",
      yAxisID: "yLeft",
      borderWidth: 2,
      pointRadius: 2,
      pointHoverRadius: 4,
      tension: 0.15,
      spanGaps: true
    },
    {
      label: spendLabel,
      data: rows.map(r => {
        const s = hasSearchSpend ? r.spend_google : r.spend;
        return typeof s === "number" ? Math.round(toUSD(s, rate)) : null;
      }),
      borderColor: "#2d7ff9",
      backgroundColor: "#2d7ff9",
      yAxisID: "yRight",
      borderWidth: 2,
      borderDash: [4, 3],
      pointRadius: 1.5,
      pointHoverRadius: 3,
      tension: 0.15,
      spanGaps: true
    }
  ];

  perfChart = buildChart(ctx, labels, datasets, "Count", "Spend $");

  // Show note if using total spend as proxy
  if (!hasSearchSpend) {
    const note = document.getElementById("perf-note");
    if (note) note.textContent = "⚠ Search-only spend not available in data.json — showing combined Google + Meta spend. Add spend_google to history entries to fix.";
  }
}

// ── Capacity chart: Lost IS WoW per region ────
// Builds one line per region from history_by_region, using lost_is_rank field.
// For Global view: show TH, SEA, ROW as three separate lines on one chart.
// For single region: show just that region's Lost IS trend.
// Time window is the same as the performance chart.

function getRegionCapacityData(data) {
  const byRegion = data.history_by_region || {};
  const allRegions = ["TH", "SEA", "ROW"];
  const regions = selectedRegion === "Global" ? allRegions : [selectedRegion];

  // Collect filtered history per region
  const seriesMap = {};
  regions.forEach(reg => {
    const base = Array.isArray(byRegion[reg]) ? byRegion[reg] : [];
    seriesMap[reg] = getFilteredHistory(base, selectedRange);
  });

  // Build a unified sorted label set across all regions
  const weekSet = new Set();
  Object.values(seriesMap).forEach(rows => rows.forEach(r => weekSet.add(r.week)));
  const labels = Array.from(weekSet).sort((a, b) => {
    const parse = w => { const m = w.match(/CW(\d+)-(\d+)/); return m ? parseInt(m[2]) * 100 + parseInt(m[1]) : 0; };
    return parse(a) - parse(b);
  });

  // For each region build a value array aligned to labels
  const regionColors = { TH: "#0f9e75", SEA: "#2d7ff9", ROW: "#e24b4a" };

  const datasets = regions.map(reg => {
    const rowMap = {};
    seriesMap[reg].forEach(r => { rowMap[r.week] = r; });
    return {
      label: `${reg} Lost IS rank %`,
      data: labels.map(wk => {
        const r = rowMap[wk];
        return r && typeof r.lost_is_rank === "number" ? r.lost_is_rank : null;
      }),
      borderColor: regionColors[reg] || "#888",
      backgroundColor: regionColors[reg] || "#888",
      borderDash: [5, 4],
      borderWidth: 2,
      pointRadius: 2,
      pointHoverRadius: 4,
      tension: 0.15,
      spanGaps: true
    };
  });

  return { labels, datasets };
}

function renderCapChart(rows) {
  if (capChart) { capChart.destroy(); capChart = null; }
  const ctx = document.getElementById("cap-chart");
  const noteEl = document.getElementById("cap-note");

  // Current-week snapshot note
  if (appData && appData.region_spend) {
    const regs = selectedRegion === "Global"
      ? appData.region_spend
      : appData.region_spend.filter(r => r.region === selectedRegion);
    const parts = regs.map(r => {
      const h = r.lost_is_rank > 50 ? "↑ High headroom" : r.lost_is_rank > 30 ? "→ Limited" : "↓ Low headroom";
      return `${r.region} ${r.lost_is_rank}% ${h}`;
    }).join("  ·  ");
    noteEl.textContent = `Current week: ${parts}`;
  }

  const { labels, datasets } = getRegionCapacityData(appData);

  if (!labels.length) {
    noteEl.textContent += "  ·  No historical IS data in data.json yet.";
    return;
  }

  capChart = buildChart(ctx, labels, datasets, "Lost IS rank %", null);
}

// ── AI Suggestion (deterministic rule-based) ──

function generateSuggestion(data, rows) {
  if (!rows.length) {
    return { signal: "No data available.", action: "Load data first", confidence: "low" };
  }

  const last  = rows[rows.length - 1];
  const prev  = rows.length >= 2 ? rows[rows.length - 2] : null;
  const rate  = data.forex_rate || FOREX_DEFAULT;

  const ftiCur  = last.fti  || 0;
  const ftiPrev = prev ? (prev.fti  || 0) : 0;
  const hqCur   = last.hq   || 0;
  const hqPrev  = prev ? (prev.hq   || 0) : 0;
  const spendCur = last.spend || 0;

  const ftiWoW  = ftiPrev  > 0 ? ((ftiCur  - ftiPrev)  / ftiPrev)  * 100 : null;
  const hqWoW   = hqPrev   > 0 ? ((hqCur   - hqPrev)   / hqPrev)   * 100 : null;

  // Capacity: pull from region_spend snapshot
  const reg = selectedRegion === "Global" ? null : selectedRegion;
  let lostIS = null;
  if (data.region_spend) {
    const rd = reg
      ? data.region_spend.find(r => r.region === reg)
      : null;
    if (rd) lostIS = rd.lost_is_rank;
  }

  const signals = [];
  let action = "Hold — monitor next week";
  let confidence = "medium";

  // Build signals
  if (ftiWoW !== null) {
    const dir = ftiWoW > 0 ? `+${ftiWoW.toFixed(0)}%` : `${ftiWoW.toFixed(0)}%`;
    signals.push(`FTI ${dir} WoW (${ftiPrev}→${ftiCur})`);
  }
  if (hqWoW !== null) {
    const dir = hqWoW > 0 ? `+${hqWoW.toFixed(0)}%` : `${hqWoW.toFixed(0)}%`;
    signals.push(`HQ+ ${dir} WoW (${hqPrev}→${hqCur})`);
  }
  if (lostIS !== null) {
    signals.push(`Lost IS rank ${lostIS}%`);
  }

  // Decision logic (mirrors dashboard rule engine)
  const ftiOk   = ftiCur >= 5;
  const ftiUp   = ftiWoW !== null && ftiWoW > 20;
  const ftiDown = ftiWoW !== null && ftiWoW < -20;
  const hqUp    = hqWoW  !== null && hqWoW  > 0;
  const hasHeadroom = lostIS !== null ? lostIS > 50 : null;

  if (!ftiOk) {
    action = "Hold — FTI too low to scale";
    confidence = "high";
  } else if (ftiDown && hqWoW !== null && hqWoW < 0) {
    action = "Reduce spend — both FTI and HQ+ declining";
    confidence = "high";
  } else if (ftiUp && hqUp && hasHeadroom === true) {
    action = `Scale +10% — FTI and HQ+ both improving`;
    confidence = "high";
  } else if (ftiUp && hqUp && hasHeadroom === false) {
    action = "Hold — improving but no auction headroom";
    confidence = "medium";
  } else if (ftiUp && hasHeadroom === true) {
    action = "Scale +5% — FTI up, watch HQ+ this week";
    confidence = "medium";
  } else if (ftiDown) {
    action = "Hold — FTI declining, investigate cause";
    confidence = "high";
  } else {
    action = "Hold — signals mixed or insufficient";
    confidence = "low";
  }

  return {
    signal:     signals.length ? signals.join(" · ") : "Insufficient data",
    action,
    confidence
  };
}

function renderSuggestion(data, rows) {
  const s = generateSuggestion(data, rows);

  document.getElementById("sug-signal").textContent     = s.signal;
  document.getElementById("sug-action").textContent     = s.action;
  document.getElementById("sug-confidence").textContent = s.confidence.charAt(0).toUpperCase() + s.confidence.slice(1);

  const badge = document.getElementById("conf-badge");
  badge.textContent = s.confidence.toUpperCase();
  badge.className   = `confidence-badge conf-${s.confidence}`;
}

// ── Log Table ─────────────────────────────────

function sortLogNewestFirst(rows) {
  // Sort by week label descending: "CW15-2026" > "CW14-2026" > "CW08-2025"
  return [...rows].sort((a, b) => {
    const parse = w => {
      const m = w.match(/CW(\d+)-(\d+)/);
      return m ? parseInt(m[2]) * 100 + parseInt(m[1]) : 0;
    };
    return parse(b.week) - parse(a.week);
  });
}

function renderLog() {
  const tbody = document.getElementById("log-tbody");

  // Filter by region if not Global, then sort newest first
  const filtered = selectedRegion === "Global"
    ? WEEKLY_LOG
    : WEEKLY_LOG.filter(r => r.region === selectedRegion || r.region === "Global");
  const rows = sortLogNewestFirst(filtered);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-faint);font-family:var(--font-mono);font-size:0.72rem;padding:1.5rem">No log entries for this region yet.</td></tr>`;
    return;
  }

  const resultClass = { good: "result-good", mixed: "result-mixed", bad: "result-bad", pending: "result-pending" };
  const resultLabel = { good: "Good", mixed: "Mixed", bad: "Bad", pending: "Pending" };

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td class="week-col">${r.week}</td>
      <td>${r.region}</td>
      <td class="signal-col">${r.signal}</td>
      <td class="action-col">${r.suggestion}</td>
      <td>${r.action}</td>
      <td><span class="result-pill ${resultClass[r.result] || 'result-pending'}">${resultLabel[r.result] || r.result}</span></td>
      <td style="color:var(--text-faint)">${r.learning}</td>
    </tr>
  `).join("");
}

// ── Controls ──────────────────────────────────

function setupControls(data) {
  const regionBtns = document.querySelectorAll("#region-controls [data-region]");
  const rangeBtns  = document.querySelectorAll("#range-controls [data-range]");

  function markActive(buttons, key, value) {
    buttons.forEach(btn => {
      const active = btn.dataset[key] === value;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
  }

  regionBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      selectedRegion = btn.dataset.region;
      markActive(regionBtns, "region", selectedRegion);
      refresh(data);
    });
  });

  rangeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      selectedRange = btn.dataset.range;
      markActive(rangeBtns, "range", selectedRange);
      refresh(data);
    });
  });
}

// ── Refresh ───────────────────────────────────

function refresh(data) {
  const { rows, rate } = getHistory(data);
  renderPerfChart(rows, rate);
  renderCapChart();
  renderSuggestion(data, rows);
  renderLog();
}

// ── Boot ──────────────────────────────────────

async function init() {
  let data;
  try {
    const res = await fetch("data.json");
    data = await res.json();
  } catch (e) {
    document.body.innerHTML = `<div style="padding:2rem;font-family:monospace;color:#c00">
      Failed to load data.json — make sure it's in the same folder as search.html.<br>${e}
    </div>`;
    return;
  }

  data.forex_rate = readStoredForexRate() || data.forex_rate || FOREX_DEFAULT;

  appData = data;
  setupControls(data);
  refresh(data);

  window.addEventListener("zaapi:forex-change", (event) => {
    const nextRate = parseFloat(event.detail?.rate);
    data.forex_rate = Number.isFinite(nextRate) && nextRate > 0 ? nextRate : FOREX_DEFAULT;
    refresh(data);
  });
}

document.addEventListener("DOMContentLoaded", init);
