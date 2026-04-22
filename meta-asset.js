// meta-asset.js — Asset Layer (Layer 3)
// v5 (Apr 22, 2026) adds:
//   • Section A: per-country ad list, click-to-expand shows creative image
//   • Replaces the full-detail cards grid (#cards → #section-a)
//   • Scale sizing: SCALE +25% (standard) / SCALE +50% (strong signal)
//   • Verdict-severity sort within each country/funnel subsection
//   • Composite row keys (country-objective-ad_code) kill the sector-toggle bug
//   • Metrics moved out of cards; they now live ONLY in the sortable table below
// v4 additions retained: SATURATING verdict, replacement recommender,
//   Video Description, Vic Bullets export.

let rows = [];
let usdRate = 34;
let currency = 'USD';
let filterFunnel = 'All';
let filterRegion = 'All';
let filterStatus = 'All';
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

// --- parse row -------------------------------------------------------------
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
    video_description: F(raw, ['Video Description', 'video_description']),

    // lifetime
    spend:        num(F(raw, ['spend'])),
    hook_rate:    num(F(raw, ['hook_rate'])),
    thumb_stop:   num(F(raw, ['thumb_stop'])),
    frequency:    num(F(raw, ['frequency'])),
    cpm:          num(F(raw, ['CPM', 'cpm'])),
    fti:          num(F(raw, ['fti'])),
    cpa:          num(F(raw, ['cpa'])),

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

// --- paused detection ------------------------------------------------------
function isPausedInObjective(r) {
  const isBOF = (r.objective || '').toUpperCase() === 'BOF';
  const spendLW = isBOF ? r.spend_bof_lw : r.spend_tof_lw;
  const lwZero = !Number.isFinite(spendLW) || spendLW === 0;
  const hasLifetime = Number.isFinite(r.spend) && r.spend > 0;
  return lwZero && hasLifetime;
}

// --- fatigue scoring (v4, unchanged) ---------------------------------------
function computeFatigueScore(r) {
  const isBOF = (r.objective || '').toUpperCase() === 'BOF';
  const hasLifetimeFTI = Number.isFinite(r.fti) && r.fti > 0;
  if (!isBOF || !hasLifetimeFTI) return { score: 0, signals: [], eligible: false };

  const signals = [];
  let score = 0;

  if (Number.isFinite(r.frequency_lw) && r.frequency_lw >= 3.0 &&
      Number.isFinite(r.fti_lw) && Number.isFinite(r.fti_pw) && r.fti_lw < r.fti_pw) {
    signals.push(`Freq ${r.frequency_lw.toFixed(1)} + FTI ↓`);
    score += 2;
  }

  const spendLW = r.spend_bof_lw;
  const spendPW = r.spend_bof_pw;
  if (Number.isFinite(r.fti_lw) && Number.isFinite(r.fti_pw) && r.fti_pw > 0 &&
      r.fti_lw < r.fti_pw * 0.7 && r.fti_lw > 0 &&
      Number.isFinite(spendLW) && Number.isFinite(spendPW) && spendLW >= spendPW * 0.9) {
    signals.push(`FTI ${r.fti_pw.toFixed(0)}→${r.fti_lw.toFixed(0)} at flat spend`);
    score += 2;
  }

  if (Number.isFinite(r.cpa_lw) && Number.isFinite(r.cpa_pw) && r.cpa_pw > 0 &&
      r.cpa_lw > r.cpa_pw * 1.5 &&
      Number.isFinite(spendLW) && spendLW >= 50) {
    signals.push(`CPA +${((r.cpa_lw / r.cpa_pw - 1) * 100).toFixed(0)}%`);
    score += 1;
  }

  if (Number.isFinite(r.fti_lw) && r.fti_lw === 0 &&
      Number.isFinite(r.fti_pw) && r.fti_pw > 0 &&
      Number.isFinite(spendLW) && spendLW >= 50) {
    signals.push(`FTI collapsed to 0`);
    score += 3;
  }

  return { score, signals, eligible: true };
}

