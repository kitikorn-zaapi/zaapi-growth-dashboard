// meta-asset.js — Asset Layer (Layer 3)
// Reads creative_log (IMPORTRANGE'd from the accumulator tab of the source sheet).
//
// Schema: values arrive as pre-formatted strings like "$1,767.39" and "75.88%".
// Native currency is USD. Toggle to THB via editable forex rate (default 34).
// Each ad_code has an optional creative image at ./assets/{ad_code}.webp —
// click the card header to reveal it, click again to hide.

let rows = [];
let usdRate = 34;
let currency = 'USD';
let objectiveFilter = 'All';
let sortKey = 'hook_rate_lw';
let sortDir = 'desc';
let assetBase = './assets/';   // overridable via config.asset_base_url

const F = (row, keys, fallback = '') => ZaapiDataService.pick(row, keys, fallback);

// --- parsers ---------------------------------------------------------------
function parseNum(v) {
  if (v === undefined || v === null) return NaN;
  const s = String(v).trim();
  if (!s || s === '—' || s === '-') return NaN;
  const cleaned = s.replace(/[$฿,\s%]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}
const num = (v, fallback = 0) => (Number.isFinite(parseNum(v)) ? parseNum(v) : fallback);

// --- formatters ------------------------------------------------------------
function fmtMoney(usd) {
  if (!Number.isFinite(usd)) return '—';
  if (currency === 'USD') return `$${usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `฿${(usd * usdRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
const fmtPct   = (v) => Number.isFinite(v) ? `${v.toFixed(1)}%` : '—';
const fmtFreq  = (v) => Number.isFinite(v) ? v.toFixed(2) : '—';
const fmtNum   = (v, d = 1) => Number.isFinite(v) ? v.toFixed(d) : '—';

function deltaHTML(lw, pw, direction = 'higher_better', unit = 'pct_abs') {
  if (!Number.isFinite(lw) || !Number.isFinite(pw) || pw === 0) return '';
  const diff = lw - pw;
  const sign = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
  const good = direction === 'higher_better' ? diff > 0 : diff < 0;
  const color = diff === 0 ? 'text-slate-500' : good ? 'text-emerald-400' : 'text-red-400';
  let display;
  if (unit === 'pct_abs') display = `${Math.abs(diff).toFixed(1)}pp`;
  else if (unit === 'pct_rel') display = `${((Math.abs(diff) / pw) * 100).toFixed(0)}%`;
  else display = Math.abs(diff).toFixed(2);
  return `<span class="${color} text-xs ml-1">${sign} ${display}</span>`;
}

// --- signals ---------------------------------------------------------------
const killFlag    = (r) => r.hook_rate_lw > 0 && r.hook_rate_lw < 15;
const scaleFlag   = (r) => r.hook_rate_lw > 35 && r.fti_lw >= 2;
const fatigueFlag = (r) => r.frequency_lw > 3 && !(r.fti_lw > 0);
function signalClass(r) {
  if (killFlag(r))    return 'border-red-500';
  if (scaleFlag(r))   return 'border-emerald-500';
  if (fatigueFlag(r)) return 'border-yellow-500';
  return 'border-slate-700';
}

// --- parse row -------------------------------------------------------------
function parseRow(raw) {
  return {
    ad_code:      F(raw, ['ad_code', 'Ad Code']),
    status:       F(raw, ['status', 'Status'], 'Live'),
    region:       F(raw, ['region', 'Region']),
    prod:         F(raw, ['prod', 'Production']),
    angle:        F(raw, ['angle', 'Angle']),
    feature1:     F(raw, ['feature1', 'Feature 1']),
    objective:    F(raw, ['Objective', 'objective', 'funnel']),
    assessment:   F(raw, ['assessment', 'Claude Notes']),

    spend:        num(F(raw, ['spend'])),
    hook_rate:    num(F(raw, ['hook_rate'])),
    thumb_stop:   num(F(raw, ['thumb_stop'])),
    frequency:    num(F(raw, ['frequency'])),
    cpm:          num(F(raw, ['CPM', 'cpm'])),
    ctr:          num(F(raw, ['ctr'])),
    fti:          num(F(raw, ['fti'])),
    cpa:          num(F(raw, ['cpa'])),

    spend_tof_lw: num(F(raw, ['spend_tof_lw'])),
    spend_bof_lw: num(F(raw, ['spend_bof_lw'])),
    hook_rate_lw: num(F(raw, ['hook_rate_lw'])),
    frequency_lw: num(F(raw, ['frequency_lw'])),
    cpm_lw:       num(F(raw, ['CPM_lw', 'cpm_lw'])),
    fti_lw:       num(F(raw, ['fti_lw'])),
    cpa_lw:       num(F(raw, ['cpa_lw'])),

    spend_tof_pw: num(F(raw, ['spend_tof_pw'])),
    spend_bof_pw: num(F(raw, ['spend_bof_pw'])),
    hook_rate_pw: num(F(raw, ['hook_rate_pw'])),
    frequency_pw: num(F(raw, ['frequency_pw'])),
    cpm_pw:       num(F(raw, ['CPM_pw', 'cpm_pw'])),
    fti_pw:       num(F(raw, ['fti_pw'])),
    cpa_pw:       num(F(raw, ['cpa_pw'])),
  };
}

// --- card ------------------------------------------------------------------
// Unique DOM id per (ad_code, objective) so toggle state survives filter changes.
function cardId(r) {
  return `card-${r.ad_code}-${(r.objective || 'NA').toLowerCase()}`.replace(/[^a-zA-Z0-9-]/g, '-');
}

function renderCard(r) {
  const objective = (r.objective || '').toUpperCase();
  const isBOF = objective === 'BOF';
  const spendLW = isBOF ? r.spend_bof_lw : r.spend_tof_lw;
  const spendPW = isBOF ? r.spend_bof_pw : r.spend_tof_pw;

  const hookDelta  = deltaHTML(r.hook_rate_lw, r.hook_rate_pw, 'higher_better', 'pct_abs');
  const freqDelta  = deltaHTML(r.frequency_lw, r.frequency_pw, 'lower_better', 'abs');
  const cpmDelta   = deltaHTML(r.cpm_lw, r.cpm_pw, 'lower_better', 'pct_rel');
  const spendDelta = deltaHTML(spendLW, spendPW, 'higher_better', 'pct_rel');
  const ftiDelta   = deltaHTML(r.fti_lw, r.fti_pw, 'higher_better', 'abs');
  const cpaDelta   = deltaHTML(r.cpa_lw, r.cpa_pw, 'lower_better', 'pct_rel');

  const statusColor = String(r.status).toLowerCase() === 'kill'
    ? 'bg-red-900 text-red-200' : 'bg-emerald-900 text-emerald-200';
  const objBadgeColor = isBOF ? 'bg-purple-900 text-purple-200' : 'bg-sky-900 text-sky-200';

  const tofBlock = `
    <div class="text-sm">Hook: <b>${fmtPct(r.hook_rate_lw)}</b>${hookDelta}</div>
    <div class="text-sm">Thumb-Stop: <b>${fmtPct(r.thumb_stop)}</b> <span class="text-slate-500 text-xs">(lifetime)</span></div>
    <div class="text-sm">CPM: <b>${fmtMoney(r.cpm_lw)}</b>${cpmDelta}</div>
  `;
  const bofBlock = `
    <div class="text-sm">FTI: <b>${fmtNum(r.fti_lw)}</b>${ftiDelta}</div>
    <div class="text-sm">CPA: <b>${r.fti_lw > 0 ? fmtMoney(r.cpa_lw) : '—'}</b>${cpaDelta}</div>
  `;

  const imgUrl = `${assetBase}${r.ad_code}.webp`;
  const cid = cardId(r);

  return `
    <article id="${cid}" class="bg-slate-900 border ${signalClass(r)} rounded p-3 space-y-1" data-ad-code="${r.ad_code}">
      <div class="flex justify-between items-start gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <button
            class="flex-shrink-0 w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center justify-center transition-colors"
            onclick="toggleAsset('${cid}', '${imgUrl.replace(/'/g, "\\'")}', '${r.ad_code}')"
            title="View creative"
            aria-label="View creative"
          >👁</button>
          <b class="text-sm truncate">${r.ad_code}</b>
        </div>
        <div class="flex gap-1 flex-shrink-0">
          ${objective ? `<span class="text-xs px-1.5 py-0.5 rounded ${objBadgeColor}">${objective}</span>` : ''}
          <span class="text-xs px-1.5 py-0.5 rounded ${statusColor}">${r.status || 'Live'}</span>
        </div>
      </div>

      <!-- asset preview slot (hidden until toggled) -->
      <div class="asset-slot hidden" data-loaded="false"></div>

      <div class="text-xs text-slate-400">${r.region} · ${r.prod} · ${r.angle}</div>
      <div class="text-xs text-slate-500">${r.feature1 || ''}</div>

      <div class="border-t border-slate-800 pt-2 mt-1 space-y-0.5">
        <div class="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Last Week (vs prior week)</div>
        ${isBOF ? bofBlock : tofBlock}
        <div class="text-sm">Frequency: <b>${fmtFreq(r.frequency_lw)}</b>${freqDelta}</div>
        <div class="text-sm">Spend (${objective || '—'}): <b>${fmtMoney(spendLW)}</b>${spendDelta}</div>
      </div>

      ${r.assessment ? `<div class="text-xs text-slate-400 border-t border-slate-800 pt-2 mt-1">${r.assessment}</div>` : ''}
    </article>`;
}

// --- asset toggle (exposed globally for onclick handler) -------------------
window.toggleAsset = function (cardId, imgUrl, adCode) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const slot = card.querySelector('.asset-slot');
  if (!slot) return;

  const isHidden = slot.classList.contains('hidden');
  if (!isHidden) {
    slot.classList.add('hidden');
    return;
  }

  // lazy-load: only build the <img> the first time
  if (slot.dataset.loaded !== 'true') {
    slot.innerHTML = `
      <div class="mt-1 mb-2 rounded overflow-hidden bg-slate-950 border border-slate-800 relative">
        <img
          src="${imgUrl}"
          alt="${adCode}"
          class="w-full h-auto block"
          loading="lazy"
          onerror="this.parentElement.innerHTML='<div class=&quot;text-xs text-slate-500 p-3 text-center&quot;>No asset file found at<br><code class=&quot;text-slate-400&quot;>${imgUrl}</code></div>'"
        />
      </div>`;
    slot.dataset.loaded = 'true';
  }
  slot.classList.remove('hidden');
};

// --- summary table ---------------------------------------------------------
function renderSummary(filtered) {
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (!Number.isFinite(av) && !Number.isFinite(bv)) return 0;
    if (!Number.isFinite(av)) return 1;
    if (!Number.isFinite(bv)) return -1;
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  const cols = [
    { key: '',             label: 'Ad Code' },
    { key: '',             label: 'Obj' },
    { key: '',             label: 'Region' },
    { key: 'hook_rate_lw', label: 'Hook LW' },
    { key: 'frequency_lw', label: 'Freq LW' },
    { key: 'cpm_lw',       label: 'CPM LW' },
    { key: 'fti_lw',       label: 'FTI LW' },
    { key: 'cpa_lw',       label: 'CPA LW' },
    { key: 'spend',        label: 'Spend (total)' },
  ];
  const head = `<tr class="text-slate-400">${
    cols.map(c => {
      const arrow = sortKey === c.key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';
      return `<th data-k="${c.key}" class="text-left px-2 py-1 border-b border-slate-700 ${c.key ? 'cursor-pointer hover:text-white' : ''}">${c.label}${arrow}</th>`;
    }).join('')
  }</tr>`;

  const body = sorted.map(r => `<tr>
    <td class="px-2 py-1 border-b border-slate-800">${r.ad_code}</td>
    <td class="px-2 py-1 border-b border-slate-800">${r.objective || '—'}</td>
    <td class="px-2 py-1 border-b border-slate-800">${r.region}</td>
    <td class="px-2 py-1 border-b border-slate-800">${fmtPct(r.hook_rate_lw)}</td>
    <td class="px-2 py-1 border-b border-slate-800">${fmtFreq(r.frequency_lw)}</td>
    <td class="px-2 py-1 border-b border-slate-800">${fmtMoney(r.cpm_lw)}</td>
    <td class="px-2 py-1 border-b border-slate-800">${fmtNum(r.fti_lw)}</td>
    <td class="px-2 py-1 border-b border-slate-800">${r.fti_lw > 0 ? fmtMoney(r.cpa_lw) : '—'}</td>
    <td class="px-2 py-1 border-b border-slate-800">${fmtMoney(r.spend)}</td>
  </tr>`).join('');

  const table = document.getElementById('summary');
  table.innerHTML = head + body;
  table.querySelectorAll('th[data-k]').forEach(th =>
    th.addEventListener('click', () => {
      const k = th.dataset.k;
      if (!k) return;
      if (sortKey === k) sortDir = sortDir === 'desc' ? 'asc' : 'desc';
      else { sortKey = k; sortDir = 'desc'; }
      render();
    })
  );
}

// --- render ----------------------------------------------------------------
function render() {
  const filtered = rows.filter(r =>
    objectiveFilter === 'All' ? true : String(r.objective).toUpperCase() === objectiveFilter
  );
  document.getElementById('cards').innerHTML = filtered.length
    ? filtered.map(renderCard).join('')
    : '<div class="text-sm text-slate-500 col-span-full">No ads match the current filters.</div>';
  renderSummary(filtered);
}

// --- init ------------------------------------------------------------------
async function initMeta() {
  const loading = document.getElementById('loading');
  try {
    const raw = await ZaapiDataService.fetchTab('creative_log');
    rows = raw.map(parseRow).filter(r => r.ad_code);

    const config = await ZaapiDataService.getConfig().catch(() => ({}));
    usdRate = ZaapiDataService.toNumber(config.usd_thb_rate, 34);
    if (config.asset_base_url) assetBase = config.asset_base_url;

    const ccyEl   = document.getElementById('currency');
    const rateEl  = document.getElementById('usd-rate');
    const funnelEl = document.getElementById('funnel');

    if (ccyEl) {
      ccyEl.value = 'USD';
      currency = 'USD';
      ccyEl.addEventListener('change', () => { currency = ccyEl.value; render(); });
    }
    if (rateEl) {
      rateEl.value = usdRate;
      rateEl.addEventListener('change', (e) => {
        usdRate = ZaapiDataService.toNumber(e.target.value, usdRate) || usdRate;
        if (currency === 'THB') render();
      });
    }
    if (funnelEl) {
      funnelEl.addEventListener('change', () => {
        objectiveFilter = funnelEl.value;
        render();
      });
    }

    render();
    loading.classList.add('hidden');
    document.getElementById('content').classList.remove('hidden');
  } catch (error) {
    loading.textContent = `Failed to load data: ${error.message}`;
  }
}

document.addEventListener('DOMContentLoaded', initMeta);
