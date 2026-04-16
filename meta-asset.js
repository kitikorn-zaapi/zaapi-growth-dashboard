const SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSVufnWJeLLw5gPzY35xMd4M3-NPdeEIgnHQHJ5PjuESKootN4ZpuNanI-KMcdphPnqRI6iu80wynFR/pub?gid=526174207&single=true&output=csv";
const PROXY_URL = `https://corsproxy.io/?${encodeURIComponent(SHEETS_CSV_URL)}`;
const FALLBACK_PROXY_URL = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(SHEETS_CSV_URL)}`;

const NUMERIC_FIELDS = ["spend", "hook_rate", "thumb_stop", "frequency", "ctr", "fti", "cpa"];
const EXPECTED_COLUMNS = ["ad_code", "status", "region", "prod", "angle", "feature1", "stage", "spend", "hook_rate", "thumb_stop", "frequency", "ctr", "fti", "cpa", "assessment"];

const state = {
  rows: [],
  region: "All",
  sortBy: "fti_desc"
};

const leaderboardEl = document.getElementById("leaderboard");
const fatigueEl = document.getElementById("fatigue");
const nextTestEl = document.getElementById("next-test");
const performanceSnapshotEl = document.getElementById("performance-snapshot");
const patternAnalysisEl = document.getElementById("pattern-analysis");
const regionFilterEl = document.getElementById("region-filter");
const sortByEl = document.getElementById("sort-by");
const patternTabs = Array.from(document.querySelectorAll(".pattern-tab"));

regionFilterEl.addEventListener("change", (event) => {
  state.region = event.target.value;
  syncPatternTabs();
  render();
});

sortByEl.addEventListener("change", (event) => {
  state.sortBy = event.target.value;
  render();
});

patternTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const region = tab.dataset.region || "All";
    state.region = region;
    regionFilterEl.value = region;
    syncPatternTabs();
    render();
  });
});

document.addEventListener("click", (event) => {
  const toggleButton = event.target.closest(".img-toggle");
  if (!toggleButton) return;

  const code = toggleButton.dataset.code;
  if (!code) return;

  const el = document.getElementById(`img-${codeToDomId(code)}`);
  if (!el) return;

  el.classList.toggle("hidden");
  toggleButton.textContent = el.classList.contains("hidden") ? "▼" : "▲";

  if (!el.classList.contains("hidden")) {
    const img = el.querySelector("img[data-src]");
    if (img && !img.getAttribute("src")) {
      img.src = img.dataset.src;
      img.onerror = () => {
        img.parentElement.innerHTML = `<div class="placeholder">${escapeHtml(code)}</div>`;
      };
    }
  }
});

async function init() {
  let csvText = "";

  try {
    let res = await fetch(PROXY_URL);
    csvText = await res.text();

    if (!res.ok || csvText.trim().startsWith("<")) {
      res = await fetch(FALLBACK_PROXY_URL);
      csvText = await res.text();
    }

    if (csvText.trim().startsWith("<") || !csvText.includes(",")) {
      throw new Error("Both proxies failed — invalid CSV response");
    }

    state.rows = parseCsv(csvText);
    console.log("ROWS LOADED:", state.rows.length);
    render();
  } catch (error) {
    console.error("FETCH ERROR:", error);

    leaderboardEl.innerHTML = '<div class="empty">Failed to load data</div>';
    fatigueEl.innerHTML = '<div class="empty">—</div>';
    nextTestEl.innerHTML = "No suggestion available.";
  }
}

function parseCsv(csvText) {
  const lines = csvText
    .split("\n")
    .map((line) => line.replace(/\r$/, "").trim())
    .filter((line) => line.length > 0);

  const rows = lines
    .map((line) => splitCsvRow(line).map((cell) => cell.replace(/^"|"$/g, "").trim()));

  console.log("ROWS:", rows.length);

  if (rows.length < 2) return [];

  const rawHeaders = rows[0].map((header) => normalizeKey(header));
  console.log("HEADERS:", rawHeaders);
  console.log("FIRST ROW:", rows[1]);
  const headerMap = EXPECTED_COLUMNS.map((column) => {
    const idx = rawHeaders.indexOf(column);
    return { column, idx };
  });

  const data = rows.slice(1).map((cells) => {
    const row = {};

    headerMap.forEach(({ column, idx }) => {
      row[column] = idx >= 0 ? (cells[idx] || "").trim() : "";
    });

    NUMERIC_FIELDS.forEach((field) => {
      row[field] = toNumber(row[field]);
    });

    row.status = classifyStatus(row);
    return row;
  });

  console.log("PARSED DATA SAMPLE:", data[0]);
  return data;
}

function toNumber(value) {
  if (!value) return 0;
  return parseFloat(
    String(value)
      .replace(/[$,%]/g, "")
      .replace(/,/g, "")
      .trim()
  ) || 0;
}

function normalizeKey(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, "_");
}

function classifyStatus(row) {
  if (row.spend === 0) return "Pending";
  if (row.hook_rate < 15 || row.ctr < 0.8 || (row.fti === 0 && row.spend > 15)) return "Kill";
  if (row.hook_rate > 35 && row.fti >= 2) return "Scale";
  if (row.fti > 0 && row.fti < 2) return "Watch";
  return "Live";
}

function splitCsvRow(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }

  result.push(cur.trim());
  return result;
}

function getFilteredAndSortedRows() {
  const filtered = state.region === "All"
    ? [...state.rows]
    : state.rows.filter((row) => row.region === state.region);

  return filtered.sort((a, b) => {
    if (state.sortBy === "hook_rate_desc") return b.hook_rate - a.hook_rate;
    if (state.sortBy === "spend_desc") return b.spend - a.spend;
    if (state.sortBy === "cpa_asc") return a.cpa - b.cpa;
    return b.fti - a.fti;
  });
}

function render() {
  const rows = getFilteredAndSortedRows();
  console.log("DATA TO RENDER:", rows.length);
  console.log("REGIONS:", state.rows.slice(0, 10).map((r) => `"${r.region}"`));
  renderLeaderboard(rows);
  renderFatigue(rows);
  renderNextTest(rows);
  renderPerformanceSnapshot(rows);
  renderPatternAnalysis(rows);
}

function renderLeaderboard(rows) {
  if (!rows.length) {
    leaderboardEl.innerHTML = '<div class="empty">No assets found for this region.</div>';
    return;
  }

  leaderboardEl.innerHTML = rows.map((row) => {
    const adCode = row.ad_code || "UNKNOWN";

    return `
      <article class="asset-card">
        <div class="thumb-wrap" data-ad-code="${escapeHtml(adCode)}">
          <img alt="${escapeHtml(adCode)}" loading="lazy" />
        </div>
        <div class="row-top">
          <div class="ad-code">${escapeHtml(adCode)}</div>
          <span class="status status-${row.status.toLowerCase()}">${row.status}</span>
        </div>
        <div class="pills">
          <span class="pill">${escapeHtml(row.region || "-")}</span>
          <span class="pill">${escapeHtml(row.prod || "-")}</span>
          <span class="pill">${escapeHtml(row.angle || "-")}</span>
        </div>
        <div class="metrics">
          ${metricCell("Hook Rate", `${row.hook_rate.toFixed(1)}%`)}
          ${metricCell("CTR", `${row.ctr.toFixed(2)}%`)}
          ${metricCell("FTI", row.fti.toFixed(2))}
          ${metricCell("CPA", `$${row.cpa.toFixed(2)}`)}
          ${metricCell("Frequency", row.frequency.toFixed(2))}
        </div>
        <p class="assessment" title="Click to expand/collapse">${escapeHtml(row.assessment || "No assessment")}</p>
      </article>
    `;
  }).join("");

  leaderboardEl.querySelectorAll(".thumb-wrap img").forEach((img) => {
    const wrapper = img.parentElement;
    const adCode = wrapper.dataset.adCode || "UNKNOWN";
    img.src = `/zaapi-growth-dashboard/assets/${adCode}.webp`;
    console.log("IMG:", img.src);
    img.addEventListener("error", () => {
      wrapper.innerHTML = `<div class="placeholder">${escapeHtml(adCode)}</div>`;
    }, { once: true });
  });

  leaderboardEl.querySelectorAll(".assessment").forEach((assessment) => {
    assessment.addEventListener("click", () => {
      assessment.classList.toggle("expanded");
    });
  });
}

function renderFatigue(rows) {
  const fatigueRows = rows.filter((row) => row.frequency > 2.5 || (row.hook_rate < 15 && row.spend > 0));

  if (!fatigueRows.length) {
    fatigueEl.innerHTML = '<div class="empty">All clear — no fatigue signals this week.</div>';
    return;
  }

  fatigueEl.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ad Code</th>
            <th>Region</th>
            <th>Hook Rate</th>
            <th>Frequency</th>
            <th>Issue</th>
          </tr>
        </thead>
        <tbody>
          ${fatigueRows.map((row) => {
            const issue = row.frequency > 2.5
              ? "High frequency"
              : "Low hook rate with spend";

            return `
              <tr>
                <td>${renderAdPreview(row.ad_code || "-")}</td>
                <td>${escapeHtml(row.region || "-")}</td>
                <td>${row.hook_rate.toFixed(1)}%</td>
                <td>${row.frequency.toFixed(2)}</td>
                <td>${issue}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderNextTest(rows) {
  const candidates = rows.filter((row) => row.spend > 0);
  if (!candidates.length) {
    nextTestEl.textContent = "No spend yet. Launch a live test to generate a next suggestion.";
    return;
  }

  const winner = [...candidates].sort((a, b) => b.fti - a.fti)[0];
  const adCode = winner.ad_code || "-";

  nextTestEl.innerHTML = `
    <div>
      ${renderAdPreview(adCode)}
      <div style="margin-top:8px;">Winner: <strong>${escapeHtml(adCode)}</strong> (${winner.fti.toFixed(2)} FTI, $${winner.cpa.toFixed(2)} CPA)</div>
      <div>→ Suggested next: test new angle</div>
    </div>
  `;
}