// --- AI suggestion per row (unchanged verdict logic) -----------------------
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
    kill:       'bg-red-950/60 border-red-900 text-red-300',
    saturating: 'bg-orange-950/80 border-orange-700 text-orange-200',
    scale:      'bg-emerald-950/60 border-emerald-900 text-emerald-300',
    target:     'bg-purple-950/60 border-purple-900 text-purple-300',
    channel:    'bg-cyan-950/60 border-cyan-900 text-cyan-300',
    refresh:    'bg-yellow-950/60 border-yellow-900 text-yellow-300',
    watch:      'bg-orange-950/60 border-orange-900 text-orange-300',
    paused:     'bg-slate-800/80 border-slate-600 text-slate-300',
    nodata:     'bg-slate-900/60 border-slate-700 text-slate-400',
    cont:       'bg-slate-900/60 border-slate-700 text-slate-300',
  };

  if (isPausedInObjective(r)) {
    return { icon: '⏸', label: 'PAUSED', reason: 'Zero spend last week — check lifetime metrics below', cls: C.paused };
  }
  if (!Number.isFinite(spendLw) || spendLw < 10) {
    return { icon: '⏳', label: 'NO DATA', reason: 'Spend too low to judge yet', cls: C.nodata };
  }
  if (Number.isFinite(hookLw) && hookLw > 0 && hookLw < 15) {
    return { icon: '🛑', label: 'KILL', reason: `Hook ${hookLw.toFixed(0)}% < 15% — creative isn't landing`, cls: C.kill };
  }

  const fatigue = computeFatigueScore(r);
  if (fatigue.eligible && fatigue.score >= 5) {
    return { icon: '🛑', label: 'KILL', reason: `Fatigued out (score ${fatigue.score}): ${fatigue.signals.join(' · ')}`, cls: C.kill, fatigue };
  }
  if (fatigue.eligible && fatigue.score >= 3) {
    return { icon: '🔥', label: 'SATURATING', reason: `Winner fatiguing (score ${fatigue.score}): ${fatigue.signals.join(' · ')}`, cls: C.saturating, fatigue };
  }

  if (isBOF) {
    if (Number.isFinite(ftiLw) && ftiLw >= 2) {
      return { icon: '📈', label: 'SCALE', reason: `${ftiLw.toFixed(1)} FTI at ${fmtMoney(r.cpa_lw)} CPA — pour more BOF budget`, cls: C.scale };
    }
    if (Number.isFinite(ftiLw) && ftiLw === 0 && spendLw >= 50) {
      return { icon: '🎯', label: 'NEW TARGETING', reason: `${fmtMoney(spendLw)} spent with 0 FTI — creative works, audience doesn't. Test new persona.`, cls: C.target };
    }
    if (Number.isFinite(ftiLw) && ftiLw === 0 && spendLw >= 10) {
      return { icon: '👀', label: 'WATCH', reason: `${fmtMoney(spendLw)} spent with 0 FTI — under $50, need more budget to judge`, cls: C.watch };
    }
    if (Number.isFinite(freqLw) && freqLw > 3 && !(ftiLw > 0)) {
      return { icon: '♻️', label: 'REFRESH CREATIVE', reason: `Freq ${freqLw.toFixed(1)} — audience saturated, rotate in a new edit`, cls: C.refresh };
    }
    if (Number.isFinite(r.cpa_lw) && Number.isFinite(r.cpa_pw) && r.cpa_pw > 0 && r.cpa_lw > r.cpa_pw * 1.5) {
      return { icon: '📡', label: 'NEW CHANNEL', reason: `CPA up ${((r.cpa_lw / r.cpa_pw - 1) * 100).toFixed(0)}% WoW — try different placement`, cls: C.channel };
    }
    return { icon: '✅', label: 'CONTINUE', reason: 'Healthy — maintain current setup', cls: C.cont };
  }

  // TOF
  if (Number.isFinite(hookLw) && hookLw > 35 && (!Number.isFinite(freqLw) || freqLw < 2.5)) {
    return { icon: '📈', label: 'SCALE', reason: `Hook ${hookLw.toFixed(0)}% + freq ${fmtFreq(freqLw)} — proven winner, pour TOF budget`, cls: C.scale };
  }
  if (Number.isFinite(freqLw) && freqLw > 3) {
    return { icon: '♻️', label: 'REFRESH CREATIVE', reason: `Freq ${freqLw.toFixed(1)} — audience saturated, rotate in a new edit`, cls: C.refresh };
  }
  if (Number.isFinite(hookLw) && Number.isFinite(hookPw) && (hookPw - hookLw) > 10) {
    return { icon: '📉', label: 'WATCH', reason: `Hook dropped ${(hookPw - hookLw).toFixed(0)}pp WoW — creative tiring, prep replacement`, cls: C.watch };
  }
  if (Number.isFinite(cpmLw) && Number.isFinite(cpmPw) && cpmPw > 0 && cpmLw > cpmPw * 1.5) {
    return { icon: '📡', label: 'NEW CHANNEL', reason: `CPM up ${((cpmLw / cpmPw - 1) * 100).toFixed(0)}% WoW — try different placement`, cls: C.channel };
  }
  if (Number.isFinite(hookLw) && hookLw >= 25 && hookLw <= 35) {
    return { icon: '👀', label: 'WATCH', reason: `Hook ${hookLw.toFixed(0)}% — borderline, need more data`, cls: C.watch };
  }
  return { icon: '✅', label: 'CONTINUE', reason: 'Healthy — maintain current setup', cls: C.cont };
}

