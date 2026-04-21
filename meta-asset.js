// meta-asset.js — Asset Layer (Layer 3)
// Joins creative_log (manual-input axes) with raw_fb (manual-input daily
// performance from Meta Ads Manager exports) to produce per-ad_code scorecards.

let rows = [];          // creative_log joined + enriched
let usdRate = 34;
let sortKey = 'hook_rate';
let lookbackDays = 14;  // window for performance aggregation

const F = (row, keys, fallback = '') => ZaapiDataService.pick(row, keys, fallback);
const N = (v) => ZaapiDataService.toNumber(v);

function money(thb, ccy) {
  return ccy === 'USD' ? `$${(N(thb) / usdRate).toFixed(0)}` : `฿${N(thb).toLocaleString()}`;
}

// --- kill / scale / fatigue logic from creative framework ------------------
function killSignal(r) {
  if (N(r.hook_rate) > 0 && N(r.hook_rate) < 15) return true;       // hook < 15%
  if (N(r.spend_thb) > 500 && N(r.fti) === 0)    return true;       // no FTI after meaningful spend
  return false;
}
function scaleSignal(r) {
  return N(r.hook_rate) > 35 && N(r.fti) >= 2;                      // hook > 35% + 2+ FTI
}
function fatigueSignal(r) {
  return N(r.frequency) > 3 && N(r.fti) === 0;                      // freq > 3 no FTI
}

function signalClass(r) {
  if (killSignal(r))    return 'border-red-500';
  if (scaleSignal(r))   return 'border-emerald-500';
  if (fatigueSignal(r)) return 'border-yellow-500';
  return 'border-slate-700';
}

// --- aggregate raw_fb by ad_code over the lookback window ------------------
// raw_fb columns (from the Meta Ads Manager export shape):
//   Ad name | Reach | Impressions | Result Type | Results | Spend |
//   Clicks | 2s Video Plays | 3s Video Plays | Region | Day | Ad Code | Funnel | Week
function aggregateRawFb(rawFb, lookbackDays) {
  if (!rawFb.length) return new Map();

  const msDay = 86400000;
  const cutoff = new Date(Date.now() - lookbackDays * msDay);

  const perfByCode = new Map();
  rawFb.forEach((r) => {
    const dayStr = F(r, ['Day', 'day', 'date']);
    if (!dayStr) return;
    const d = new Date(dayStr);
    if (isNaN(d.getTime()) || d < cutoff) return;

    const code = F(r, ['Ad Code', 'ad_code']);
    if (!code || code === '(not in log)') return;

    if (!perfByCode.has(code)) {
      perfByCode.set(code, {
        spend: 0, impressions: 0, clicks: 0, reach_sum: 0,
        v2s: 0, v3s: 0, fti: 0, leads: 0, days: new Set(),
      });
    }
    const agg = perfByCode.get(code);

    // Result Type determines which Results bucket to add to
    const resultType = String(F(r, ['Result Type'])).toLowerCase();
    const results = N(F(r, ['Results']));

    // spend/impr/clicks rows can repeat per result type — we only want to sum
    // spend once per (code, day), so use a days set to dedupe
    const dayKey = `${code}::${dayStr}`;
    if (!agg.days.has(dayKey)) {
      agg.days.add(dayKey);
      agg.spend       += N(F(r, ['Spend', 'spend']));
      agg.impressions += N(F(r, ['Impressions', 'impressions']));
      agg.clicks      += N(F(r, ['Clicks', 'clicks']));
      agg.reach_sum   += N(F(r, ['Reach', 'reach']));
      agg.v2s         += N(F(r, ['2s Video Plays']));
      agg.v3s         += N(F(r, ['3s Video Plays']));
    }

    if (resultType.includes('chat_account_integrated_first_time')) {
      agg.fti += results;
    } else if (resultType.includes('lead')) {
      agg.leads += results;
    }
  });

  // derive rate metrics
  const out = new Map();
  perfByCode.forEach((p, code) => {
    out.set(code, {
      spend_thb:   p.spend,
      impressions: p.impressions,
      clicks:      p.clicks,
      reach:       p.reach_sum,  // not strictly right (unique would be better) but best we have
      hook_rate:   p.impressions ? (p.v3s / p.impressions) * 100 : 0,
      thumb_stop:  p.impressions ? (p.v2s / p.impressions) * 100 : 0,
      thruplay:    0,   // not available in raw_fb
      frequency:   p.reach_sum ? p.impressions / p.reach_sum : 0,
      fti:         p.fti,
      cpa_thb:     p.fti ? p.spend / p.fti : 0,
      leads:       p.leads,
    });
  });
  return out;
}

// --- enrich creative_log with performance ----------------------------------
function enrichCreativeLog(creativeLog, perfByCode) {
  return creativeLog.map((r) => {
    const code = F(r, ['Ad Code', 'ad_code']);
    const perf = perfByCode.get(code) || {};
    return {
      ad_code:       code,
      ad_name:       F(r, ['Meta Ads Name', 'ad_name']),
      region:        F(r, ['Region', 'region']),
      language:      F(r, ['Language', 'language']),
      prod:          F(r, ['Production', 'prod']),
      angle:         F(r, ['Angle', 'angle']),
      feature1:      F(r, ['Feature 1', 'feature_1']),
      feature2:      F(r, ['Feature 2', 'feature_2']),
      funnel_stage:  F(r, ['Funnel Stage', 'Funnel', 'funnel']),
      status:        F(r, ['Status', 'status'], 'Live'),
      assessment:    F(r, ['Verdict', 'assessment']),
      notes:         F(r, ['Claude Notes', 'notes']),
      // performance
      ...perf,
    };
  });
}

