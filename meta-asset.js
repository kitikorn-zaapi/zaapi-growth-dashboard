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
const regionFilterEl = document.getElementById("region-filter");
const sortByEl = document.getElementById("sort-by");

regionFilterEl.addEventListener("change", (event) => {
  state.region = event.target.value;
  render();
});

sortByEl.addEventListener("change", (event) => {
  state.sortBy = event.target.value;
  render();
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
          <img src="assets/${encodeURIComponent(adCode)}.jpg" alt="${escapeHtml(adCode)}" loading="lazy" />
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
    img.addEventListener("error", () => {
      const wrapper = img.parentElement;
      const adCode = wrapper.dataset.adCode || "UNKNOWN";
      wrapper.innerHTML = `<div class="img-placeholder">${escapeHtml(adCode)}</div>`;
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
                <td>${escapeHtml(row.ad_code || "-")}</td>
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

  nextTestEl.innerHTML = `Winner: <strong>${escapeHtml(adCode)}</strong> (${winner.fti.toFixed(2)} FTI, $${winner.cpa.toFixed(2)} CPA)<br>→ Suggested next: test new angle`;
}

function metricCell(label, value) {
  return `<div><div class="metric-label">${label}</div><div class="metric-value">${value}</div></div>`;
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
