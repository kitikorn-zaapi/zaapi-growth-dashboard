// meta-asset.js — Asset Layer (Layer 3)
// Features:
//   - Currency toggle (USD/THB) with editable forex rate
//   - Funnel filter (All/TOF/BOF) — maps to Objective column
//   - Region filter (All/TH/SEA/ROW)
//   - Segment Analysis panel — aggregate perf by Angle / Production / Region / Feature
//   - AI suggestion per card (Kill / Scale / New Target / Refresh / Continue / Watch)
//   - Image toggle per card (webp from ./assets/{ad_code}.webp)

let rows = [];
let usdRate = 34;
let currency = 'USD';
let filterFunnel = 'All';
let filterRegion = 'All';
let segmentDim = 'angle';
let sortKey = 'hook_rate_lw';
let sortDir = 'desc';
let assetBase = './assets/';

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
const num = (v, fb = 0) => (Number.isFinite(parseNum(v)) ? parseNum(v) : fb);

// --- formatters ------------------------------------------------------------
function fmtMoney(usd) {
  if (!Number.isFinite(usd)) return '—';
  if (currency === 'USD') return `$${usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `฿${(usd * usdRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
const fmtPct  = (v)       => Number.isFinite(v) ? `${v.toFixed(1)}%` : '—';
const fmtFreq = (v)       => Number.isFinite(v) ? v.toFixed(2) : '—';
const fmtNum  = (v, d=1)  => Number.isFinite(v) ? v.toFixed(d) : '—';

function deltaHTML(lw, pw, dir = 'higher_better', unit = 'pct_abs') {
  if (!Number.isFinite(lw) || !Number.isFinite(pw) || pw === 0) return '';
  const diff = lw - pw;
  const sign = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
  const good = dir === 'higher_better' ? diff > 0 : diff < 0;
  const color = diff === 0 ? 'text-slate-500' : good ? 'text-emerald-400' : 'text-red-400';
  let display;
  if (unit === 'pct_abs')      display = `${Math.abs(diff).toFixed(1)}pp`;
  else if (unit === 'pct_rel') display = `${((Math.abs(diff) / pw) * 100).toFixed(0)}%`;
  else                         display = Math.abs(diff).toFixed(2);
  return `<span class="${color} text-xs ml-1">${sign} ${display}</span>`;
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

    spend:        num(F(raw, ['spend'])),
    hook_rate:    num(F(raw, ['hook_rate'])),
    thumb_stop:   num(F(raw, ['thumb_stop'])),
    frequency:    num(F(raw, ['frequency'])),
    cpm:          num(F(raw, ['CPM', 'cpm'])),
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

// --- AI suggestion per row -------------------------------------------------
// Returns { icon, label, reason, cls } — cls is the Tailwind class chain for the badge.
function suggestion(r) {
  const isBOF   = (r.objective || '').toUpperCase() === 'BOF';
  const hookLw  = r.hook_rate_lw;
  const hookPw  = r.hook_rate_pw;
  const freqLw  = r.frequency_lw;
  const ftiLw   = r.fti_lw;
  const cpmLw   = r.cpm_lw;
  const cpmPw   = r.cpm_pw;
  const spendLw = isBOF ? r.spend_bof_lw : r.spend_tof_lw;

  const C = {
    kill:    'bg-red-950/60 border-red-900 text-red-300',
    scale:   'bg-emerald-950/60 border-emerald-900 text-emerald-300',
    target:  'bg-purple-950/60 border-purple-900 text-purple-300',
    channel: 'bg-cyan-950/60 border-cyan-900 text-cyan-300',
    refresh: 'bg-yellow-950/60 border-yellow-900 text-yellow-300',
    watch:   'bg-orange-950/60 border-orange-900 text-orange-300',
    nodata:  'bg-slate-900/60 border-slate-700 text-slate-400',
    cont:    'bg-slate-900/60 border-slate-700 text-slate-300',
  };

  // 0) no data
  if (!Number.isFinite(spendLw) || spendLw < 10) {
    return { icon: '⏳', label: 'NO DATA', reason: 'Spend too low last week to judge', cls: C.nodata };
  }

  // 1) kill (applies to both) — hook collapsed
  if (Number.isFinite(hookLw) && hookLw > 0 && hookLw < 15) {
    return { icon: '🛑', label: 'KILL', reason: `Hook ${hookLw.toFixed(0)}% < 15% — creative isn't landing`, cls: C.kill };
  }

  if (isBOF) {
    // BOF logic — centers on FTI + CPA
    if (Number.isFinite(ftiLw) && ftiLw >= 2) {
      return { icon: '📈', label: 'SCALE', reason: `${ftiLw.toFixed(1)} FTI at ${fmtMoney(r.cpa_lw)} CPA — scale BOF budget`, cls: C.scale };
    }
    if (Number.isFinite(ftiLw) && ftiLw === 0 && spendLw >= 50) {
      return { icon: '🎯', label: 'NEW TARGET', reason: `${fmtMoney(spendLw)} spend, 0 FTI — test new audience`, cls: C.target };
    }
    if (Number.isFinite(freqLw) && freqLw > 3 && !(ftiLw > 0)) {
      return { icon: '♻️', label: 'REFRESH', reason: `Freq ${freqLw.toFixed(1)} — rotate creative`, cls: C.refresh };
    }
    if (Number.isFinite(r.cpa_lw) && Number.isFinite(r.cpa_pw) && r.cpa_pw > 0 && r.cpa_lw > r.cpa_pw * 1.5) {
      return { icon: '📡', label: 'NEW CHANNEL', reason: `CPA up ${((r.cpa_lw / r.cpa_pw - 1) * 100).toFixed(0)}% WoW — try different placement`, cls: C.channel };
    }
    return { icon: '✅', label: 'CONTINUE', reason: 'Healthy — maintain', cls: C.cont };
  }

  // TOF logic — centers on Hook + CPM + Frequency
  if (Number.isFinite(hookLw) && hookLw > 35 && (!Number.isFinite(freqLw) || freqLw < 2.5)) {
    return { icon: '📈', label: 'SCALE', reason: `Hook ${hookLw.toFixed(0)}% + freq ${fmtFreq(freqLw)} — scale TOF`, cls: C.scale };
  }
  if (Number.isFinite(freqLw) && freqLw > 3) {
    return { icon: '♻️', label: 'REFRESH', reason: `Freq ${freqLw.toFixed(1)} — audience saturated`, cls: C.refresh };
  }
  if (Number.isFinite(hookLw) && Number.isFinite(hookPw) && (hookPw - hookLw) > 10) {
    return { icon: '📉', label: 'WATCH', reason: `Hook dropped ${(hookPw - hookLw).toFixed(0)}pp WoW — creative tiring`, cls: C.watch };
  }
  if (Number.isFinite(cpmLw) && Number.isFinite(cpmPw) && cpmPw > 0 && cpmLw > cpmPw * 1.5) {
    return { icon: '📡', label: 'NEW CHANNEL', reason: `CPM up ${((cpmLw / cpmPw - 1) * 100).toFixed(0)}% WoW — test different placement`, cls: C.channel };
  }
  if (Number.isFinite(hookLw) && hookLw >= 25 && hookLw <= 35) {
    return { icon: '👀', label: 'WATCH', reason: `Hook ${hookLw.toFixed(0)}% — borderline, need more data`, cls: C.watch };
  }
  return { icon: '✅', label: 'CONTINUE', reason: 'Healthy — maintain', cls: C.cont };
}

// --- border color based on signal ------------------------------------------
function borderForSuggestion(s) {
  if (s.label === 'KILL')        return 'border-red-500';
  if (s.label === 'SCALE')       return 'border-emerald-500';
  if (s.label === 'REFRESH')     return 'border-yellow-500';
  if (s.label === 'NEW TARGET')  return 'border-purple-500';
  if (s.label === 'NEW CHANNEL') return 'border-cyan-500';
  if (s.label === 'WATCH')       return 'border-orange-500';
  return 'border-slate-700';
}

// --- card ------------------------------------------------------------------
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

  const sug = suggestion(r);
  const border = borderForSuggestion(sug);

  const statusColor = String(r.status).toLowerCase() === 'kill'
    ? 'bg-red-900 text-red-200' : 'bg-emerald-900 text-emerald-200';
  const objBadgeColor = isBOF ? 'bg-purple-900 text-purple-200' : 'bg-sky-900 text-sky-200';

  const tofBlock = `
    <div class="text-sm">Hook: <b>${fmtPct(r.hook_rate_lw)}</b>${hookDelta}</div>
    <div class="text-sm">Thumb-Stop: <b>${fmtPct(r.thumb_stop)}</b> <span class="text-slate-500 text-xs">(lifetime)</span></div>
    <div class="text-sm">CPM: <b>${fmtMoney(r.cpm_lw)}</b>${cpmDelta}</div>`;
  const bofBlock = `
    <div class="text-sm">FTI: <b>${fmtNum(r.fti_lw)}</b>${ftiDelta}</div>
    <div class="text-sm">CPA: <b>${r.fti_lw > 0 ? fmtMoney(r.cpa_lw) : '—'}</b>${cpaDelta}</div>`;

  const imgUrl = `${assetBase}${r.ad_code}.webp`;
  const cid = cardId(r);

  return `
    <article id="${cid}" class="bg-slate-900 border ${border} rounded p-3 space-y-1" data-ad-code="${r.ad_code}">
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

      <!-- AI suggestion strip -->
      <div class="border ${sug.cls} rounded px-2 py-1.5 flex items-start gap-2 text-xs" title="${sug.reason.replace(/"/g, '&quot;')}">
        <span class="flex-shrink-0">${sug.icon}</span>
        <div class="min-w-0">
          <div class="font-bold">${sug.label}</div>
          <div class="text-[11px] leading-tight opacity-80">${sug.reason}</div>
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

// --- asset toggle (global for onclick) -------------------------------------
window.toggleAsset = function (cardElId, imgUrl, adCode) {
  const card = document.getElementById(cardElId);
  if (!card) return;
  const slot = card.querySelector('.asset-slot');
  if (!slot) return;
  if (!slot.classList.contains('hidden')) { slot.classList.add('hidden'); return; }
  if (slot.dataset.loaded !== 'true') {
    slot.innerHTML = `
      <div class="mt-1 mb-2 rounded overflow-hidden bg-slate-950 border border-slate-800 relative">
        <img src="${imgUrl}" alt="${adCode}" class="w-full h-auto block" loading="lazy"
          onerror="this.parentElement.innerHTML='<div class=&quot;text-xs text-slate-500 p-3 text-center&quot;>No asset file found at<br><code class=&quot;text-slate-400&quot;>${imgUrl}</code></div>'" />
      </div>`;
    slot.dataset.loaded = 'true';
  }
  slot.classList.remove('hidden');
};

// --- SEGMENT ANALYSIS ------------------------------------------------------
// Dedupe to one entry per ad_code: take TOF metrics from TOF row, BOF metrics from BOF row.
function buildAdMap(filteredRows) {
  const byCode = new Map();
  filteredRows.forEach(r => {
    if (!byCode.has(r.ad_code)) {
      byCode.set(r.ad_code, {
        ad_code: r.ad_code,
        region: r.region, prod: r.prod, angle: r.angle, feature1: r.feature1,
        spend_total: r.spend,
      });
    }
    const a = byCode.get(r.ad_code);
    const obj = (r.objective || '').toUpperCase();
    if (obj === 'TOF') {
      a.hook_rate_lw  = r.hook_rate_lw;
      a.thumb_stop    = r.thumb_stop;
      a.cpm_lw        = r.cpm_lw;
      a.frequency_lw  = r.frequency_lw;
      a.spend_tof_lw  = r.spend_tof_lw;
    } else if (obj === 'BOF') {
      a.fti_lw        = r.fti_lw;
      a.cpa_lw        = r.cpa_lw;
      a.spend_bof_lw  = r.spend_bof_lw;
    }
  });
  return [...byCode.values()];
}

function computeSegments(ads, dim) {
  const groups = new Map();
  ads.forEach(a => {
    const key = a[dim] || '(none)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  });
  return [...groups.entries()].map(([segment, list]) => {
    const hooks = list.map(a => a.hook_rate_lw).filter(Number.isFinite);
    const cpms  = list.map(a => a.cpm_lw).filter(Number.isFinite);
    const totalFti = list.reduce((s, a) => s + (Number.isFinite(a.fti_lw) ? a.fti_lw : 0), 0);
    const spendBof = list.reduce((s, a) => s + (Number.isFinite(a.spend_bof_lw) ? a.spend_bof_lw : 0), 0);
    const spendTof = list.reduce((s, a) => s + (Number.isFinite(a.spend_tof_lw) ? a.spend_tof_lw : 0), 0);
    const spendTotal = list.reduce((s, a) => s + (a.spend_total || 0), 0);
    return {
      segment,
      count: list.length,
      spend_total: spendTotal,
      spend_lw: spendTof + spendBof,
      avg_hook: hooks.length ? hooks.reduce((s, x) => s + x, 0) / hooks.length : NaN,
      avg_cpm:  cpms.length  ? cpms.reduce((s, x) => s + x, 0) / cpms.length  : NaN,
      total_fti: totalFti,
      avg_cpa:   totalFti > 0 ? spendBof / totalFti : NaN,
    };
  }).sort((a, b) => b.spend_total - a.spend_total);
}

// Highlight best/worst hook in segment table
function segmentCellColor(val, allVals, dir = 'higher_better') {
  const valid = allVals.filter(Number.isFinite);
  if (!Number.isFinite(val) || valid.length < 2) return '';
  const max = Math.max(...valid), min = Math.min(...valid);
  if (max === min) return '';
  if (dir === 'higher_better') {
    if (val === max) return 'text-emerald-400 font-bold';
    if (val === min) return 'text-red-400';
  } else {
    if (val === min) return 'text-emerald-400 font-bold';
    if (val === max) return 'text-red-400';
  }
  return '';
}

function renderSegmentTable(filteredRows) {
  const ads = buildAdMap(filteredRows);
  const segs = computeSegments(ads, segmentDim);

  const hooks = segs.map(s => s.avg_hook);
  const cpms  = segs.map(s => s.avg_cpm);
  const ftis  = segs.map(s => s.total_fti);
  const cpas  = segs.map(s => s.avg_cpa);

  const dimLabel = { angle: 'Angle', prod: 'Production', region: 'Region', feature1: 'Feature' }[segmentDim] || segmentDim;

  const head = `<tr class="text-slate-400">${
    [dimLabel, '# Ads', 'Spend (total)', 'Spend (LW)', 'Avg Hook LW', 'Avg CPM LW', 'Total FTI LW', 'Avg CPA LW']
      .map(h => `<th class="text-left px-2 py-1 border-b border-slate-700 text-xs">${h}</th>`).join('')
  }</tr>`;

  const body = segs.map(s => `<tr>
    <td class="px-2 py-1 border-b border-slate-800 font-semibold">${s.segment}</td>
    <td class="px-2 py-1 border-b border-slate-800">${s.count}</td>
    <td class="px-2 py-1 border-b border-slate-800">${fmtMoney(s.spend_total)}</td>
    <td class="px-2 py-1 border-b border-slate-800">${fmtMoney(s.spend_lw)}</td>
    <td class="px-2 py-1 border-b border-slate-800 ${segmentCellColor(s.avg_hook, hooks, 'higher_better')}">${fmtPct(s.avg_hook)}</td>
    <td class="px-2 py-1 border-b border-slate-800 ${segmentCellColor(s.avg_cpm, cpms, 'lower_better')}">${fmtMoney(s.avg_cpm)}</td>
    <td class="px-2 py-1 border-b border-slate-800 ${segmentCellColor(s.total_fti, ftis, 'higher_better')}">${fmtNum(s.total_fti)}</td>
    <td class="px-2 py-1 border-b border-slate-800 ${segmentCellColor(s.avg_cpa, cpas, 'lower_better')}">${s.total_fti > 0 ? fmtMoney(s.avg_cpa) : '—'}</td>
  </tr>`).join('');

  document.getElementById('segment-table').innerHTML = head + (body ||
    `<tr><td class="px-2 py-3 text-slate-500" colspan="8">No ads match current filters.</td></tr>`);
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
    { key: '',             label: 'Suggestion' },
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

  const body = sorted.map(r => {
    const sug = suggestion(r);
    return `<tr>
      <td class="px-2 py-1 border-b border-slate-800">${r.ad_code}</td>
      <td class="px-2 py-1 border-b border-slate-800">${r.objective || '—'}</td>
      <td class="px-2 py-1 border-b border-slate-800">${r.region}</td>
      <td class="px-2 py-1 border-b border-slate-800"><span class="px-1.5 py-0.5 rounded text-xs ${sug.cls}">${sug.icon} ${sug.label}</span></td>
      <td class="px-2 py-1 border-b border-slate-800">${fmtPct(r.hook_rate_lw)}</td>
      <td class="px-2 py-1 border-b border-slate-800">${fmtFreq(r.frequency_lw)}</td>
      <td class="px-2 py-1 border-b border-slate-800">${fmtMoney(r.cpm_lw)}</td>
      <td class="px-2 py-1 border-b border-slate-800">${fmtNum(r.fti_lw)}</td>
      <td class="px-2 py-1 border-b border-slate-800">${r.fti_lw > 0 ? fmtMoney(r.cpa_lw) : '—'}</td>
      <td class="px-2 py-1 border-b border-slate-800">${fmtMoney(r.spend)}</td>
    </tr>`;
  }).join('');

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
  const filtered = rows.filter(r => {
    if (filterFunnel !== 'All' && String(r.objective).toUpperCase() !== filterFunnel) return false;
    if (filterRegion !== 'All' && String(r.region).toUpperCase() !== filterRegion) return false;
    return true;
  });

  document.getElementById('cards').innerHTML = filtered.length
    ? filtered.map(renderCard).join('')
    : '<div class="text-sm text-slate-500 col-span-full">No ads match the current filters.</div>';

  renderSegmentTable(filtered);
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

    const ccyEl    = document.getElementById('currency');
    const rateEl   = document.getElementById('usd-rate');
    const funnelEl = document.getElementById('funnel');
    const regionEl = document.getElementById('region');
    const segEl    = document.getElementById('segment-dim');

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
    if (funnelEl) funnelEl.addEventListener('change', () => { filterFunnel = funnelEl.value; render(); });
    if (regionEl) regionEl.addEventListener('change', () => { filterRegion = regionEl.value; render(); });
    if (segEl)    segEl.addEventListener('change',    () => { segmentDim  = segEl.value;    render(); });

    render();
    loading.classList.add('hidden');
    document.getElementById('content').classList.remove('hidden');
  } catch (error) {
    loading.textContent = `Failed to load data: ${error.message}`;
  }
}

document.addEventListener('DOMContentLoaded', initMeta);
