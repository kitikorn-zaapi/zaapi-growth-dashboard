const SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSVufnWJeLLw5gPzY35xMd4M3-NPdeEIgnHQHJ5PjuESKootN4ZpuNanI-KMcdphPnqRI6iu80wynFR/pub?gid=526174207&single=true&output=csv";
const PROXY_URL = `https://corsproxy.io/?${encodeURIComponent(SHEETS_CSV_URL)}`;
const FALLBACK_PROXY_URL = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(SHEETS_CSV_URL)}`;

const NUMERIC_FIELDS = [
  "spend",
  "hook_rate",
  "thumb_stop",
  "frequency",
  "cpm",
  "ctr",
  "fti",
  "cpa",
  "spend_tof_lw",
  "hook_rate_lw",
  "frequency_lw",
  "cpm_lw",
  "spend_bof_lw",
  "fti_lw",
  "cpa_lw",
  "spend_tof_pw",
  "hook_rate_pw",
  "frequency_pw",
  "cpm_pw",
  "spend_bof_pw",
  "fti_pw",
  "cpa_pw"
];
const EXPECTED_COLUMNS = [
  "ad_code",
  "status",
  "region",
  "prod",
  "angle",
  "feature1",
  "spend",
  "hook_rate",
  "thumb_stop",
  "frequency",
  "cpm",
  "ctr",
  "fti",
  "cpa",
  "assessment",
  "objective",
  "spend_tof_lw",
  "hook_rate_lw",
  "frequency_lw",
  "cpm_lw",
  "spend_bof_lw",
  "fti_lw",
  "cpa_lw",
  "spend_tof_pw",
  "hook_rate_pw",
  "frequency_pw",
  "cpm_pw",
  "spend_bof_pw",
  "fti_pw",
  "cpa_pw"
];

const state = {
  rows: [],
  region: "All",
  sortBy: "fti_desc",
  allAdsSort: { key: "fti", direction: "desc" }
};

const leaderboardEl = document.getElementById("leaderboard");
const fatigueEl = document.getElementById("fatigue");
const nextTestEl = document.getElementById("next-test");
const performanceSnapshotEl = document.getElementById("performance-snapshot");
const patternAnalysisEl = document.getElementById("pattern-analysis");
const allAdsTableEl = document.getElementById("all-ads-table");
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
  const genericToggleButton = event.target.closest("[data-target]");
  if (genericToggleButton && (genericToggleButton.hasAttribute("data-fatigue-toggle") || genericToggleButton.hasAttribute("data-leaderboard-toggle") || genericToggleButton.hasAttribute("data-legend-toggle"))) {
    const targetId = genericToggleButton.getAttribute("data-target");
    if (!targetId) return;

    const target = document.getElementById(targetId);
    if (!target) return;

    const hidden = target.classList.toggle("hidden");
    const moreCount = Number(genericToggleButton.getAttribute("data-more-count") || "0");

    if (genericToggleButton.hasAttribute("data-legend-toggle")) {
      genericToggleButton.textContent = hidden ? "What do these metrics mean?" : "Hide metric definitions";
    } else {
      genericToggleButton.textContent = hidden
        ? `Show more (${moreCount} more)`
        : "Show less";
    }
    return;
  }

  const allAdsSortButton = event.target.closest("[data-allads-sort]");
  if (allAdsSortButton) {
    const key = allAdsSortButton.getAttribute("data-allads-sort");
    if (!key) return;

    if (state.allAdsSort.key === key) {
      state.allAdsSort.direction = state.allAdsSort.direction === "asc" ? "desc" : "asc";
    } else {
      state.allAdsSort.key = key;
      state.allAdsSort.direction = "desc";
    }

    render();
    return;
  }

  const assessmentToggle = event.target.closest("[data-assessment-toggle]");
  if (assessmentToggle) {
    const isExpanded = assessmentToggle.getAttribute("data-expanded") === "true";
    assessmentToggle.textContent = isExpanded
      ? assessmentToggle.getAttribute("data-short") || ""
      : assessmentToggle.getAttribute("data-full") || "";
    assessmentToggle.setAttribute("data-expanded", isExpanded ? "false" : "true");
    return;
  }

  const toggleButton = event.target.closest(".img-toggle");
  if (!toggleButton) return;

  const id = toggleButton.getAttribute("data-id");
  if (!id) return;

  const el = document.getElementById(`preview-${id}`);
  if (!el) return;

  el.classList.toggle("hidden");
  toggleButton.textContent = el.classList.contains("hidden") ? "▼" : "▲";

  if (!el.classList.contains("hidden")) {
    const img = el.querySelector("img[data-src]");
    if (img && !img.getAttribute("src")) {
      img.src = img.dataset.src;
      img.onerror = () => {
        const code = toggleButton.getAttribute("data-code") || "UNKNOWN";
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
  const rawStatus = String(row.status || "").trim();
  if (rawStatus === "Paused" || rawStatus === "Kill") return rawStatus;

  const metricEligibleStatuses = new Set(["", "Live", "Watch", "Testing"]);
  if (!metricEligibleStatuses.has(rawStatus)) return rawStatus || "Pending";

  if (row.spend === 0) return "Pending";

  const objective = normalizeObjective(row.objective);

  if (objective === "TOF") {
    if (row.hook_rate > 0 && row.hook_rate < 15) return "Kill";
  } else if (objective === "BOF") {
    if (row.fti === 0 && row.spend > 50) return "Kill";
  } else {
    if (row.hook_rate < 15 || row.ctr < 0.8 || (row.fti === 0 && row.spend > 15)) return "Kill";
  }

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
  const mergedRows = mergeByAdCode(rows);

  renderLeaderboard(rows);
  renderFatigue(rows);
  renderNextTest(mergedRows);
  renderPerformanceSnapshot(mergedRows);
  renderPatternAnalysis(rows);
  renderAllAdsTable(rows);
}


function mergeByAdCode(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    const adCode = row.ad_code || "UNKNOWN";
    if (!grouped.has(adCode)) {
      grouped.set(adCode, { ad_code: adCode, tofRow: null, bofRow: null });
    }

    const group = grouped.get(adCode);
    const objective = normalizeObjective(row.objective);

    if (objective === "BOF") {
      group.bofRow = group.bofRow || row;
    } else {
      group.tofRow = group.tofRow || row;
    }
  });

  return Array.from(grouped.values()).map((group) => {
    const tofRow = group.tofRow;
    const bofRow = group.bofRow;
    const baseRow = tofRow || bofRow || {};

    return {
      ad_code: group.ad_code,
      hook_rate: tofRow?.hook_rate || 0,
      thumb_stop: tofRow?.thumb_stop || 0,
      frequency: tofRow?.frequency || 0,
      cpm: tofRow?.cpm || 0,
      ctr: bofRow?.ctr || 0,
      fti: bofRow?.fti || 0,
      cpa: bofRow?.cpa || 0,
      spend: (tofRow?.spend || 0) + (bofRow?.spend || 0),
      region: baseRow.region || "-",
      prod: baseRow.prod || "-",
      angle: baseRow.angle || "-",
      status: baseRow.status || "Live",
      assessment: baseRow.assessment || "No assessment"
    };
  });
}

function renderLeaderboard(rows) {
  const groupedRows = getLeaderboardRows(rows);
  const extraGridId = "leaderboard-extra-grid";
  const toggleBtnId = "leaderboard-toggle-btn";
  document.getElementById(extraGridId)?.remove();
  document.getElementById(toggleBtnId)?.remove();

  if (!groupedRows.length) {
    leaderboardEl.innerHTML = '<div class="empty">No assets found for this region.</div>';
    return;
  }

  const visibleCards = groupedRows.slice(0, 3);
  const hiddenCards = groupedRows.slice(3);
  const renderCard = (group) => {
    const adCode = group.ad_code || "UNKNOWN";
    const tofRow = group.tofRow;
    const bofRow = group.bofRow;
    const baseRow = tofRow || bofRow || {};
    const tofStatus = tofRow?.status || "Not launched";
    const bofStatus = bofRow?.status || "Not launched";
    const assessment = baseRow.assessment || "No assessment";
    const region = baseRow.region || "-";
    const prod = baseRow.prod || "-";
    const angle = baseRow.angle || "-";
    const shortAssessment = truncateText(assessment, 60);

    return `
      <article class="asset-card">
        <div class="thumb-wrap" data-ad-code="${escapeHtml(adCode)}">
          <img alt="${escapeHtml(adCode)}" loading="lazy" />
        </div>
        <div class="row-top">
          <div class="ad-code">${escapeHtml(adCode)}</div>
          <div style="display:flex; gap:0.35rem; flex-wrap:wrap; justify-content:flex-end;">
            <span class="status ${getStatusClass(tofStatus)}">TOF: ${escapeHtml(tofStatus)}</span>
            <span class="status ${getStatusClass(bofStatus)}">BOF: ${escapeHtml(bofStatus)}</span>
          </div>
        </div>
        <div class="pills">
          <span class="pill">${escapeHtml(region)}</span>
          <span class="pill">${escapeHtml(prod)}</span>
          <span class="pill">${escapeHtml(angle)}</span>
        </div>
        <div class="metrics">
          <div><div class="metric-label">TOF</div><div class="metric-value">${tofRow ? "Live" : "—"}</div></div>
          ${metricCell("Hook Rate", tofRow ? `${tofRow.hook_rate.toFixed(1)}%` : "—")}
          ${metricCell("Thumb Stop", tofRow ? `${tofRow.thumb_stop.toFixed(1)}%` : "—")}
          ${metricCell("Frequency", tofRow ? tofRow.frequency.toFixed(2) : "—")}
          ${metricCell("CPM", tofRow ? `$${tofRow.cpm.toFixed(2)}` : "—")}
        </div>
        <div class="metrics">
          <div><div class="metric-label">BOF</div><div class="metric-value">${bofRow ? "Live" : "BOF not launched"}</div></div>
          ${metricCell("CTR", bofRow ? `${bofRow.ctr.toFixed(2)}%` : "—")}
          ${metricCell("FTI", bofRow ? bofRow.fti.toFixed(2) : "—")}
          ${metricCell("CPA", bofRow ? `$${bofRow.cpa.toFixed(2)}` : "—")}
          ${metricCell("Spend", `$${group.spend.toFixed(2)}`)}
        </div>
        <div class="verdict">→ ${escapeHtml(getVerdictText(tofRow, bofRow))}</div>
        <p class="assessment" data-assessment-toggle="true" data-short="${escapeHtml(shortAssessment)}" data-full="${escapeHtml(assessment)}" data-expanded="false" title="Click to expand/collapse">${escapeHtml(shortAssessment)}</p>
      </article>
    `;
  };

  leaderboardEl.innerHTML = visibleCards.map(renderCard).join("");

  if (hiddenCards.length) {
    leaderboardEl.insertAdjacentHTML(
      "afterend",
      `<div id="${extraGridId}" class="leaderboard hidden" style="margin-top:0.8rem;">${hiddenCards.map(renderCard).join("")}</div><button id="${toggleBtnId}" type="button" class="nav-btn" data-leaderboard-toggle="true" data-target="${extraGridId}" data-more-count="${hiddenCards.length}" style="margin-top:0.6rem;">Show more (${hiddenCards.length} more)</button>`
    );
  }

  leaderboardEl.querySelectorAll(".thumb-wrap img").forEach((img) => {
    const wrapper = img.parentElement;
    const adCode = wrapper.dataset.adCode || "UNKNOWN";
    img.src = `/zaapi-growth-dashboard/assets/${adCode}.webp`;
    console.log("IMG:", img.src);
    img.addEventListener("error", () => {
      wrapper.innerHTML = `<div class="placeholder">${escapeHtml(adCode)}</div>`;
    }, { once: true });
  });
}

function getVerdictText(tofRow, bofRow) {
  const tofStatus = tofRow?.status || "Not launched";
  const bofStatus = bofRow?.status || "Not launched";

  if (tofStatus === "Kill" && bofStatus === "Kill") return "Kill both layers";
  if (tofStatus === "Kill" && bofStatus === "Scale") return "Kill TOF · Scale BOF";
  if (tofStatus === "Kill" && !bofRow) return "Kill TOF · BOF not launched";
  if (tofStatus === "Scale" && !bofRow) return "Scale TOF · Launch BOF";
  if (tofStatus === "Scale" && bofStatus === "Scale") return "Scale both layers";
  if (tofStatus === "Live" && bofStatus === "Kill") return "Hold TOF · Kill BOF";

  return `TOF: ${tofStatus} · BOF: ${bofStatus}`;
}

function getLeaderboardRows(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    const adCode = row.ad_code || "UNKNOWN";
    if (!grouped.has(adCode)) {
      grouped.set(adCode, { ad_code: adCode, tofRow: null, bofRow: null, spend: 0 });
    }

    const group = grouped.get(adCode);
    const objective = (row.objective || "").trim().toUpperCase();

    if (objective === "BOF") {
      group.bofRow = group.bofRow || row;
    } else {
      group.tofRow = group.tofRow || row;
    }

    group.spend += row.spend || 0;
  });

  return Array.from(grouped.values()).sort((a, b) => {
    if (state.sortBy === "hook_rate_desc") return (b.tofRow?.hook_rate || 0) - (a.tofRow?.hook_rate || 0);
    if (state.sortBy === "spend_desc") return b.spend - a.spend;
    if (state.sortBy === "cpa_asc") return (a.bofRow?.cpa ?? Infinity) - (b.bofRow?.cpa ?? Infinity);
    return (b.bofRow?.fti || 0) - (a.bofRow?.fti || 0);
  });
}

function renderFatigue(rows) {
  const fatigueRows = rows
    .filter((row) => {
      const objective = normalizeObjective(row.objective);
      const isBof = objective === "BOF";
      const spendLw = isBof ? row.spend_bof_lw : row.spend_tof_lw;
      return spendLw > 0;
    })
    .map((row) => {
      const objective = normalizeObjective(row.objective);
      const isBof = objective === "BOF";
      const spendLw = isBof ? row.spend_bof_lw : row.spend_tof_lw;

      if (isBof) {
        const ftiDelta = row.fti_lw - row.fti_pw;
        const cpaDelta = row.cpa_lw > 0 && row.cpa_pw > 0
          ? ((row.cpa_lw - row.cpa_pw) / row.cpa_pw) * 100
          : null;
        const issues = [];

        if (ftiDelta < 0 && cpaDelta !== null && cpaDelta > 20) {
          issues.push("BOF deteriorating");
        }

        if (!issues.length) return null;
        return {
          row,
          spendLw,
          issue: issues.join(" · "),
          issueDetail: issues.join(" · ")
        };
      }

      const hookDelta = row.hook_rate_lw - row.hook_rate_pw;
      const freqDelta = row.frequency_lw - row.frequency_pw;
      const cpmDelta = row.cpm_lw > 0 && row.cpm_pw > 0
        ? ((row.cpm_lw - row.cpm_pw) / row.cpm_pw) * 100
        : null;
      const issues = [];

      if (hookDelta < -5 && freqDelta > 0.4) issues.push("Confirmed fatigue");
      if (hookDelta < -5) issues.push("Hook declining");
      if (freqDelta > 0.4) issues.push("Frequency rising");
      if (cpmDelta !== null && cpmDelta > 40) issues.push(`CPM rising (+${cpmDelta.toFixed(1)}%)`);

      if (!issues.length) return null;
      return {
        row,
        spendLw,
        issue: issues.join(" · "),
        issueDetail: issues.join(" · ")
      };
    })
    .filter(Boolean);

  const sortedFatigueRows = [...fatigueRows].sort((a, b) => getFatigueSeverityScore(b) - getFatigueSeverityScore(a));
  const tofFatigueRows = sortedFatigueRows.filter((entry) => normalizeObjective(entry.row.objective) === "TOF");
  const bofFatigueRows = sortedFatigueRows.filter((entry) => normalizeObjective(entry.row.objective) === "BOF");

  if (!tofFatigueRows.length && !bofFatigueRows.length) {
    fatigueEl.innerHTML = '<div class="empty">All clear — no fatigue signals this week.</div>';
    return;
  }

  fatigueEl.innerHTML = `
    <h3 class="axis-title">TOF Fatigue</h3>
    ${renderFatigueTable("tof", tofFatigueRows)}
    <h3 class="axis-title" style="margin-top: 1rem;">BOF Fatigue</h3>
    ${renderFatigueTable("bof", bofFatigueRows)}
  `;
}

function getFatigueSeverityScore(entry) {
  const issue = String(entry.issue || "");
  const severityKeywords = [
    "Confirmed fatigue",
    "Hook declining",
    "Frequency rising",
    "CPM rising",
    "BOF deteriorating"
  ];

  for (let i = 0; i < severityKeywords.length; i++) {
    if (issue.includes(severityKeywords[i])) {
      return severityKeywords.length - i;
    }
  }

  return 0;
}

function renderFatigueTable(type, fatigueEntries) {
  if (!fatigueEntries.length) {
    return `<div class="empty">No ${type.toUpperCase()} fatigue signals this week.</div>`;
  }

  const visibleRows = fatigueEntries.slice(0, 3);
  const hiddenRows = fatigueEntries.slice(3);
  const columns = type === "bof"
    ? ["FTI LW", "FTI PW", "CPA LW", "CPA PW"]
    : ["Hook LW", "Hook PW", "Freq LW", "Freq PW"];
  const moreId = `${type}-fatigue-more`;

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ad Code</th>
            <th>Region</th>
            <th>${columns[0]}</th>
            <th>${columns[1]}</th>
            <th>${columns[2]}</th>
            <th>${columns[3]}</th>
            <th>Spend LW</th>
            <th>Issue</th>
          </tr>
        </thead>
        <tbody>
          ${visibleRows.map((entry) => fatigueTableRow(entry, type)).join("")}
        </tbody>
        ${hiddenRows.length ? `
          <tbody id="${moreId}" class="hidden">
            ${hiddenRows.map((entry) => fatigueTableRow(entry, type)).join("")}
          </tbody>
        ` : ""}
      </table>
    </div>
    ${hiddenRows.length
      ? `<button type="button" class="nav-btn" data-fatigue-toggle="true" data-target="${moreId}" data-more-count="${hiddenRows.length}" style="margin-top:0.6rem;">Show more (${hiddenRows.length} more)</button>`
      : ""}
  `;
}