function renderPerformanceSnapshot(rows) {
  const spendRows = rows.filter((row) => row.spend > 0);

  if (!spendRows.length) {
    performanceSnapshotEl.innerHTML = '<div class="empty">No spend data available for benchmark comparison.</div>';
    return;
  }

  const avgFti = spendRows.reduce((sum, row) => sum + row.fti, 0) / spendRows.length;
  const avgCpa = spendRows.reduce((sum, row) => sum + row.cpa, 0) / spendRows.length;
  const avgHookRate = spendRows.reduce((sum, row) => sum + row.hook_rate, 0) / spendRows.length;

  const rankedDesc = [...spendRows].sort((a, b) => b.fti - a.fti);
  const top3 = rankedDesc.slice(0, 3);
  const bottom3 = [...spendRows].sort((a, b) => a.fti - b.fti).slice(0, 3);

  performanceSnapshotEl.innerHTML = `
    <div class="snapshot-grid">
      <section class="snapshot-col">
        <h3 class="snapshot-title">Top Performers</h3>
        ${top3.map((row) => snapshotItem(row, avgFti, avgCpa, avgHookRate)).join("")}
      </section>
      <section class="snapshot-col">
        <h3 class="snapshot-title">Worst Performers</h3>
        ${bottom3.map((row) => snapshotItem(row, avgFti, avgCpa, avgHookRate)).join("")}
      </section>
    </div>
  `;
}

