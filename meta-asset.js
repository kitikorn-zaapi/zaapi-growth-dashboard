// meta-asset.js — Asset Layer (Layer 3)
// Reads creative_log (IMPORTRANGE'd from the accumulator tab of the source sheet).
//
// Schema note: values arrive as pre-formatted strings like "$1,767.39" and "75.88%".
// Native currency is USD. User can toggle to THB with an editable forex rate (default 34).

let rows = [];
let usdRate = 34;
let currency = 'USD';   // default matches source data
let objectiveFilter = 'All';
let sortKey = 'hook_rate_lw';
let sortDir = 'desc';

const F = (row, keys, fallback = '') => ZaapiDataService.pick(row, keys, fallback);

// --- parsers for pre-formatted strings ------------------------------------
// "$1,767.39" -> 1767.39 ; "75.88%" -> 75.88 ; blank/— -> NaN
function parseNum(v) {
  if (v === undefined || v === null) return NaN;
  const s = String(v).trim();
  if (!s || s === '—' || s === '-') return NaN;
  const cleaned = s.replace(/[$฿,\s%]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}
const num = (v, fallback = 0) => (Number.isFinite(parseNum(v)) ? parseNum(v) : fallback);

// --- display formatters ----------------------------------------------------
function fmtMoney(usd) {
  if (!Number.isFinite(usd)) return '—';
  if (currency === 'USD') return `$${usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `฿${(usd * usdRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function fmtPct(v) {
  return Number.isFinite(v) ? `${v.toFixed(1)}%` : '—';
}
function fmtFreq(v) {
  return Number.isFinite(v) ? v.toFixed(2) : '—';
}
function fmtNum(v, digits = 1) {
  return Number.isFinite(v) ? v.toFixed(digits) : '—';
}

// --- WoW delta with arrow --------------------------------------------------
// direction: 'higher_better' (FTI, hook rate) vs 'lower_better' (CPA, CPM, frequency)
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

// --- kill / scale / fatigue based on lw values -----------------------------
function killFlag(r)    { return r.hook_rate_lw > 0 && r.hook_rate_lw < 15; }
function scaleFlag(r)   { return r.hook_rate_lw > 35 && r.fti_lw >= 2; }
function fatigueFlag(r) { return r.frequency_lw > 3 && !(r.fti_lw > 0); }
function signalClass(r) {
  if (killFlag(r))    return 'border-red-500';
  if (scaleFlag(r))   return 'border-emerald-500';
  if (fatigueFlag(r)) return 'border-yellow-500';
  return 'border-slate-700';
}

// --- parse creative_log row ------------------------------------------------
function parseRow(raw) {
  return {
    ad_code:     F(raw, ['ad_code', 'Ad Code']),
    status:      F(raw, ['status', 'Status'], 'Live'),
    region:      F(raw, ['region', 'Region']),
    prod:        F(raw, ['prod', 'Production']),
    angle:       F(raw, ['angle', 'Angle']),
    feature1:    F(raw, ['feature1', 'Feature 1']),
    objective:   F(raw, ['Objective', 'objective', 'funnel']),
    assessment:  F(raw, ['assessment', 'Claude Notes']),

    // lifetime / to-date
    spend:       num(F(raw, ['spend'])),
    hook_rate:   num(F(raw, ['hook_rate'])),
    thumb_stop:  num(F(raw, ['thumb_stop'])),
    frequency:   num(F(raw, ['frequency'])),
    cpm:         num(F(raw, ['CPM', 'cpm'])),
    ctr:         num(F(raw, ['ctr'])),
    fti:         num(F(raw, ['fti'])),
    cpa:         num(F(raw, ['cpa'])),

    // last week
    spend_tof_lw: num(F(raw, ['spend_tof_lw'])),
    spend_bof_lw: num(F(raw, ['spend_bof_lw'])),
    hook_rate_lw: num(F(raw, ['hook_rate_lw'])),
    frequency_lw: num(F(raw, ['frequency_lw'])),
    cpm_lw:       num(F(raw, ['CPM_lw', 'cpm_lw'])),
    fti_lw:       num(F(raw, ['fti_lw'])),
    cpa_lw:       num(F(raw, ['cpa_lw'])),

    // prior week
    spend_tof_pw: num(F(raw, ['spend_tof_pw'])),
    spend_bof_pw: num(F(raw, ['spend_bof_pw'])),
    hook_rate_pw: num(F(raw, ['hook_rate_pw'])),
    frequency_pw: num(F(raw, ['frequency_pw'])),
    cpm_pw:       num(F(raw, ['CPM_pw', 'cpm_pw'])),
    fti_pw:       num(F(raw, ['fti_pw'])),
    cpa_pw:       num(F(raw, ['cpa_pw'])),
  };
}

// --- card for one ad -------------------------------------------------------
// Each ad appears twice in source data: one row per Objective (TOF / BOF).
// TOF rows populate hook/CPM; BOF rows populate FTI/CPA. Show only what's relevant.
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
    ? 'bg-red-900 text-red-200'
    : 'bg-emerald-900 text-emerald-200';
  const objBadgeColor = isBOF ? 'bg-purple-900 text-purple-200' : 'bg-sky-900 text-sky-200';

  // Objective-specific metric blocks
  const tofBlock = `
    <div class="text-sm">Hook: <b>${fmtPct(r.hook_rate_lw)}</b>${hookDelta}</div>
    <div class="text-sm">Thumb-Stop: <b>${fmtPct(r.thumb_stop)}</b> <span class="text-slate-500 text-xs">(lifetime)</span></div>
    <div class="text-sm">CPM: <b>${fmtMoney(r.cpm_lw)}</b>${cpmDelta}</div>
  `;
  const bofBlock = `
    <div class="text-sm">FTI: <b>${fmtNum(r.fti_lw)}</b>${ftiDelta}</div>
    <div class="text-sm">CPA: <b>${r.fti_lw > 0 ? fmtMoney(r.cpa_lw) : '—'}</b>${cpaDelta}</div>
  `;

  return `
    <article class="bg-slate-900 border ${signalClass(r)} rounded p-3 space-y-1">
      <div class="flex justify-between items-start gap-2">
        <b class="text-sm truncate">${r.ad_code}</b>
        <div class="flex gap-1 flex-shrink-0">
          ${objective ? `<span class="text-xs px-1.5 py-0.5 rounded ${objBadgeColor}">${objective}</span>` : ''}
          <span class="text-xs px-1.5 py-0.5 rounded ${statusColor}">${r.status || 'Live'}</span>
        </div>
      </div>
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

// --- render orchestrator ---------------------------------------------------
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

    const ccyEl = document.getElementById('currency');
    const rateEl = document.getElementById('usd-rate');
    const funnelEl = document.getElementById('funnel');

    if (ccyEl) {
      ccyEl.value = 'USD';          // default to source currency
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
