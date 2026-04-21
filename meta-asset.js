// meta-asset.js — Asset Layer (Layer 3)
// v4 (Apr 21, 2026) adds:
//   • SATURATING verdict (fatigue detector, points-based, BOF-focused)
//   • Replacement recommender (one-axis-swap candidates from same region)
//   • Video Description rendered on card (new col AE in creative_log)
//   • Vic Bullets export (clipboard, per region) for weekly stakeholder slide
//   • Action summary re-ordered by severity, includes SATURATING bucket
// Unchanged from v3: paused detection, LW-vs-Lifetime card layout, segment table,
//   sortable summary, asset image toggle, AI Suggestions panel.

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

    // ═══ NEW v4: Video Description (creative_log col AE) ═══
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

// ═══════════════════════════════════════════════════════════════════════════
// NEW v4: Fatigue scoring — deterministic, points-based.
// Fires on ads that *previously worked* (had lifetime FTI) and now show decay.
// Distinct from the existing KILL (never-worked) and REFRESH (saturated-but-never-scaled) paths.
// ═══════════════════════════════════════════════════════════════════════════
function computeFatigueScore(r) {
  const isBOF = (r.objective || '').toUpperCase() === 'BOF';
  const hasLifetimeFTI = Number.isFinite(r.fti) && r.fti > 0;

  // Eligibility: TOF rows don't carry FTI, so SATURATING only fires on BOF rows for now.
  // TOF decay still surfaces via existing WATCH (hook drop) and REFRESH (freq>3) verdicts.
  if (!isBOF || !hasLifetimeFTI) {
    return { score: 0, signals: [], eligible: false };
  }

  const signals = [];
  let score = 0;

  // S1: Frequency in saturation zone AND FTI declining
  if (Number.isFinite(r.frequency_lw) && r.frequency_lw >= 3.0 &&
      Number.isFinite(r.fti_lw) && Number.isFinite(r.fti_pw) && r.fti_lw < r.fti_pw) {
    signals.push(`Freq ${r.frequency_lw.toFixed(1)} + FTI ↓`);
    score += 2;
  }

  // S2: FTI decay ≥30% at flat-or-up spend (not a budget cut)
  const spendLW = r.spend_bof_lw;
  const spendPW = r.spend_bof_pw;
  if (Number.isFinite(r.fti_lw) && Number.isFinite(r.fti_pw) && r.fti_pw > 0 &&
      r.fti_lw < r.fti_pw * 0.7 && r.fti_lw > 0 &&
      Number.isFinite(spendLW) && Number.isFinite(spendPW) && spendLW >= spendPW * 0.9) {
    signals.push(`FTI ${r.fti_pw.toFixed(0)}→${r.fti_lw.toFixed(0)} at flat spend`);
    score += 2;
  }

  // S3: CPA drift ≥50% (efficiency eroding with budget still flowing)
  if (Number.isFinite(r.cpa_lw) && Number.isFinite(r.cpa_pw) && r.cpa_pw > 0 &&
      r.cpa_lw > r.cpa_pw * 1.5 &&
      Number.isFinite(spendLW) && spendLW >= 50) {
    signals.push(`CPA +${((r.cpa_lw / r.cpa_pw - 1) * 100).toFixed(0)}%`);
    score += 1;
  }

  // S4: Collapse — was working, now zero
  if (Number.isFinite(r.fti_lw) && r.fti_lw === 0 &&
      Number.isFinite(r.fti_pw) && r.fti_pw > 0 &&
      Number.isFinite(spendLW) && spendLW >= 50) {
    signals.push(`FTI collapsed to 0`);
    score += 3;
  }

  return { score, signals, eligible: true };
}

