const SHEETS_CSV_URL = "PASTE_URL";
const API_URL = `https://api.allorigins.win/raw?url=${encodeURIComponent(SHEETS_CSV_URL)}`;

const NUMERIC_FIELDS = ["spend", "hook_rate", "thumb_stop", "frequency", "ctr", "fti", "cpa"];

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
  try {
    const response = await fetch(API_URL);
    const csvText = await response.text();
    state.rows = parseCsv(csvText);
    render();
  } catch (error) {
    leaderboardEl.innerHTML = `<div class="empty">Failed to load CSV data.</div>`;
    fatigueEl.innerHTML = `<div class="empty">Failed to load CSV data.</div>`;
    nextTestEl.textContent = "No test suggestion available.";
    console.error(error);
  }
}

function parseCsv(csvText) {
  const lines = csvText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const parts = line.split(",").map((part) => part.trim());
    const row = {};

    headers.forEach((header, index) => {
      row[header] = parts[index] ?? "";
    });

    NUMERIC_FIELDS.forEach((field) => {
      row[field] = Number(row[field]) || 0;
    });

    row.status = getStatus(row);
    row.assessment = row.assessment || row.note || row.notes || "No assessment available.";

    return row;
  });
}

function getStatus(row) {
  if (row.hook_rate < 15 || row.ctr < 0.8 || (row.fti === 0 && row.spend > 15)) {
    return "Kill";
  }
  if (row.hook_rate > 35 && row.fti >= 2) {
    return "Scale";
  }
  if (row.fti > 0 && row.fti < 2) {
    return "Watch";
  }
  if (row.spend === 0) {
    return "Pending";
  }
  return "Live";
}

function filteredRows() {
  const region = state.region;
  const rows = region === "All"
    ? [...state.rows]
    : state.rows.filter((row) => (row.region || "").toUpperCase() === region);

  return rows.sort((a, b) => {
    switch (state.sortBy) {
      case "hook_rate_desc":
        return b.hook_rate - a.hook_rate;
      case "spend_desc":
        return b.spend - a.spend;
      case "cpa_asc":
        return a.cpa - b.cpa;
      case "fti_desc":
      default:
        return b.fti - a.fti;
    }
  });
}

function render() {
  const rows = filteredRows();
  renderLeaderboard(rows);
  renderFatigue(rows);
  renderNextTest(rows);
}

function renderLeaderboard(rows) {
  if (rows.length === 0) {
    leaderboardEl.innerHTML = `<div class="empty">No assets found for this region.</div>`;
    return;
  }

  leaderboardEl.innerHTML = rows.map((row) => {
    const adCode = row.ad_code || row.adcode || "UNKNOWN";
    return `
      <article class="asset-card">
        <div class="thumb-wrap" data-code="${escapeHtml(adCode)}">
          <img src="assets/${encodeURIComponent(adCode)}.jpg" alt="${escapeHtml(adCode)}" data-ad-code="${escapeHtml(adCode)}" />
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
        <p class="assessment" title="Click to expand/collapse">${escapeHtml(row.assessment)}</p>
      </article>
    `;
  }).join("");

  leaderboardEl.querySelectorAll("img[data-ad-code]").forEach((imgEl) => {
    imgEl.addEventListener("error", () => {
      const code = imgEl.dataset.adCode || "UNKNOWN";
      imgEl.parentElement.innerHTML = `<div class="img-placeholder">${escapeHtml(code)}</div>`;
    }, { once: true });
  });

  leaderboardEl.querySelectorAll(".assessment").forEach((assessmentEl) => {
    assessmentEl.addEventListener("click", () => {
      assessmentEl.classList.toggle("expanded");
    });
  });
}

function renderFatigue(rows) {
  const fatigueRows = rows.filter((row) => row.frequency > 2.5 || (row.hook_rate < 15 && row.spend > 0));

  if (fatigueRows.length === 0) {
    fatigueEl.innerHTML = `<div class="empty">No fatigue risks detected.</div>`;
    return;
  }

  fatigueEl.innerHTML = `
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
              <td>${escapeHtml(row.ad_code || row.adcode || "-")}</td>
              <td>${escapeHtml(row.region || "-")}</td>
              <td>${row.hook_rate.toFixed(1)}%</td>
              <td>${row.frequency.toFixed(2)}</td>
              <td>${issue}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderNextTest(rows) {
  const spentRows = rows.filter((row) => row.spend > 0);
  if (spentRows.length === 0) {
    nextTestEl.textContent = "No spend yet. Launch first batch before suggesting next test.";
    return;
  }

  const winner = [...spentRows].sort((a, b) => b.fti - a.fti)[0];
  const adCode = winner.ad_code || winner.adcode || "-";

  nextTestEl.innerHTML = `Winner: <strong>${escapeHtml(adCode)}</strong> (${winner.fti.toFixed(2)} FTI, $${winner.cpa.toFixed(2)} CPA)<br>→ Suggested next: test new angle in <strong>${escapeHtml(winner.region || "same")}</strong>.`;
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