function borderForSuggestion(s) {
  if (s.label === 'KILL')              return 'border-red-500';
  if (s.label === 'SATURATING')        return 'border-orange-400';
  if (s.label === 'SCALE')             return 'border-emerald-500';
  if (s.label === 'REFRESH CREATIVE')  return 'border-yellow-500';
  if (s.label === 'NEW TARGETING')     return 'border-purple-500';
  if (s.label === 'NEW CHANNEL')       return 'border-cyan-500';
  if (s.label === 'WATCH')             return 'border-orange-500';
  if (s.label === 'PAUSED')            return 'border-slate-600';
  return 'border-slate-700';
}

// --- replacement recommender (v4, unchanged) -------------------------------
function findReplacements(dyingAd, allRows) {
  const isBOF = (dyingAd.objective || '').toUpperCase() === 'BOF';
  const sameObjective = allRows.filter(r =>
    (r.objective || '').toUpperCase() === (dyingAd.objective || '').toUpperCase()
  );
  const pool = sameObjective.filter(r => {
    if (r.ad_code === dyingAd.ad_code) return false;
    if (String(r.region).toUpperCase() !== String(dyingAd.region).toUpperCase()) return false;
    if (isPausedInObjective(r)) return false;
    const sug = suggestion(r);
    return ['SCALE', 'CONTINUE'].includes(sug.label);
  });
  const ranked = pool
    .map(r => {
      let efficiency = 0;
      if (isBOF && Number.isFinite(r.fti_lw) && Number.isFinite(r.spend_bof_lw) && r.spend_bof_lw > 0) {
        efficiency = r.fti_lw / r.spend_bof_lw;
      } else if (!isBOF && Number.isFinite(r.hook_rate_lw)) {
        efficiency = r.hook_rate_lw;
      }
      return { r, efficiency };
    })
    .sort((a, b) => b.efficiency - a.efficiency)
    .slice(0, 2)
    .map(({ r }) => ({
      type: 'inherit',
      candidate: r,
      axisDiff: diffAxes(dyingAd, r),
      rationale: inheritRationale(dyingAd, r, isBOF),
    }));
  if (ranked.length > 0) return ranked;
  return proposeNetNewSwap(dyingAd);
}

function diffAxes(a, b) {
  const diffs = [];
  if (a.prod !== b.prod)         diffs.push({ axis: 'production', from: a.prod, to: b.prod });
  if (a.angle !== b.angle)       diffs.push({ axis: 'angle',      from: a.angle, to: b.angle });
  if (a.feature1 !== b.feature1) diffs.push({ axis: 'feature',    from: a.feature1, to: b.feature1 });
  return diffs;
}

function inheritRationale(dyingAd, candidate, isBOF) {
  const diffs = diffAxes(dyingAd, candidate);
  if (!diffs.length) return `Same axes — likely a targeting/budget inheritance, not a creative swap.`;
  const axisLabels = diffs.map(d => `${d.axis}: ${d.from}→${d.to}`).join(', ');
  const perfLabel = isBOF
    ? `${fmtNum(candidate.fti_lw, 0)} FTI @ ${fmtMoney(candidate.cpa_lw)} CPA`
    : `${fmtPct(candidate.hook_rate_lw)} hook`;
  return `${axisLabels} · ${perfLabel}`;
}