function fatigueTableRow(entry, type) {
  const row = entry.row;
  const isBof = type === "bof";
  const metricLw1 = isBof ? row.fti_lw.toFixed(2) : `${row.hook_rate_lw.toFixed(1)}%`;
  const metricPw1 = isBof ? row.fti_pw.toFixed(2) : `${row.hook_rate_pw.toFixed(1)}%`;
  const metricLw2 = isBof ? `$${row.cpa_lw.toFixed(2)}` : row.frequency_lw.toFixed(2);
  const metricPw2 = isBof ? `$${row.cpa_pw.toFixed(2)}` : row.frequency_pw.toFixed(2);
  const titleText = isBof
    ? "BOF row: columns represent FTI/CPA LW vs PW"
    : "TOF row: columns represent Hook/Frequency LW vs PW";

  return `
    <tr>
      <td>${renderAdPreview(row.ad_code || "-", "s2")}</td>
      <td>${escapeHtml(row.region || "-")}</td>
      <td title="${titleText}">${metricLw1}</td>
      <td title="${titleText}">${metricPw1}</td>
      <td title="${titleText}">${metricLw2}</td>
      <td title="${titleText}">${metricPw2}</td>
      <td>$${entry.spendLw.toFixed(2)}</td>
      <td>${entry.issue}</td>
    </tr>
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
      ${renderAdPreview(adCode, "s3")}
      <div style="margin-top:8px;">Winner: <strong>${escapeHtml(adCode)}</strong> (${winner.fti.toFixed(2)} FTI, $${winner.cpa.toFixed(2)} CPA)</div>
      <div>→ Suggested next: test new angle</div>
    </div>
  `;
}