// --- AI suggestion per row -------------------------------------------------
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
    saturating: 'bg-orange-950/80 border-orange-700 text-orange-200', // NEW v4
    scale:      'bg-emerald-950/60 border-emerald-900 text-emerald-300',
    target:     'bg-purple-950/60 border-purple-900 text-purple-300',
    channel:    'bg-cyan-950/60 border-cyan-900 text-cyan-300',
    refresh:    'bg-yellow-950/60 border-yellow-900 text-yellow-300',
    watch:      'bg-orange-950/60 border-orange-900 text-orange-300',
    paused:     'bg-slate-800/80 border-slate-600 text-slate-300',
    nodata:     'bg-slate-900/60 border-slate-700 text-slate-400',
    cont:       'bg-slate-900/60 border-slate-700 text-slate-300',
  };

  // 0) Paused
  if (isPausedInObjective(r)) {
    return { icon: '⏸', label: 'PAUSED', reason: 'Zero spend last week — check lifetime metrics below', cls: C.paused };
  }
  // 1) No data
  if (!Number.isFinite(spendLw) || spendLw < 10) {
    return { icon: '⏳', label: 'NO DATA', reason: 'Spend too low to judge yet', cls: C.nodata };
  }
  // 2) Kill: hook collapsed (never-worked path)
  if (Number.isFinite(hookLw) && hookLw > 0 && hookLw < 15) {
    return { icon: '🛑', label: 'KILL', reason: `Hook ${hookLw.toFixed(0)}% < 15% — creative isn't landing`, cls: C.kill };
  }

  // ═══ NEW v4: Fatigue check — winner-going-stale path ═══
  // Runs before existing verdicts so SATURATING wins over REFRESH/WATCH when eligible.
  const fatigue = computeFatigueScore(r);
  if (fatigue.eligible && fatigue.score >= 5) {
    return {
      icon: '🛑',
      label: 'KILL',
      reason: `Fatigued out (score ${fatigue.score}): ${fatigue.signals.join(' · ')}`,
      cls: C.kill,
      fatigue,
    };
  }
  if (fatigue.eligible && fatigue.score >= 3) {
    return {
      icon: '🔥',
      label: 'SATURATING',
      reason: `Winner fatiguing (score ${fatigue.score}): ${fatigue.signals.join(' · ')}`,
      cls: C.saturating,
      fatigue,
    };
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
      return { icon: '📡', label: 'NEW CHANNEL', reason: `CPA up ${((r.cpa_lw / r.cpa_pw - 1) * 100).toFixed(0)}% WoW — try different placement (IG Reels / Stories)`, cls: C.channel };
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
  if (s.label === 'SATURATING')        return 'border-orange-400'; // NEW v4
  if (s.label === 'SCALE')             return 'border-emerald-500';
  if (s.label === 'REFRESH CREATIVE')  return 'border-yellow-500';
  if (s.label === 'NEW TARGETING')     return 'border-purple-500';
  if (s.label === 'NEW CHANNEL')       return 'border-cyan-500';
  if (s.label === 'WATCH')             return 'border-orange-500';
  if (s.label === 'PAUSED')            return 'border-slate-600';
  return 'border-slate-700';
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW v4: Replacement recommender.
// When an ad shows KILL or SATURATING, surface 1-2 candidates to inherit into.
// Rule: same region, healthy verdict (SCALE/CONTINUE), ranked by FTI_lw/spend_lw.
// Candidate must differ from dying ad on at least one axis (prod/angle/feature1).
// If no same-region candidates exist, propose a one-axis-swap hypothesis instead.
// ═══════════════════════════════════════════════════════════════════════════
function findReplacements(dyingAd, allRows) {
  const isBOF = (dyingAd.objective || '').toUpperCase() === 'BOF';
  const sameObjective = allRows.filter(r =>
    (r.objective || '').toUpperCase() === (dyingAd.objective || '').toUpperCase()
  );

  // Pool: same region, different ad_code, healthy verdict
  const pool = sameObjective.filter(r => {
    if (r.ad_code === dyingAd.ad_code) return false;
    if (String(r.region).toUpperCase() !== String(dyingAd.region).toUpperCase()) return false;
    if (isPausedInObjective(r)) return false;
    const sug = suggestion(r);
    return ['SCALE', 'CONTINUE'].includes(sug.label);
  });

  // Rank by efficiency (FTI per $ on BOF, hook * spend on TOF)
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

  // Fallback: propose net-new combo by swapping one axis
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

// Net-new swap suggestion when no inherit candidate exists
function proposeNetNewSwap(dyingAd) {
  // Priority order of axes to swap (lightest-touch first)
  // Angle swap > Production swap > Feature swap (angle is cheapest to test in AI)
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

// --- card ------------------------------------------------------------------
function cardId(r) {
  return `card-${r.ad_code}-${(r.objective || 'NA').toLowerCase()}`.replace(/[^a-zA-Z0-9-]/g, '-');
}

function renderCard(r) {
  const objective = (r.objective || '').toUpperCase();
  const isBOF = objective === 'BOF';
  const spendLW = isBOF ? r.spend_bof_lw : r.spend_tof_lw;
  const spendPW = isBOF ? r.spend_bof_pw : r.spend_tof_pw;
  const paused = isPausedInObjective(r);

  const hookDelta  = paused ? '' : deltaHTML(r.hook_rate_lw, r.hook_rate_pw, 'higher_better', 'pct_abs');
  const freqDelta  = paused ? '' : deltaHTML(r.frequency_lw, r.frequency_pw, 'lower_better', 'abs');
  const cpmDelta   = paused ? '' : deltaHTML(r.cpm_lw, r.cpm_pw, 'lower_better', 'pct_rel');
  const spendDelta = paused ? '' : deltaHTML(spendLW, spendPW, 'higher_better', 'pct_rel');
  const ftiDelta   = paused ? '' : deltaHTML(r.fti_lw, r.fti_pw, 'higher_better', 'abs');
  const cpaDelta   = paused ? '' : deltaHTML(r.cpa_lw, r.cpa_pw, 'lower_better', 'pct_rel');

  const sug = suggestion(r);
  const border = borderForSuggestion(sug);

  let statusBadge;
  if (paused) {
    statusBadge = `<span class="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">⏸ PAUSED</span>`;
  } else {
    const statusColor = String(r.status).toLowerCase() === 'kill'
      ? 'bg-red-900 text-red-200' : 'bg-emerald-900 text-emerald-200';
    statusBadge = `<span class="text-xs px-1.5 py-0.5 rounded ${statusColor}">${r.status || 'Live'}</span>`;
  }
  const objBadgeColor = isBOF ? 'bg-purple-900 text-purple-200' : 'bg-sky-900 text-sky-200';

  const lwValueCls = paused ? 'text-slate-600' : '';
  const lwHook  = paused ? '—' : fmtPct(r.hook_rate_lw);
  const lwCpm   = paused ? '—' : fmtMoney(r.cpm_lw);
  const lwFreq  = paused ? '—' : fmtFreq(r.frequency_lw);
  const lwFti   = paused ? '—' : fmtNum(r.fti_lw);
  const lwCpa   = (paused || !(r.fti_lw > 0)) ? '—' : fmtMoney(r.cpa_lw);

  const lwBlockTOF = `
    <div class="text-sm ${lwValueCls}">Hook: <b>${lwHook}</b>${hookDelta}</div>
    <div class="text-sm ${lwValueCls}">CPM: <b>${lwCpm}</b>${cpmDelta}</div>
    <div class="text-sm ${lwValueCls}">Frequency: <b>${lwFreq}</b>${freqDelta}</div>
    <div class="text-sm ${lwValueCls}">Spend: <b>${fmtMoney(spendLW)}</b>${spendDelta}</div>`;
  const lwBlockBOF = `
    <div class="text-sm ${lwValueCls}">FTI: <b>${lwFti}</b>${ftiDelta}</div>
    <div class="text-sm ${lwValueCls}">CPA: <b>${lwCpa}</b>${cpaDelta}</div>
    <div class="text-sm ${lwValueCls}">Frequency: <b>${lwFreq}</b>${freqDelta}</div>
    <div class="text-sm ${lwValueCls}">Spend: <b>${fmtMoney(spendLW)}</b>${spendDelta}</div>`;

  const hasLifetime = Number.isFinite(r.spend) && r.spend > 0;
  const lifetimeTOF = `
    <div class="text-sm">Hook: <b>${fmtPct(r.hook_rate)}</b></div>
    <div class="text-sm">Thumb-Stop: <b>${fmtPct(r.thumb_stop)}</b></div>
    <div class="text-sm">CPM: <b>${fmtMoney(r.cpm)}</b></div>
    <div class="text-sm">Frequency: <b>${fmtFreq(r.frequency)}</b></div>
    <div class="text-sm text-slate-500">Total ad spend (all objectives): <b>${fmtMoney(r.spend)}</b></div>`;
  const lifetimeBOF = `
    <div class="text-sm">FTI: <b>${fmtNum(r.fti)}</b></div>
    <div class="text-sm">CPA: <b>${r.fti > 0 ? fmtMoney(r.cpa) : '—'}</b></div>
    <div class="text-sm">Frequency: <b>${fmtFreq(r.frequency)}</b></div>
    <div class="text-sm text-slate-500">Total ad spend (all objectives): <b>${fmtMoney(r.spend)}</b></div>`;

  const imgUrl = `${assetBase}${r.ad_code}.webp`;
  const cid = cardId(r);

  // ═══ NEW v4: Video Description block — shown above metrics, always visible when present ═══
  const videoDescBlock = r.video_description
    ? `<div class="text-xs text-slate-300 bg-slate-950/60 border border-slate-800 rounded p-2 italic leading-snug">
         <span class="text-[10px] uppercase tracking-wide text-slate-500 not-italic">Video</span><br/>
         ${r.video_description}
       </div>`
    : '';

  // ═══ NEW v4: Replacement recommender — shown below lifetime, only for KILL/SATURATING ═══
  const needsReplacement = ['KILL', 'SATURATING'].includes(sug.label);
  let replacementBlock = '';
  if (needsReplacement) {
    const reps = findReplacements(r, rows);
    replacementBlock = `
      <div class="border-t border-slate-800 pt-2 space-y-1.5">
        <div class="text-[10px] uppercase tracking-wide text-orange-300 mb-1">→ Replacement candidates</div>
        ${reps.map(rep => {
          if (rep.type === 'inherit') {
            return `<div class="text-xs bg-indigo-950/30 border border-indigo-900 rounded p-1.5">
              <div class="font-mono text-indigo-300">${rep.candidate.ad_code}</div>
              <div class="text-[11px] text-slate-300">${rep.rationale}</div>
            </div>`;
          }
          return `<div class="text-xs bg-slate-900/60 border border-slate-700 rounded p-1.5">
            <div class="text-slate-400 italic">Net-new swap suggestion</div>
            <div class="text-[11px] text-slate-300">${rep.rationale}</div>
          </div>`;
        }).join('')}
      </div>`;
  }

  return `
    <article id="${cid}" class="bg-slate-900 border ${border} rounded p-3 space-y-2" data-ad-code="${r.ad_code}">
      <div class="flex justify-between items-start gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <button
            class="flex-shrink-0 w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center justify-center"
            onclick="toggleAsset('${cid}', '${imgUrl.replace(/'/g, "\\'")}', '${r.ad_code}')"
            title="View creative" aria-label="View creative">👁</button>
          <b class="text-sm truncate">${r.ad_code}</b>
        </div>
        <div class="flex gap-1 flex-shrink-0">
          ${objective ? `<span class="text-xs px-1.5 py-0.5 rounded ${objBadgeColor}">${objective}</span>` : ''}
          ${statusBadge}
        </div>
      </div>

      <!-- AI suggestion strip -->
      <div class="border ${sug.cls} rounded px-2 py-1.5 flex items-start gap-2 text-xs">
        <span class="flex-shrink-0">${sug.icon}</span>
        <div class="min-w-0">
          <div class="font-bold">${sug.label}</div>
          <div class="text-[11px] leading-tight opacity-80">${sug.reason}</div>
        </div>
      </div>

      <!-- asset preview slot -->
      <div class="asset-slot hidden" data-loaded="false"></div>

      ${videoDescBlock}

      <div class="text-xs text-slate-400">${r.region} · ${r.prod} · ${r.angle}</div>
      <div class="text-xs text-slate-500">${r.feature1 || ''}</div>

      <!-- LAST WEEK section -->
      <div class="border-t border-slate-800 pt-2">
        <div class="text-[10px] uppercase tracking-wide text-slate-500 mb-1 flex items-center justify-between">
          <span>Last Week ${paused ? '· paused' : '(vs prior week)'}</span>
        </div>
        ${isBOF ? lwBlockBOF : lwBlockTOF}
      </div>

      <!-- LIFETIME section -->
      ${hasLifetime ? `
      <div class="border-t border-slate-800 pt-2">
        <div class="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Lifetime — ${objective} performance</div>
        ${isBOF ? lifetimeBOF : lifetimeTOF}
      </div>` : ''}

      ${replacementBlock}

      ${r.assessment ? `<div class="text-xs text-slate-400 border-t border-slate-800 pt-2">${r.assessment}</div>` : ''}
    </article>`;
}

// --- asset toggle (global) -------------------------------------------------
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

// --- summary table ---------------------------------------------------------
window.toggleFromTable = function (adCode, objective) {
  const cid = `card-${adCode}-${(objective || 'NA').toLowerCase()}`.replace(/[^a-zA-Z0-9-]/g, '-');
  const card = document.getElementById(cid);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const imgUrl = `${assetBase}${adCode}.webp`;
  window.toggleAsset(cid, imgUrl, adCode);
  card.classList.add('ring-2', 'ring-sky-400');
  setTimeout(() => card.classList.remove('ring-2', 'ring-sky-400'), 2000);
};

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

// --- ACTION SUMMARY --------------------------------------------------------
// ═══ v4: reordered by severity, SATURATING bucket added ═══
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
// NEW v4: Vic Bullets export — clipboard-formatted block for stakeholder slide
// Structure per region: TOP (scale/continue) · DEAD (kill/saturating + replacements) · WATCH
// ═══════════════════════════════════════════════════════════════════════════
function buildVicBullets(region) {
  const pool = rows.filter(r => {
    if (region !== 'ALL' && String(r.region).toUpperCase() !== region) return false;
    return true;
  });

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
        if (rep.type === 'inherit') {
          line += `\n    → Replace with: ${rep.candidate.ad_code} (${rep.rationale})`;
        } else {
          line += `\n    → Test: ${rep.rationale}`;
        }
      });
    }
    return line;
  };

  const header = `${region === 'ALL' ? 'ALL REGIONS' : region} · CW${guessLatestCW()} · ${new Date().toISOString().slice(0, 10)}`;
  const sep = '─'.repeat(Math.min(header.length, 60));

  const blocks = [
    header,
    sep,
    '',
    `✅ TOP (continue / scale) — ${TOP.length}`,
    TOP.length ? TOP.map(x => formatAd(x, false)).join('\n\n') : '  (none)',
    '',
    `🛑 DEAD (kill / saturating) — ${DEAD.length}`,
    DEAD.length ? DEAD.map(x => formatAd(x, true)).join('\n\n') : '  (none)',
    '',
    `👀 WATCH / ACT — ${WATCH.length}`,
    WATCH.length ? WATCH.map(x => formatAd(x, false)).join('\n\n') : '  (none)',
  ];

  return blocks.join('\n');
}