function proposeNetNewSwap(dyingAd) {
  const angleSwaps = { 'VB': 'TS', 'TS': 'VB', 'ST': 'VB', 'ED': 'VB' };
  const angleCodes = { 'Value bomb': 'VB', 'Testimonial': 'TS', 'Storytelling': 'ST', 'Educational': 'ED' };
  const angleNames = { 'VB': 'Value bomb', 'TS': 'Testimonial', 'ST': 'Storytelling', 'ED': 'Educational' };
  const currentAngleCode = angleCodes[dyingAd.angle] || 'VB';
  const newAngleCode = angleSwaps[currentAngleCode] || 'TS';
  const newAngleName = angleNames[newAngleCode];
  return [{
    type: 'net_new',
    candidate: null,
    axisDiff: [{ axis: 'angle', from: dyingAd.angle, to: newAngleName }],
    rationale: `No healthy ${dyingAd.region} ads to inherit from. Cheapest next test: swap angle ${dyingAd.angle}→${newAngleName}, keep production/region.`,
  }];
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION A: Per-country ad list (new in v5)
// One-line rows (ad_code + verdict), click to expand → shows the creative image.
// Metrics live in the sortable table below, not on the row.
// ═══════════════════════════════════════════════════════════════════════════

// Hybrid region display — honest about what's pooled vs operational
const REGION_DISPLAY = {
  TH:  { label: 'TH',                 order: 1 },
  SEA: { label: 'SEA (MY+SG+PH)',     order: 2 },
  ROW: { label: 'ROW (UK primary)',   order: 3 },
};

// Sort within each subsection: most urgent first
const VERDICT_SEVERITY = {
  'KILL':             1,
  'SATURATING':       2,
  'WATCH':            3,
  'REFRESH CREATIVE': 4,
  'NEW TARGETING':    5,
  'NEW CHANNEL':      6,
  'CONTINUE':         7,
  'SCALE':            8,
  'PAUSED':           9,
  'NO DATA':         10,
};

// Scale sizing: answers "how much?" when the verdict is SCALE.
// Two tiers:
//   +50% = strong signal — hook >45% + freq <2.0 (TOF) OR fti_lw ≥5 (BOF)
//   +25% = standard signal — just passed SCALE thresholds
function scaleSize(r, sug) {
  if (sug.label !== 'SCALE') return null;
  const isBOF = (r.objective || '').toUpperCase() === 'BOF';
  if (isBOF) {
    if (Number.isFinite(r.fti_lw) && r.fti_lw >= 5) return '+50%';
    return '+25%';
  }
  if (Number.isFinite(r.hook_rate_lw) && r.hook_rate_lw > 45 &&
      Number.isFinite(r.frequency_lw) && r.frequency_lw < 2.0) return '+50%';
  return '+25%';
}

// Composite row key — kills the sector-3-toggles-sector-1 bug.
// Same ad_code can appear under both TOF and BOF; scoping by objective makes ids unique.
function sectionARowKey(r) {
  const region = String(r.region || 'NA').toUpperCase();
  const obj = String(r.objective || 'NA').toUpperCase();
  const safeCode = String(r.ad_code || 'noid').replace(/[^a-zA-Z0-9]/g, '-');
  return `sa-${region}-${obj}-${safeCode}`;
}

// One-line row: arrow + ad_code + verdict pill. No metrics.
function renderSectionARow(r) {
  const sug = suggestion(r);
  const size = scaleSize(r, sug);
  const rowKey = sectionARowKey(r);
  const imgUrl = `${assetBase}${r.ad_code}.webp`;
  const imgUrlEscaped = imgUrl.replace(/'/g, "\\'");
  const adCodeEscaped = String(r.ad_code || '').replace(/'/g, "\\'");
  const verdictLabel = size ? `${sug.label} ${size}` : sug.label;
  const border = borderForSuggestion(sug);

  return `
    <div id="${rowKey}-wrap" class="flex flex-col">
      <button
        class="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-slate-800/50 text-left w-full border ${border} bg-slate-900/50 transition-colors"
        onclick="toggleSectionARow('${rowKey}', '${imgUrlEscaped}', '${adCodeEscaped}')"
        aria-expanded="false"
        data-row-key="${rowKey}"
      >
        <span class="row-arrow text-slate-500 text-xs w-3 flex-shrink-0">▸</span>
        <span class="font-mono text-xs font-semibold truncate flex-1 min-w-0">${r.ad_code}</span>
        <span class="text-[11px] px-2 py-0.5 rounded ${sug.cls} whitespace-nowrap flex-shrink-0 font-semibold">
          ${sug.icon} ${verdictLabel}
        </span>
      </button>
      <div id="${rowKey}-expand" class="hidden border-x border-b ${border} bg-slate-950/60 rounded-b px-3 py-3 space-y-2"></div>
    </div>`;
}

// Expanded content — the point of this is "show me the ad". Image first.
function buildSectionAExpandContent(r) {
  const sug = suggestion(r);
  const axes = [r.prod, r.angle, r.feature1, r.objective].filter(Boolean).join(' · ');

  // Replacement candidates — only when ad is dying
  const needsReplacement = ['KILL', 'SATURATING'].includes(sug.label);
  let replacementBlock = '';
  if (needsReplacement) {
    const reps = findReplacements(r, rows);
    replacementBlock = `
      <div class="border-t border-slate-800 pt-2">
        <div class="text-[10px] uppercase tracking-wide text-orange-300 mb-1">→ Replacement candidates</div>
        ${reps.map(rep => {
          if (rep.type === 'inherit') {
            return `<div class="text-xs bg-indigo-950/30 border border-indigo-900 rounded p-1.5 mb-1">
              <div class="font-mono text-indigo-300">${rep.candidate.ad_code}</div>
              <div class="text-[11px] text-slate-300">${rep.rationale}</div>
            </div>`;
          }
          return `<div class="text-xs bg-slate-900/60 border border-slate-700 rounded p-1.5 mb-1">
            <div class="text-slate-400 italic">Net-new swap</div>
            <div class="text-[11px] text-slate-300">${rep.rationale}</div>
          </div>`;
        }).join('')}
      </div>`;
  }

  return `
    <div class="asset-slot" data-loaded="false">
      <div class="text-[11px] text-slate-500 italic py-6 text-center">Loading creative...</div>
    </div>
    <div class="text-xs text-slate-400">${axes}</div>
    ${r.video_description ? `<div class="text-xs text-slate-300 italic leading-snug border-l-2 border-slate-700 pl-2">${r.video_description}</div>` : ''}
    <div class="text-xs leading-snug">
      <span class="text-slate-500">Why ${sug.label}:</span> ${sug.reason}
    </div>
    ${r.assessment ? `<div class="text-xs text-slate-400 border-t border-slate-800 pt-2">${r.assessment}</div>` : ''}
    ${replacementBlock}
    <div class="text-[10px] text-slate-500 pt-1 border-t border-slate-800">
      Metrics → scroll to sortable table below
    </div>`;
}

// Toggle — lazy-loads both expand content and image on first open.
window.toggleSectionARow = function(rowKey, imgUrl, adCode) {
  const expandEl = document.getElementById(`${rowKey}-expand`);
  if (!expandEl) return;
  const btn = document.querySelector(`[data-row-key="${rowKey}"]`);
  const arrow = btn ? btn.querySelector('.row-arrow') : null;
  const wasHidden = expandEl.classList.contains('hidden');

  if (wasHidden) {
    const rowData = rows.find(r => sectionARowKey(r) === rowKey);
    if (!rowData) return;

    if (!expandEl.dataset.contentLoaded) {
      expandEl.innerHTML = buildSectionAExpandContent(rowData);
      expandEl.dataset.contentLoaded = 'true';
    }

    const slot = expandEl.querySelector('.asset-slot');
    if (slot && slot.dataset.loaded !== 'true') {
      slot.innerHTML = `
        <div class="rounded overflow-hidden bg-slate-950 border border-slate-800">
          <img src="${imgUrl}" alt="${adCode}" class="w-full h-auto block" loading="lazy"
            onerror="this.parentElement.innerHTML='<div class=&quot;text-xs text-slate-500 p-4 text-center&quot;>No asset file found at<br><code class=&quot;text-slate-400&quot;>${imgUrl}</code></div>'" />
        </div>`;
      slot.dataset.loaded = 'true';
    }

    expandEl.classList.remove('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    if (arrow) arrow.textContent = '▾';
  } else {
    expandEl.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    if (arrow) arrow.textContent = '▸';
  }
};

function renderSectionA(filteredRows) {
  if (!filteredRows.length) {
    return '<div class="text-sm text-slate-500 p-4 text-center bg-slate-900 border border-slate-800 rounded">No ads match the current filters.</div>';
  }

  // Group by region (creative_log today tags as TH / SEA / ROW)
  const byRegion = new Map();
  filteredRows.forEach(r => {
    const region = String(r.region || 'UNKNOWN').toUpperCase();
    if (!byRegion.has(region)) byRegion.set(region, []);
    byRegion.get(region).push(r);
  });

  // Sort regions in business order: TH, SEA, ROW, then anything else
  const orderedRegions = [...byRegion.entries()].sort((a, b) => {
    const oa = REGION_DISPLAY[a[0]]?.order ?? 99;
    const ob = REGION_DISPLAY[b[0]]?.order ?? 99;
    return oa - ob;
  });

  const sortFn = (a, b) => {
    const sa = suggestion(a).label;
    const sb = suggestion(b).label;
    return (VERDICT_SEVERITY[sa] ?? 99) - (VERDICT_SEVERITY[sb] ?? 99);
  };

  return orderedRegions.map(([regionCode, regionRows]) => {
    const display = REGION_DISPLAY[regionCode]?.label || regionCode;
    const totalAds = regionRows.length;
    const tof = regionRows.filter(r => String(r.objective || '').toUpperCase() === 'TOF').sort(sortFn);
    const bof = regionRows.filter(r => String(r.objective || '').toUpperCase() === 'BOF').sort(sortFn);

    const subsection = (label, list) => {
      if (!list.length) return '';
      return `
        <div class="space-y-1 mt-3 first:mt-0">
          <div class="text-[10px] uppercase tracking-wide text-slate-500 px-1 flex items-baseline gap-2">
            <span class="font-semibold">${label}</span>
            <span class="opacity-70">${list.length} ad${list.length !== 1 ? 's' : ''}</span>
          </div>
          <div class="space-y-1">${list.map(renderSectionARow).join('')}</div>
        </div>`;
    };

    return `
      <article class="bg-slate-900 border border-slate-800 rounded p-3">
        <div class="flex items-baseline justify-between pb-2 border-b border-slate-800">
          <h3 class="font-semibold">${display}</h3>
          <span class="text-xs text-slate-500">${totalAds} ad${totalAds !== 1 ? 's' : ''}</span>
        </div>
        ${subsection('TOF', tof)}
        ${subsection('BOF', bof)}
        ${!tof.length && !bof.length ? '<div class="text-xs text-slate-500 italic py-2">No ads match filters for this region.</div>' : ''}
      </article>`;
  }).join('');
}

// --- SEGMENT ANALYSIS (unchanged — this is Section B v1; will rebuild later) ---
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
      a.hook_rate_lw  = r.hook_rate_lw; a.thumb_stop = r.thumb_stop;
      a.cpm_lw = r.cpm_lw; a.frequency_lw = r.frequency_lw;
      a.spend_tof_lw = r.spend_tof_lw;
    } else if (obj === 'BOF') {
      a.fti_lw = r.fti_lw; a.cpa_lw = r.cpa_lw;
      a.spend_bof_lw = r.spend_bof_lw;
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
      segment, count: list.length,
      spend_total: spendTotal, spend_lw: spendTof + spendBof,
      avg_hook: hooks.length ? hooks.reduce((s, x) => s + x, 0) / hooks.length : NaN,
      avg_cpm:  cpms.length  ? cpms.reduce((s, x) => s + x, 0) / cpms.length  : NaN,
      total_fti: totalFti,
      avg_cpa:   totalFti > 0 ? spendBof / totalFti : NaN,
    };
  }).sort((a, b) => b.spend_total - a.spend_total);
}

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