function snapshotItem(row, avgFti, avgCpa, avgHookRate) {
  const deltaFti = avgFti === 0 ? 0 : ((row.fti - avgFti) / avgFti) * 100;
  const deltaCpa = avgCpa === 0 ? 0 : ((avgCpa - row.cpa) / avgCpa) * 100;
  const deltaHook = row.hook_rate - avgHookRate;

  return `
    <article class="snapshot-item">
      ${renderAdPreview(row.ad_code || "-")}
      <div class="snapshot-metric">
        <span>FTI: ${row.fti.toFixed(2)}</span>
        <span class="delta ${deltaClass(deltaFti)}">${formatSignedPercent(deltaFti)}</span>
      </div>
      <div class="snapshot-metric">
        <span>CPA: $${row.cpa.toFixed(2)}</span>
        <span class="delta ${deltaClass(deltaCpa)}">${formatSignedPercent(deltaCpa)}</span>
      </div>
      <div class="snapshot-metric">
        <span>Hook Rate: ${row.hook_rate.toFixed(1)}%</span>
        <span class="delta ${deltaClass(deltaHook)}">${formatSignedPoints(deltaHook)}</span>
      </div>
    </article>
  `;
}

function renderAdPreview(adCode) {
  const safeCode = escapeHtml(adCode || "-");
  const domId = codeToDomId(adCode || "-");

  return `
    <div class="ad-header">
      <span class="ad-code">${safeCode}</span>
      <button class="img-toggle" type="button" data-code="${safeCode}" aria-label="Toggle preview for ${safeCode}">▼</button>
    </div>
    <div class="img-preview hidden" id="img-${domId}">
      <img alt="${safeCode}" data-src="/zaapi-growth-dashboard/assets/${encodeURIComponent(adCode || "-")}.webp" loading="lazy" />
    </div>
  `;
}