// --- render ----------------------------------------------------------------
function render() {
  const funnel = document.getElementById('funnel').value;
  const ccy = document.getElementById('currency').value;

  // Map "Awareness" creative_log Funnel Stage → TOF, "Conversion"/"Retargeting" → BOF
  const funnelMatch = (r) => {
    if (funnel === 'All') return true;
    const fs = String(r.funnel_stage).toLowerCase();
    if (funnel === 'TOF') return fs.includes('awareness') || fs === 'tof';
    if (funnel === 'BOF') return fs.includes('conversion') || fs.includes('retargeting') || fs === 'bof' || fs === 'mof';
    return true;
  };

  const filtered = rows.filter(funnelMatch);

  document.getElementById('cards').innerHTML = filtered.map((r) => `
    <article class="bg-slate-900 border ${signalClass(r)} rounded p-3 space-y-1">
      <div class="flex justify-between items-start">
        <b class="text-sm">${r.ad_code}</b>
        <span class="text-xs px-2 py-0.5 rounded ${
          String(r.status).toLowerCase() === 'kill' ? 'bg-red-900 text-red-200' : 'bg-emerald-900 text-emerald-200'
        }">${r.status || 'Live'}</span>
      </div>
      <div class="text-xs text-slate-400">${r.region} · ${r.prod} · ${r.angle}</div>
      <div class="text-xs text-slate-500">${r.feature1}${r.feature2 ? ' + ' + r.feature2 : ''}</div>
      <div class="text-sm pt-1">Hook Rate: <b>${N(r.hook_rate).toFixed(1)}%</b> · Thumb-Stop: <b>${N(r.thumb_stop).toFixed(1)}%</b></div>
      <div class="text-sm">Frequency: ${N(r.frequency).toFixed(2)} · Reach: ${N(r.reach).toLocaleString()}</div>
      <div class="text-sm">FTI: <b>${N(r.fti).toFixed(1)}</b> · CPA: <b>${r.fti ? money(r.cpa_thb, ccy) : '—'}</b> · Spend: ${money(r.spend_thb, ccy)}</div>
      ${r.assessment ? `<div class="text-xs text-slate-400 border-t border-slate-800 pt-2 mt-1">${r.assessment}</div>` : ''}
    </article>`).join('') || '<div class="text-sm text-slate-500">No ads match the current filters. Check that creative_log and raw_fb tabs are populated.</div>';

  // Sortable summary table
  const sorted = [...filtered].sort((a, b) => N(b[sortKey]) - N(a[sortKey]));
  const head = `<tr class="text-slate-400">${
    ['Ad Code', 'Region', 'Hook Rate', 'Thumb-Stop', 'Freq', 'FTI', 'CPA', 'Spend']
      .map((h, i) => {
        const k = ['', '', 'hook_rate', 'thumb_stop', 'frequency', 'fti', 'cpa_thb', 'spend_thb'][i];
        return `<th data-k="${k}" class="text-left px-2 py-1 border-b border-slate-700 ${k ? 'cursor-pointer' : ''}">${h}${sortKey === k ? ' ↓' : ''}</th>`;
      }).join('')
  }</tr>`;
  const body = sorted.map((r) => `<tr>
    <td class="px-2 py-1 border-b border-slate-800">${r.ad_code}</td>
    <td class="px-2 py-1 border-b border-slate-800">${r.region}</td>
    <td class="px-2 py-1 border-b border-slate-800">${N(r.hook_rate).toFixed(1)}%</td>
    <td class="px-2 py-1 border-b border-slate-800">${N(r.thumb_stop).toFixed(1)}%</td>
    <td class="px-2 py-1 border-b border-slate-800">${N(r.frequency).toFixed(2)}</td>
    <td class="px-2 py-1 border-b border-slate-800">${N(r.fti).toFixed(1)}</td>
    <td class="px-2 py-1 border-b border-slate-800">${r.fti ? money(r.cpa_thb, ccy) : '—'}</td>
    <td class="px-2 py-1 border-b border-slate-800">${money(r.spend_thb, ccy)}</td>
  </tr>`).join('');

  const table = document.getElementById('summary');
  table.innerHTML = head + body;
  table.querySelectorAll('th[data-k]').forEach((th) =>
    th.addEventListener('click', () => { if (th.dataset.k) { sortKey = th.dataset.k; render(); } })
  );
}

async function initMeta() {
  const loading = document.getElementById('loading');
  try {
    const [creativeLog, rawFb] = await Promise.all([
      ZaapiDataService.fetchTab('creative_log').catch(() => []),
      ZaapiDataService.fetchTab('raw_fb').catch(() => []),
    ]);
    const config = await ZaapiDataService.getConfig().catch(() => ({}));
    usdRate = N(config.usd_thb_rate) || 34;

    const perfByCode = aggregateRawFb(rawFb, lookbackDays);
    rows = enrichCreativeLog(creativeLog, perfByCode);

    document.getElementById('usd-rate').value = usdRate;
    document.getElementById('usd-rate').addEventListener('change', (e) => {
      usdRate = N(e.target.value) || usdRate;
      render();
    });
    document.getElementById('currency').addEventListener('change', render);
    document.getElementById('funnel').addEventListener('change', render);

    render();
    loading.classList.add('hidden');
    document.getElementById('content').classList.remove('hidden');
  } catch (error) {
    loading.textContent = `Failed to load data: ${error.message}`;
  }
}

document.addEventListener('DOMContentLoaded', initMeta);