// --- toggleFromTable — redirect to Section A expand (cards removed) -------
window.toggleFromTable = function (adCode, objective) {
  const r = rows.find(x =>
    x.ad_code === adCode &&
    String(x.objective || '').toUpperCase() === String(objective || '').toUpperCase()
  );
  if (!r) return;
  const rowKey = sectionARowKey(r);
  const wrap = document.getElementById(`${rowKey}-wrap`);
  if (!wrap) return;
  wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const expandEl = document.getElementById(`${rowKey}-expand`);
  if (expandEl && expandEl.classList.contains('hidden')) {
    const imgUrl = `${assetBase}${adCode}.webp`;
    window.toggleSectionARow(rowKey, imgUrl, adCode);
  }
  wrap.classList.add('ring-2', 'ring-sky-400', 'rounded');
  setTimeout(() => wrap.classList.remove('ring-2', 'ring-sky-400'), 2000);
};

// --- sortable summary (Section C — unchanged) -----------------------------
function renderSummary(filtered) {
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (sortKey === 'ad_code') {
      const sa = String(av || ''), sb = String(bv || '');
      return sortDir === 'desc' ? sb.localeCompare(sa) : sa.localeCompare(sb);
    }
    if (!Number.isFinite(av) && !Number.isFinite(bv)) return 0;
    if (!Number.isFinite(av)) return 1;
    if (!Number.isFinite(bv)) return -1;
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  const cols = [
    { key: '',             label: '' },
    { key: 'ad_code',      label: 'Ad Code' },
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
      <td class="px-2 py-1 border-b border-slate-800">
        <button
          class="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center justify-center"
          onclick="toggleFromTable('${r.ad_code}', '${r.objective || ''}')"
          title="View creative">👁</button>
      </td>
      <td class="px-2 py-1 border-b border-slate-800 font-mono">${r.ad_code}</td>
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
      else { sortKey = k; sortDir = (k === 'ad_code') ? 'asc' : 'desc'; }
      render();
    })
  );
}