function codeToDomId(code) {
  return String(code || "-").replace(/[^a-zA-Z0-9_-]/g, "-");
}

function deltaClass(deltaValue) {
  if (Math.abs(deltaValue) <= 5) return "delta-neutral";
  return deltaValue > 0 ? "delta-positive" : "delta-negative";
}

function formatSignedPercent(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatSignedPoints(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} pts`;
}

function metricCell(label, value) {
  return `<div><div class="metric-label">${label}</div><div class="metric-value">${value}</div></div>`;
}

function renderPatternAnalysis(rows) {
  const spendRows = rows.filter((row) => row.spend > 0);
  if (!spendRows.length) {
    patternAnalysisEl.innerHTML = '<div class="empty">No spend data for pattern analysis in this region.</div>';
    return;
  }

  const benchmarks = {
    avgHookRate: average(spendRows, (row) => row.hook_rate),
    avgFti: average(spendRows, (row) => row.fti)
  };

  const axes = [
    { key: "angle", label: "Angle" },
    { key: "prod", label: "Prod" },
    { key: "feature1", label: "Feature" }
  ];

  const axisBlocks = axes.map((axis) => renderAxisBlock(spendRows, axis, benchmarks)).join("");
  const coverage = renderCoverageGaps(axes);

  patternAnalysisEl.innerHTML = `${axisBlocks}${coverage}`;
}

function renderAxisBlock(spendRows, axis, benchmarks) {
  const groups = aggregateByAxis(spendRows, axis.key, benchmarks);
  const cards = groups.map((group) => renderPatternCard(group)).join("");
  const ranked = groups
    .filter((group) => group.adsCount >= 3)
    .sort((a, b) => (b.avgFti - a.avgFti) || (b.avgHookRate - a.avgHookRate));

  const rankingHtml = ranked.length
    ? `<div class="pattern-ranking"><strong>Ranked (n ≥ 3):</strong><ol>${ranked
      .map((group) => `<li>${escapeHtml(group.name)} · FTI ${formatNumber(group.avgFti)} · Hook ${formatPercent(group.avgHookRate)}</li>`)
      .join("")}</ol></div>`
    : '<div class="pattern-ranking">No groups meet ranking threshold (n ≥ 3).</div>';

  return `
    <section class="axis-block">
      <h3 class="axis-title">${escapeHtml(axis.label)} patterns</h3>
      <div class="pattern-grid">${cards}</div>
      ${rankingHtml}
    </section>
  `;
}

function aggregateByAxis(rows, axisKey, benchmarks) {
  const groups = new Map();

  rows.forEach((row) => {
    const rawName = (row[axisKey] || "").trim();
    const name = rawName || "Unspecified";
    if (!groups.has(name)) {
      groups.set(name, { name, rows: [] });
    }
    groups.get(name).rows.push(row);
  });

  return Array.from(groups.values())
    .map((group) => {
      const tofRows = group.rows.filter((row) => String(row.stage || "").trim() === "Awareness");
      const bofRows = group.rows.filter((row) => String(row.stage || "").trim() === "Conversion");
      const adsCount = group.rows.length;
      const avgHookRate = average(tofRows, (row) => row.hook_rate);
      const avgThumbStop = average(tofRows, (row) => row.thumb_stop);
      const avgFti = average(bofRows, (row) => row.fti);
      const avgCpa = average(bofRows, (row) => row.cpa);
      const tofStrong = avgHookRate > benchmarks.avgHookRate;
      const bofStrong = avgFti > benchmarks.avgFti;
      return {
        name: group.name,
        adsCount,
        totalSpend: group.rows.reduce((sum, row) => sum + row.spend, 0),
        avgHookRate,
        avgThumbStop,
        avgFti,
        avgCpa,
        confidence: confidenceLabel(adsCount),
        verdict: verdictLabel(tofStrong, bofStrong)
      };
    })
    .sort((a, b) => b.adsCount - a.adsCount || b.totalSpend - a.totalSpend);
}

function renderPatternCard(group) {
  const confidenceClass = `confidence-${group.confidence.toLowerCase()}`;
  const verdictClass = verdictClassName(group.verdict);
  const caution = group.adsCount < 3 ? " ⚠" : "";

  return `
    <article class="pattern-card">
      <div class="pattern-name">${escapeHtml(group.name)}</div>
      <div class="pattern-meta">n=${group.adsCount} · <span class="${confidenceClass}">${group.confidence} confidence${caution}</span></div>
      <div class="pattern-metrics">
        <div>TOF: Hook ${formatPercent(group.avgHookRate)} · Thumb ${formatPercent(group.avgThumbStop)}</div>
        <div>BOF: FTI ${formatNumber(group.avgFti)} · CPA ${formatCurrency(group.avgCpa)}</div>
      </div>
      <div class="pattern-verdict ${verdictClass}">Verdict: ${group.verdict}</div>
    </article>
  `;
}

function renderCoverageGaps(axes) {
  const allSpendRows = state.rows.filter((row) => row.spend > 0);
  const selectedSpendRows = state.region === "All"
    ? allSpendRows
    : allSpendRows.filter((row) => row.region === state.region);

  if (!allSpendRows.length) {
    return '<div class="coverage-wrap"><div class="empty">No spend rows found for coverage analysis.</div></div>';
  }

  const regionLabel = state.region === "All" ? "ALL" : state.region;
  const gaps = [];

  axes.forEach((axis) => {
    const allValues = uniqueAxisValues(allSpendRows, axis.key);
    const regionValues = uniqueAxisValues(selectedSpendRows, axis.key);

    allValues.forEach((value) => {
      if (!regionValues.has(value)) {
        gaps.push(`${value} ${axis.label.toLowerCase()} not tested in ${regionLabel}`);
      }
    });
  });

  const list = gaps.length
    ? `<ul class="coverage-list">${gaps.map((gap) => `<li>${escapeHtml(gap)}</li>`).join("")}</ul>`
    : `<div class="empty">No coverage gaps for ${escapeHtml(regionLabel)}.</div>`;

  return `
    <section class="coverage-wrap">
      <h3 class="coverage-title">Coverage gaps</h3>
      ${list}
    </section>
  `;
}

function uniqueAxisValues(rows, axisKey) {
  return new Set(
    rows
      .map((row) => ((row[axisKey] || "").trim() || "Unspecified"))
  );
}

function average(rows, selector) {
  if (!rows.length) return 0;
  const total = rows.reduce((sum, row) => sum + selector(row), 0);
  return total / rows.length;
}

function confidenceLabel(adsCount) {
  if (adsCount === 1) return "Low";
  if (adsCount === 2) return "Medium";
  return "High";
}

function verdictLabel(tofStrong, bofStrong) {
  if (tofStrong && !bofStrong) return "Fix funnel";
  if (!tofStrong && bofStrong) return "Fix creative";
  if (tofStrong && bofStrong) return "Scale";
  return "Kill";
}

function verdictClassName(verdict) {
  if (verdict === "Scale") return "verdict-scale";
  if (verdict === "Kill") return "verdict-kill";
  return "verdict-fix";
}

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

function formatCurrency(value) {
  return `$${value.toFixed(2)}`;
}

function formatNumber(value) {
  return value.toFixed(2);
}

function syncPatternTabs() {
  patternTabs.forEach((tab) => {
    const isActive = (tab.dataset.region || "All") === state.region;
    tab.classList.toggle("active", isActive);
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

init();