// Best-effort latest CW from asset page context — not perfect, just for export labeling
function guessLatestCW() {
  // Prefer the one from shared nav if rendered
  const navChip = document.querySelector('#shared-nav span');
  if (navChip) {
    const match = navChip.textContent.match(/CW(\d+)/);
    if (match) return match[1];
  }
  // Fallback: current ISO week
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

// --- render ----------------------------------------------------------------
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

  document.getElementById('cards').innerHTML = filtered.length
    ? filtered.map(renderCard).join('')
    : '<div class="text-sm text-slate-500 col-span-full">No ads match the current filters.</div>';

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

    // ═══ NEW v4: Vic Bullets export button handlers ═══
    document.querySelectorAll('.vic-export-btn').forEach(btn => {
      btn.addEventListener('click', () => copyVicBullets(btn.dataset.region));
    });

    // AI Suggestions Panel (asset layer) — unchanged from v3
    const pick = (row, keys, fb = '') => ZaapiDataService.pick(row, keys, fb);
    const actionCWs = [...new Set((actionLog || []).map(a => ZaapiDataService.fmtCW(pick(a, ['CW', 'cw']))))].filter(Boolean);
    const latestCW = actionCWs.sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10)).slice(-1)[0] || 'CW17';
    const panelEl = document.getElementById('ai-suggestions-panel');
    if (panelEl && window.AISuggestionsPanel) {
      window.AISuggestionsPanel.render(panelEl, {
        actionLog, learningAccum,
        currentCW: latestCW,
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
