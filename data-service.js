const SHEET_ID = "1o9WPWpJtaHAQB6dB1tfsQJtKIuk1ea38-jQuJIOPLa8";
const BASE_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=`;

const sessionCache = {
  tabs: new Map(),
  config: null
};

function buildSheetUrl(tabName) {
  return `${BASE_URL}${encodeURIComponent(tabName)}`;
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i += 1;
      continue;
    }

    if (ch === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      i += 1;
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(cell.trim());
      cell = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
      i += 1;
      continue;
    }

    cell += ch;
    i += 1;
  }

  if (cell.length || row.length) {
    row.push(cell.trim());
    if (row.some((v) => v !== "")) rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows[0].map((h) => String(h || "").trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] || "").trim();
    });
    return obj;
  });
}

function toNumber(value, fallback = 0) {
  const parsed = parseFloat(String(value ?? "").replace(/[$,%฿,]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fmtCW(cwValue) {
  const raw = String(cwValue || "").trim();
  if (!raw) return "—";
  if (/^CW\d+$/i.test(raw)) return raw.toUpperCase();
  if (/^\d+$/.test(raw)) return `CW${raw}`;
  return raw;
}

async function fetchTab(tabName) {
  if (sessionCache.tabs.has(tabName)) return sessionCache.tabs.get(tabName);

  const promise = fetch(buildSheetUrl(tabName)).then(async (res) => {
    if (!res.ok) throw new Error(`Failed to load tab ${tabName}`);
    return parseCSV(await res.text());
  });

  sessionCache.tabs.set(tabName, promise);
  return promise;
}

async function fetchTabs(tabNames) {
  const pairs = await Promise.all(tabNames.map(async (name) => [name, await fetchTab(name)]));
  return Object.fromEntries(pairs);
}

async function fetchConfig() {
  if (sessionCache.config) return sessionCache.config;
  const rows = await fetchTab("config");
  const map = {};

  rows.forEach((row) => {
    const key = (row.key || row.Key || "").trim();
    const value = row.value ?? row.Value ?? "";
    if (key) map[key] = String(value).trim();
  });

  sessionCache.config = map;
  return map;
}

async function getUsdThbRate() {
  const config = await fetchConfig();
  return toNumber(config.usd_thb_rate, 34);
}

window.ZaapiDataService = {
  SHEET_ID,
  fetchTab,
  fetchTabs,
  fetchConfig,
  getUsdThbRate,
  toNumber,
  fmtCW
};
