// data-service.js — single source of truth reader
const SHEET_ID = '1o9WPWpJtaHAQB6dB1tfsQJtKIuk1ea38-jQuJIOPLa8';
const _cache = {};

function sheetUrl(tabName) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
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
      cell = '';
      i += 1;
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(cell.trim());
      cell = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
      i += 1;
      continue;
    }

    cell += ch;
    i += 1;
  }

  if (cell.length || row.length) {
    row.push(cell.trim());
    if (row.some((v) => v !== '')) rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows[0].map((h) => String(h || '').trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] || '').trim();
    });
    return obj;
  });
}

function toNumber(value, fallback = 0) {
  const parsed = parseFloat(String(value ?? '').replace(/[$,%฿,]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pick(obj, keys, fallback = '') {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return fallback;
}

function fmtCW(cwValue) {
  const raw = String(cwValue || '').trim();
  if (!raw) return '—';
  if (/^CW\d+$/i.test(raw)) return raw.toUpperCase();
  if (/^\d+$/.test(raw)) return `CW${raw}`;
  return raw;
}

async function fetchTab(tabName) {
  if (_cache[tabName]) return _cache[tabName];

  _cache[tabName] = fetch(sheetUrl(tabName)).then(async (res) => {
    if (!res.ok) throw new Error(`Failed to load tab ${tabName}`);
    const text = await res.text();
    return parseCSV(text);
  });

  return _cache[tabName];
}

async function fetchTabs(tabNames) {
  const pairs = await Promise.all(tabNames.map(async (name) => [name, await fetchTab(name)]));
  return Object.fromEntries(pairs);
}

async function getConfig() {
  const rows = await fetchTab('config');
  const map = {};
  rows.forEach((r) => {
    const key = String(pick(r, ['key', 'Key'])).trim();
    const value = pick(r, ['value', 'Value']);
    if (key) map[key] = String(value).trim();
  });
  return map;
}

async function fetchConfig() {
  return getConfig();
}

async function getUsdThbRate() {
  const config = await getConfig();
  return toNumber(config.usd_thb_rate, 34);
}

window.ZaapiDataService = {
  SHEET_ID,
  sheetUrl,
  parseCSV,
  toNumber,
  pick,
  fmtCW,
  fetchTab,
  fetchTabs,
  getConfig,
  fetchConfig,
  getUsdThbRate
};
