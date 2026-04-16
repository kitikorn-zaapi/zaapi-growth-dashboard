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

  const labels = rows.map(r => r.week);
  const datasets = [
    {
      label: "FTI",
      data: rows.map(r => r.fti),
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
      data: rows.map(r => r.hq),
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
      label: "Spend (USD)",
      data: rows.map(r => typeof r.spend === "number" ? Math.round(toUSD(r.spend, rate)) : null),
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
}

function renderCapChart(rows) {
  if (capChart) { capChart.destroy(); capChart = null; }
  const ctx = document.getElementById("cap-chart");

  // IS / Lost IS data lives on region_spend for current week only in data.json
  // For the chart, we use spend_target as IS proxy if actual IS not in history
  // Check if history has is_pct or lost_is_rank fields
  const hasIS = rows.some(r => typeof r.is_pct === "number" || typeof r.lost_is_rank === "number");

  if (!hasIS || !rows.length) {
    // Show current week snapshot if available
    const noteEl = document.getElementById("cap-note");
    if (appData && appData.region_spend) {
      const reg = selectedRegion === "Global" ? null : selectedRegion;
      if (reg) {
        const rd = appData.region_spend.find(r => r.region === reg);
        if (rd) {
          const is = rd.lost_is_rank;
          const headroom = is > 50 ? "High headroom — scaling available" : is > 30 ? "Limited headroom — cap scale at +5%" : "Low headroom — hold";
          noteEl.textContent = `Current week: Lost IS rank ${is}% · ${headroom}`;
        } else {
          noteEl.textContent = "No IS data available for this region.";
        }
      } else {
        // Global — show all regions
        const parts = appData.region_spend.map(r => `${r.region} ${r.lost_is_rank}%`).join(" · ");
        noteEl.textContent = `Current week Lost IS rank → ${parts}`;
      }
    }

    // Draw placeholder with region_spend current data as single-point
    if (appData && appData.region_spend) {
      const reg = selectedRegion === "Global" ? null : selectedRegion;
      const sources = reg
        ? appData.region_spend.filter(r => r.region === reg)
        : appData.region_spend;

      const labels = sources.map(r => r.region);
      const isVals = sources.map(() => null);
      const lostVals = sources.map(r => r.lost_is_rank);

      const datasets = [
        {
          label: "IS %",
          data: isVals,
          borderColor: "#0f9e75",
          backgroundColor: "#0f9e75",
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.15,
          spanGaps: true
        },
        {
          label: "Lost IS rank %",
          data: lostVals,
          borderColor: "#e24b4a",
          backgroundColor: "#e24b4a",
          borderDash: [5, 4],
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.15,
          spanGaps: true
        }
      ];
      capChart = buildChart(ctx, labels, datasets, "% Share", null);
    }
    return;
  }

  const labels = rows.map(r => r.week);
  const datasets = [
    {
      label: "IS %",
      data: rows.map(r => typeof r.is_pct === "number" ? r.is_pct : null),
      borderColor: "#0f9e75",
      backgroundColor: "#0f9e75",
      borderWidth: 2,
      pointRadius: 2,
      pointHoverRadius: 4,
      tension: 0.15,
      spanGaps: true
    },
    {
      label: "Lost IS rank %",
      data: rows.map(r => typeof r.lost_is_rank === "number" ? r.lost_is_rank : null),
      borderColor: "#e24b4a",
      backgroundColor: "#e24b4a",
      borderDash: [5, 4],
      borderWidth: 2,
      pointRadius: 2,
      pointHoverRadius: 4,
      tension: 0.15,
      spanGaps: true
    }
  ];

  capChart = buildChart(ctx, labels, datasets, "% Share", null);
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

function renderLog() {
  const tbody = document.getElementById("log-tbody");

  // Filter by region if not Global
  const rows = selectedRegion === "Global"
    ? WEEKLY_LOG
    : WEEKLY_LOG.filter(r => r.region === selectedRegion || r.region === "Global");

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
  renderCapChart(rows);
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

  appData = data;
  setupControls(data);
  refresh(data);
}

document.addEventListener("DOMContentLoaded", init);