function renderPerformanceSnapshot(rows) {
  const spendRows = rows.filter((row) => row.spend > 0);
  const convRows = spendRows.filter((row) => row.fti > 0);

  if (!spendRows.length) {
    performanceSnapshotEl.innerHTML = '<div class="empty">No spend data available for benchmark comparison.</div>';
    return;
  }

  const avgFti = convRows.length ? convRows.reduce((sum, row) => sum + row.fti, 0) / convRows.length : 0;
  const avgCpa = convRows.length ? convRows.reduce((sum, row) => sum + row.cpa, 0) / convRows.length : 0;
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
      ${renderAdPreview(row.ad_code || "-", "s4")}
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

function renderAdPreview(adCode, section) {
  const safeCode = escapeHtml(adCode || "-");
  const domId = codeToDomId(adCode || "-", section || "section");

  return `
    <div class="ad-header">
      <span class="ad-code">${safeCode}</span>
      <button id="toggle-${domId}" class="img-toggle" type="button" data-id="${domId}" data-code="${safeCode}" aria-label="Toggle preview for ${safeCode}">▼</button>
    </div>
    <div class="img-preview hidden" id="preview-${domId}">
      <img alt="${safeCode}" data-src="/zaapi-growth-dashboard/assets/${encodeURIComponent(adCode || "-")}.webp" loading="lazy" />
    </div>
  `;
}

function codeToDomId(ad_code, section) {
  return `${section}-${ad_code}`.replace(/[^a-zA-Z0-9-_]/g, "");
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


function renderAllAdsTable(rows) {
  if (!rows.length) {
    allAdsTableEl.innerHTML = '<div class="empty">No ads found for this region.</div>';
    return;
  }

  const columns = [
    { key: "ad_code", label: "Ad Code", type: "text" },
    { key: "objective", label: "Objective", type: "text" },
    { key: "region", label: "Region", type: "text" },
    { key: "prod", label: "Prod", type: "text" },
    { key: "angle", label: "Angle", type: "text" },
    { key: "feature1", label: "Feature", type: "text" },
    { key: "status", label: "Status", type: "text" },
    { key: "spend", label: "Spend", type: "number" },
    { key: "hook_rate", label: "Hook Rate", type: "number" },
    { key: "thumb_stop", label: "Thumb Stop", type: "number" },
    { key: "frequency", label: "Frequency", type: "number" },
    { key: "cpm", label: "CPM", type: "number" },
    { key: "ctr", label: "CTR", type: "number" },
    { key: "fti", label: "FTI", type: "number" },
    { key: "cpa", label: "CPA", type: "number" },
    { key: "assessment", label: "Assessment", type: "text" }
  ];

  const { key: activeSortKey, direction } = state.allAdsSort;
  const activeColumn = columns.find((column) => column.key === activeSortKey) || columns[13];

  const sortedRows = [...rows].sort((a, b) => {
    const left = a[activeColumn.key];
    const right = b[activeColumn.key];

    if (activeColumn.type === "number") {
      const leftNum = Number(left || 0);
      const rightNum = Number(right || 0);
      return direction === "asc" ? leftNum - rightNum : rightNum - leftNum;
    }

    const leftText = String(left || "").toLowerCase();
    const rightText = String(right || "").toLowerCase();
    const compare = leftText.localeCompare(rightText);
    return direction === "asc" ? compare : -compare;
  });

  allAdsTableEl.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${columns.map((column) => {
              const isActive = column.key === activeSortKey;
              const indicator = isActive ? (direction === "asc" ? " ▲" : " ▼") : "";
              return `<th><button type="button" data-allads-sort="${column.key}" class="img-toggle" style="font-size:0.7rem; font-family:var(--font-mono); text-transform:uppercase; letter-spacing:0.06em; color:var(--text-faint);">${column.label}${indicator}</button></th>`;
            }).join("")}
          </tr>
        </thead>
        <tbody>
          ${sortedRows.map((row, index) => {
            const assessment = row.assessment || "No assessment";
            const shortAssessment = truncateText(assessment, 60);

            return `
              <tr>
                <td>${renderAdPreview(row.ad_code || "-", `s6-${index}`)}</td>
                <td>${escapeHtml(row.objective || "-")}</td>
                <td>${escapeHtml(row.region || "-")}</td>
                <td>${escapeHtml(row.prod || "-")}</td>
                <td>${escapeHtml(row.angle || "-")}</td>
                <td>${escapeHtml(row.feature1 || "-")}</td>
                <td><span class="status ${getStatusClass(row.status || "Not launched")}">${escapeHtml(row.status || "Not launched")}</span></td>
                <td>${formatCurrency(row.spend || 0)}</td>
                <td>${formatPercent(row.hook_rate || 0)}</td>
                <td>${formatPercent(row.thumb_stop || 0)}</td>
                <td>${formatNumber(row.frequency || 0)}</td>
                <td>${formatCurrency(row.cpm || 0)}</td>
                <td>${formatPercent(row.ctr || 0)}</td>
                <td>${formatNumber(row.fti || 0)}</td>
                <td>${formatCurrency(row.cpa || 0)}</td>
                <td><span class="assessment" data-assessment-toggle="true" data-short="${escapeHtml(shortAssessment)}" data-full="${escapeHtml(assessment)}" data-expanded="false">${escapeHtml(shortAssessment)}</span></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPatternAnalysis(rows) {
  const spendRows = rows.filter((row) => row.spend > 0);
  if (!spendRows.length) {
    patternAnalysisEl.innerHTML = '<div class="empty">No spend data for pattern analysis in this region.</div>';
    return;
  }

  const tofRows = spendRows.filter((row) => normalizeObjective(row.objective) === "TOF");
  const bofConvRows = spendRows.filter((row) => normalizeObjective(row.objective) === "BOF" && row.fti > 0);
  const benchmarks = {
    avgHook: tofRows.length ? average(tofRows, (row) => row.hook_rate) : 0,
    avgFti: bofConvRows.length ? average(bofConvRows, (row) => row.fti) : 0,
    avgCpa: bofConvRows.length ? average(bofConvRows, (row) => row.cpa) : 0
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
    .filter((group) => group.n >= 3 && group.avgFti !== null)
    .sort((a, b) => (b.avgFti - a.avgFti) || ((b.avgHook || 0) - (a.avgHook || 0)));

  const rankingHtml = ranked.length
    ? `<div class="pattern-ranking"><strong>Ranked (n ≥ 3):</strong><ol>${ranked
      .map((group) => `<li>${escapeHtml(group.name)} · FTI ${formatNumber(group.avgFti)} · Hook ${group.avgHook === null ? "—" : formatPercent(group.avgHook)}</li>`)
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

  rows.forEach(row => {
    const name = (row[axisKey] || "").trim() || "Unspecified";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  });

  return Array.from(groups.entries()).map(([name, grp]) => {
    const n = grp.length;

    const tofGrp = grp.filter((row) => normalizeObjective(row.objective) === "TOF");
    const bofGrp = grp.filter((row) => normalizeObjective(row.objective) === "BOF");
    const convGrp = bofGrp.filter((row) => row.fti > 0);

    const avgHook = tofGrp.length ? average(tofGrp, (r) => r.hook_rate) : null;
    const avgThumb = tofGrp.length ? average(tofGrp, (r) => r.thumb_stop) : null;
    const avgFrequency = tofGrp.length ? average(tofGrp, (r) => r.frequency) : null;
    const avgCpm = tofGrp.length ? average(tofGrp, (r) => r.cpm) : null;
    const avgFti = convGrp.length ? average(convGrp, (r) => r.fti) : null;
    const avgCpa = convGrp.length ? average(convGrp, (r) => r.cpa) : null;

    if (n === 1) {
      const hasTof = tofGrp.length > 0;
      const hasBof = bofGrp.length > 0;
      const tofDelta = avgHook === null ? null : percentDelta(avgHook, benchmarks.avgHook);
      const tofState = avgHook === null
        ? "neutral"
        : avgHook >= benchmarks.avgHook
          ? "good"
          : avgHook < benchmarks.avgHook * 0.7
            ? "bad"
            : "neutral";
      const tofLabel = avgHook === null
        ? "NO DATA"
        : tofState === "good" ? "GOOD" : tofState === "bad" ? "BAD" : "OK";

      return {
        name,
        n,
        avgHook,
        avgThumb,
        avgFrequency,
        avgCpm,
        avgFti,
        avgCpa,
        tofDelta,
        bofDelta: null,
        tofState,
        tofLabel,
        bofState: "neutral",
        bofLabel: "NO DATA",
        tofGood: false,
        bofGood: false,
        bofDeltaPositive: false,
        diagnosis: "Insufficient data — do not conclude",
        diagnosisClass: "neutral",
        confidence: confidenceLabel(n),
        tofSignal: hasTof ? null : "No TOF data",
        bofSignal: hasBof ? null : "BOF not launched yet"
      };
    }

    const hasTof = tofGrp.length > 0;
    const hasBof = bofGrp.length > 0;
    const tofStrong = hasTof && avgHook >= benchmarks.avgHook;
    const tofVsAvg = hasTof ? percentDelta(avgHook, benchmarks.avgHook) : null;
    const tofState = !hasTof
      ? "neutral"
      : avgHook >= benchmarks.avgHook
        ? "good"
        : avgHook < benchmarks.avgHook * 0.7
          ? "bad"
          : "neutral";
    const tofLabel = !hasTof ? "NO DATA" : tofState === "good" ? "GOOD" : tofState === "bad" ? "BAD" : "OK";

    let bofDelta = null;
    let bofStrong = false;
    let bofPositive = false;
    let bofState = "neutral";
    let bofLabel = "NO DATA";
    let bofSignal = null;
    let tofSignal = hasTof ? null : "No TOF data";

    if (!hasBof) {
      bofDelta = null;
      bofState = "neutral";
      bofLabel = "NO DATA";
      bofSignal = "BOF not launched yet";
    } else if (!convGrp.length) {
      bofDelta = null;
      bofState = "neutral";
      bofLabel = "NO DATA";
    } else {
      const ftiVsAvg = benchmarks.avgFti > 0
        ? ((avgFti - benchmarks.avgFti) / benchmarks.avgFti * 100)
        : 0;

      bofStrong = avgFti >= benchmarks.avgFti && avgCpa <= benchmarks.avgCpa;
      bofDelta = ftiVsAvg;
      bofPositive = avgFti >= benchmarks.avgFti;

      if (avgFti >= benchmarks.avgFti && avgCpa <= benchmarks.avgCpa) {
        bofState = "good";
        bofLabel = "GOOD";
      } else if (avgFti < benchmarks.avgFti * 0.7) {
        bofState = "bad";
        bofLabel = "BAD";
      }
    }

    let diagnosis;
    let diagnosisClass;

    if (!hasTof && !hasBof) {
      diagnosis = "No TOF or BOF data yet";
      diagnosisClass = "neutral";
    } else if (tofStrong && bofStrong) {
      diagnosis = "Working — strong TOF and BOF";
      diagnosisClass = "strong-bof";
    } else if (tofStrong && !convGrp.length) {
      diagnosis = "Strong hook — no conversion data yet";
      diagnosisClass = "strong-hook";
    } else if (tofStrong && !bofStrong) {
      diagnosis = "Strong hook — weak conversion";
      diagnosisClass = "strong-hook";
    } else if (!tofStrong && bofStrong) {
      diagnosis = "Weak hook — strong conversion (niche)";
      diagnosisClass = "strong-bof";
    } else {
      diagnosis = "Weak on both layers";
      diagnosisClass = "weak";
    }

    return {
      name,
      n,
      avgHook,
      avgThumb,
      avgFrequency,
      avgCpm,
      avgFti,
      avgCpa,
      tofDelta: tofVsAvg,
      bofDelta,
      tofState,
      tofLabel,
      bofState,
      bofLabel,
      tofGood: tofStrong,
      bofGood: bofStrong,
      bofDeltaPositive: bofPositive,
      diagnosis,
      diagnosisClass,
      confidence: confidenceLabel(n),
      tofSignal,
      bofSignal
    };
  }).sort((a, b) => b.n - a.n);
}

function renderPatternCard(group) {
  const confidenceClass = `confidence-${group.confidence.toLowerCase()}`;
  const caution = group.n < 3 ? " ⚠" : "";
  const diagnosisText = group.diagnosis
    .replace(" — ", " · ")
    .replace("Working · strong TOF and BOF", "Strong TOF · Strong BOF")
    .replace("Weak on both layers", "Weak TOF · Weak BOF")
    .replace("Insufficient data · do not conclude", "Insufficient data");
  const hintText = group.n === 1
    ? "→ Need more data"
    : group.tofGood && !group.bofGood
      ? "→ Fix funnel (LP / offer / targeting)"
      : !group.tofGood && group.bofGood
        ? "→ Improve hook (creative)"
        : group.tofGood && group.bofGood
          ? "→ Scale this pattern"
          : "→ Rethink creative";

  return `
    <article class="pattern-card">
      <div class="pattern-name">${escapeHtml(group.name)}</div>
      <div class="pattern-meta">n=${group.n} · <span class="${confidenceClass}">${group.confidence} confidence${caution}</span></div>
      <div class="signal-block tof ${group.tofState}">
        <div class="signal-header">
          <span class="signal-title">👁 TOF</span>
          <span class="signal-badge ${group.tofState}">${group.tofLabel}</span>
        </div>
        <div class="signal-metric">Hook ${group.avgHook === null ? "—" : formatPercent(group.avgHook)}</div>
        <div class="signal-sub">${group.tofSignal || `vs avg ${group.tofDelta === null ? "—" : `${group.tofDelta >= 0 ? "+" : ""}${group.tofDelta.toFixed(0)}%`}`}</div>
      </div>
      <div class="signal-block bof ${group.bofState}">
        <div class="signal-header">
          <span class="signal-title">💰 BOF</span>
          <span class="signal-badge ${group.bofState}">${group.bofLabel}</span>
        </div>
        <div class="signal-metric">FTI ${group.avgFti === null ? "—" : formatNumber(group.avgFti)}</div>
        <div class="signal-sub">${group.bofSignal || (group.avgFti === null ? "No data" : `vs avg ${group.bofDelta >= 0 ? "+" : ""}${group.bofDelta.toFixed(0)}%`)}</div>
      </div>
      <div class="pattern-metrics">Hook ${group.avgHook === null ? "—" : formatPercent(group.avgHook)} · Thumb ${group.avgThumb === null ? "—" : formatPercent(group.avgThumb)} · Frequency ${group.avgFrequency === null ? "—" : formatNumber(group.avgFrequency)} · CPM ${group.avgCpm === null ? "—" : formatCurrency(group.avgCpm)} · FTI ${group.avgFti === null ? "—" : formatNumber(group.avgFti)} · CPA ${group.avgCpa === null ? "—" : formatCurrency(group.avgCpa)}</div>
      <div class="pattern-diagnosis">${escapeHtml(diagnosisText)}</div>
      <div class="pattern-hint">${escapeHtml(hintText)}</div>
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

function normalizeObjective(value) {
  return String(value || "").trim().toUpperCase();
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

function percentDelta(value, benchmark) {
  if (benchmark === 0) return 0;
  return ((value - benchmark) / benchmark) * 100;
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


function getStatusClass(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "kill") return "status-kill";
  if (normalized === "scale") return "status-scale";
  if (normalized === "not launched" || normalized === "pending") return "status-pending";
  return "";
}

function truncateText(value, maxLength) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
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