// --- ACTION SUMMARY (verdict-bucket grid — kept, now below Section A) -----
function renderActionSummary(filteredRows) {
  const buckets = [
    { label: 'KILL',              icon: '🛑', title: 'Kill',              color: 'bg-red-950/40 border-red-900 text-red-200' },
    { label: 'SATURATING',        icon: '🔥', title: 'Saturating (refresh now)', color: 'bg-orange-950/60 border-orange-700 text-orange-200' },
    { label: 'REFRESH CREATIVE',  icon: '♻️', title: 'Refresh Creative',   color: 'bg-yellow-950/40 border-yellow-900 text-yellow-200' },
    { label: 'WATCH',             icon: '👀', title: 'Watch',              color: 'bg-orange-950/40 border-orange-900 text-orange-200' },
    { label: 'NEW TARGETING',     icon: '🎯', title: 'Try New Targeting',  color: 'bg-purple-950/40 border-purple-900 text-purple-200' },
    { label: 'NEW CHANNEL',       icon: '📡', title: 'Try New Channel',    color: 'bg-cyan-950/40 border-cyan-900 text-cyan-200' },
    { label: 'SCALE',             icon: '📈', title: 'Scale',              color: 'bg-emerald-950/40 border-emerald-900 text-emerald-200' },
  ];
  const rowsWithSug = filteredRows.map(r => ({ r, sug: suggestion(r) }));
  const html = buckets.map(b => {
    const hits = rowsWithSug.filter(x => x.sug.label === b.label);
    const items = hits.map(({ r }) => {
      const objTag = r.objective ? `<span class="text-[10px] opacity-60">${r.objective}</span>` : '';
      return `<button
        class="block w-full text-left text-[11px] font-mono px-1.5 py-0.5 rounded hover:bg-black/30 truncate"
        onclick="toggleFromTable('${r.ad_code}', '${r.objective || ''}')"
        title="Click to view creative">${r.ad_code} ${objTag}</button>`;
    }).join('');
    return `
      <div class="border ${b.color} rounded p-2 flex flex-col gap-1 min-h-[120px]">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold">${b.icon} ${b.title}</span>
          <span class="text-xs font-mono opacity-70">${hits.length}</span>
        </div>
        <div class="flex flex-col gap-0.5 mt-1">
          ${items || '<span class="text-[11px] opacity-40 italic">nothing</span>'}
        </div>
      </div>`;
  }).join('');
  document.getElementById('action-summary').innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════════
// Vic Bullets export (v4 — unchanged)
// ═══════════════════════════════════════════════════════════════════════════
function buildVicBullets(region) {
  const pool = rows.filter(r => region === 'ALL' || String(r.region).toUpperCase() === region);
  const rowsWithSug = pool.map(r => ({ r, sug: suggestion(r) }));
  const TOP = rowsWithSug.filter(x => ['SCALE', 'CONTINUE'].includes(x.sug.label));
  const DEAD = rowsWithSug.filter(x => ['KILL', 'SATURATING'].includes(x.sug.label));
  const WATCH = rowsWithSug.filter(x => ['WATCH', 'REFRESH CREATIVE', 'NEW TARGETING', 'NEW CHANNEL'].includes(x.sug.label));

  const formatAd = (x, includeReplacements) => {
    const r = x.r;
    const obj = r.objective || '';
    const metrics = obj === 'BOF'
      ? `FTI ${fmtNum(r.fti_lw, 0)} · CPA ${r.fti_lw > 0 ? fmtMoney(r.cpa_lw) : '—'} · Freq ${fmtFreq(r.frequency_lw)}`
      : `Hook ${fmtPct(r.hook_rate_lw)} · CPM ${fmtMoney(r.cpm_lw)} · Freq ${fmtFreq(r.frequency_lw)}`;
    let line = `  ${r.ad_code} (${obj}) · ${x.sug.label}\n` +
               `    ${metrics}\n` +
               `    ${r.video_description ? r.video_description.slice(0, 120) + (r.video_description.length > 120 ? '…' : '') : '(no description)'}`;
    if (includeReplacements) {
      const reps = findReplacements(r, rows);
      reps.forEach(rep => {
        if (rep.type === 'inherit') line += `\n    → Replace with: ${rep.candidate.ad_code} (${rep.rationale})`;
        else line += `\n    → Test: ${rep.rationale}`;
      });
    }
    return line;
  };

  const header = `${region === 'ALL' ? 'ALL REGIONS' : region} · CW${guessLatestCW()} · ${new Date().toISOString().slice(0, 10)}`;
  const sep = '─'.repeat(Math.min(header.length, 60));
  return [
    header, sep, '',
    `✅ TOP (continue / scale) — ${TOP.length}`,
    TOP.length ? TOP.map(x => formatAd(x, false)).join('\n\n') : '  (none)',
    '',
    `🛑 DEAD (kill / saturating) — ${DEAD.length}`,
    DEAD.length ? DEAD.map(x => formatAd(x, true)).join('\n\n') : '  (none)',
    '',
    `👀 WATCH / ACT — ${WATCH.length}`,
    WATCH.length ? WATCH.map(x => formatAd(x, false)).join('\n\n') : '  (none)',
  ].join('\n');
}

function guessLatestCW() {
  const navChip = document.querySelector('#shared-nav span');
  if (navChip) {
    const match = navChip.textContent.match(/CW(\d+)/);
    if (match) return match[1];
  }
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = (now - start) / (1000 * 60 * 60 * 24);
  return String(Math.ceil((diff + start.getDay() + 1) / 7)).padStart(2, '0');
}

async function copyVicBullets(region) {
  const text = buildVicBullets(region);
  try {
    await navigator.clipboard.writeText(text);
    showToast(`✓ Copied ${region} block (${text.split('\n').length} lines)`);
  } catch (err) {
    showToast(`⚠ Clipboard blocked — showing in modal`);
    showExportModal(text);
  }
}

function showToast(msg) {
  const t = document.getElementById('vic-export-toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}

function showExportModal(text) {
  const existing = document.getElementById('vic-export-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'vic-export-modal';
  modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-slate-900 border border-slate-700 rounded max-w-3xl w-full max-h-[80vh] flex flex-col">
      <div class="flex items-center justify-between p-3 border-b border-slate-800">
        <h3 class="text-sm font-semibold">Vic Bullets Export — copy manually</h3>
        <button onclick="document.getElementById('vic-export-modal').remove()" class="text-slate-400 hover:text-white text-lg">×</button>
      </div>
      <textarea readonly class="flex-1 bg-slate-950 text-slate-200 p-3 font-mono text-xs resize-none overflow-auto">${text.replace(/</g, '&lt;')}</textarea>
    </div>`;
  document.body.appendChild(modal);
  const ta = modal.querySelector('textarea');
  ta.focus(); ta.select();
}

// --- render ---------------------------------------------------------------
function render() {
  const filtered = rows.filter(r => {
    if (filterFunnel !== 'All' && String(r.objective).toUpperCase() !== filterFunnel) return false;
    if (filterRegion !== 'All' && String(r.region).toUpperCase() !== filterRegion) return false;
    if (filterStatus !== 'All') {
      const paused = isPausedInObjective(r);
      const killed = String(r.status).toLowerCase() === 'kill';
      if (filterStatus === 'Paused' && !paused) return false;
      if (filterStatus === 'Kill'   && !killed) return false;
      if (filterStatus === 'Live'   && (paused || killed)) return false;
    }
    return true;
  });

  // Section A (per-country ad list) — primary view
  const sectionAEl = document.getElementById('section-a');
  if (sectionAEl) sectionAEl.innerHTML = renderSectionA(filtered);

  // Action Summary + Segment + Sortable summary — secondary views
  renderActionSummary(filtered);
  renderSegmentTable(filtered);
  renderSummary(filtered);
}

// --- init ------------------------------------------------------------------
async function initMeta() {
  const loading = document.getElementById('loading');
  try {
    const [raw, actionLog, learningAccum] = await Promise.all([
      ZaapiDataService.fetchTab('creative_log'),
      ZaapiDataService.fetchTab('action_log').catch(() => []),
      ZaapiDataService.fetchTab('learning_accum').catch(() => []),
    ]);
    rows = raw.map(parseRow).filter(r => r.ad_code);

    const config = await ZaapiDataService.getConfig().catch(() => ({}));
    usdRate = ZaapiDataService.toNumber(config.usd_thb_rate, 34);
    if (config.asset_base_url) assetBase = config.asset_base_url;

    const ccyEl    = document.getElementById('currency');
    const rateEl   = document.getElementById('usd-rate');
    const funnelEl = document.getElementById('funnel');
    const regionEl = document.getElementById('region');
    const statusEl = document.getElementById('status');
    const segEl    = document.getElementById('segment-dim');

    if (ccyEl)    { ccyEl.value = 'USD'; currency = 'USD'; ccyEl.addEventListener('change', () => { currency = ccyEl.value; render(); }); }
    if (rateEl)   { rateEl.value = usdRate; rateEl.addEventListener('change', (e) => { usdRate = ZaapiDataService.toNumber(e.target.value, usdRate) || usdRate; if (currency === 'THB') render(); }); }
    if (funnelEl) funnelEl.addEventListener('change', () => { filterFunnel = funnelEl.value; render(); });
    if (regionEl) regionEl.addEventListener('change', () => { filterRegion = regionEl.value; render(); });
    if (statusEl) statusEl.addEventListener('change', () => { filterStatus = statusEl.value; render(); });
    if (segEl)    segEl.addEventListener('change',    () => { segmentDim  = segEl.value;    render(); });

    document.querySelectorAll('.vic-export-btn').forEach(btn => {
      btn.addEventListener('click', () => copyVicBullets(btn.dataset.region));
    });

    // AI Suggestions panel (asset layer) — unchanged from v4
    const pick = (row, keys, fb = '') => ZaapiDataService.pick(row, keys, fb);
    const actionCWs = [...new Set((actionLog || []).map(a => ZaapiDataService.fmtCW(pick(a, ['CW', 'cw']))))].filter(Boolean);
    const latestCW = actionCWs.sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10)).slice(-1)[0] || 'CW17';
    const panelEl = document.getElementById('ai-suggestions-panel');
    if (panelEl && window.AISuggestionsPanel) {
      window.AISuggestionsPanel.render(panelEl, {
        actionLog, learningAccum, currentCW: latestCW,
        layers: ['asset'],
        region: filterRegion !== 'All' ? filterRegion : null,
        lookbackWeeks: 2,
        title: '🤖 AI Suggestions · Asset Layer + Last 2 Weeks Results',
      });
      if (regionEl) regionEl.addEventListener('change', () => {
        window.AISuggestionsPanel.render(panelEl, {
          actionLog, learningAccum, currentCW: latestCW,
          layers: ['asset'],
          region: regionEl.value !== 'All' ? regionEl.value : null,
          lookbackWeeks: 2,
          title: '🤖 AI Suggestions · Asset Layer + Last 2 Weeks Results',
        });
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
