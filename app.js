// app.js — Overview (Layer 1)
// Reads from: raw_google_daily, raw_meta_daily, raw_google_conversions_daily,
//             targets (optional), config (optional), action_log

let trendChart;
const F = (row, keys, fallback = '') => ZaapiDataService.pick(row, keys, fallback);
const N = (v) => ZaapiDataService.toNumber(v);

// --- helpers ---------------------------------------------------------------
function healthEmoji(v) {
  const s = String(v || '').toLowerCase();
  if (s.includes('red') || s.includes('bad')) return '🔴';
  if (s.includes('yellow') || s.includes('watch')) return '🟡';
  return '🟢';
}

function linRegPredict(last4) {
  const n = last4.length;
  if (!n) return 0;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    const x = i + 1, y = last4[i];
    sx += x; sy += y; sxy += x * y; sxx += x * x;
  }
  const m = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
  const b = (sy - m * sx) / n;
  return m * (n + 1) + b;
}

function fmtMoney(thb, currency, rate) {
  const n = N(thb);
  if (currency === 'USD') return `$${(n / rate).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `฿${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function sortCWs(cws) {
  return [...cws].sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10));
}

// --- aggregation -----------------------------------------------------------
// Aggregates additive daily rows to (CW, region) → {spend, clicks, impr, fti}
function aggregateWeekly(googleDaily, metaDaily, convDaily) {
  const agg = new Map();  // key: `${CW}::${region}` → tallies

  const bump = (cw, region, field, val) => {
    const k = `${cw}::${region || ''}`;
    if (!agg.has(k)) agg.set(k, { cw, region: region || '', spend: 0, clicks: 0, impressions: 0, fti: 0 });
    agg.get(k)[field] += N(val);
  };

  (googleDaily || []).forEach((r) => {
    const cw = ZaapiDataService.fmtCW(F(r, ['CW', 'cw']));
    const region = F(r, ['region', 'market']);
    bump(cw, region, 'spend',       F(r, ['spend_thb', 'spend', 'Spend THB']));
    bump(cw, region, 'clicks',      F(r, ['clicks']));
    bump(cw, region, 'impressions', F(r, ['impressions']));
  });

  (metaDaily || []).forEach((r) => {
    const cw = ZaapiDataService.fmtCW(F(r, ['CW', 'cw']));
    const region = F(r, ['region', 'market']);
    bump(cw, region, 'spend',       F(r, ['spend_thb', 'spend']));
    bump(cw, region, 'clicks',      F(r, ['clicks']));
    bump(cw, region, 'impressions', F(r, ['impressions']));
  });

  // FTI from Google Search conversions (only first_time_integrated rows)
  (convDaily || []).forEach((r) => {
    const action = String(F(r, ['conversion_action', 'conversionActionName'])).toLowerCase();
    if (!action.includes('first_time_integrated')) return;
    const cw = ZaapiDataService.fmtCW(F(r, ['CW', 'cw']));
    const region = F(r, ['region', 'market']);
    bump(cw, region, 'fti', F(r, ['conversions']));
  });

  return [...agg.values()];
}

function groupByCW(weeklyRows) {
  const byCW = new Map();
  weeklyRows.forEach((r) => {
    if (!byCW.has(r.cw)) byCW.set(r.cw, { cw: r.cw, spend: 0, fti: 0, regions: {} });
    const g = byCW.get(r.cw);
    g.spend += r.spend;
    g.fti   += r.fti;
    g.regions[r.region || 'Unknown'] = { ...r };
  });
  return sortCWs([...byCW.keys()]).map(cw => byCW.get(cw));
}

// --- chart -----------------------------------------------------------------
function renderTrend(history) {
  const last8 = history.slice(-8);
  const fti = last8.map((r) => r.fti);
  const pred = linRegPredict(fti.slice(-4));
  const labels = last8.map((r) => r.cw).concat('Next');
  const data = fti.concat(Math.max(0, Math.round(pred * 10) / 10));
  const dirUp = pred >= (fti[fti.length - 1] || 0);
  document.getElementById('trend-label').textContent =
    `${dirUp ? '📈 Trending up' : '📉 Trending down'} — est. ${Math.round(pred)} FTI next week`;

  if (trendChart) trendChart.destroy();
  trendChart = new Chart(document.getElementById('fti-trend'), {
    type: 'line',
    data: { labels, datasets: [{ data, borderColor: '#38bdf8', tension: 0.3, pointRadius: 2 }] },
    options: {
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: '#cbd5e1' } }, y: { ticks: { color: '#cbd5e1' } } },
    },
  });
}

// --- cards -----------------------------------------------------------------
function marketCard(title, data, currency, rate) {
  if (!data) {
    return `<article class="bg-slate-900 border border-slate-800 rounded p-3">
      <h3 class="font-semibold mb-2">${title}</h3>
      <div class="text-sm text-slate-500">No data this week</div>
    </article>`;
  }
  return `<article class="bg-slate-900 border border-slate-800 rounded p-3">
    <h3 class="font-semibold mb-2">${title}</h3>
    <div class="text-sm space-y-1">
      <div>Spend: <b>${fmtMoney(data.spend, currency, rate)}</b></div>
      <div>FTI: <b>${N(data.fti).toFixed(1)}</b></div>
      <div>Clicks: <b>${N(data.clicks).toLocaleString()}</b></div>
      <div>Impressions: <b>${N(data.impressions).toLocaleString()}</b></div>
    </div>
  </article>`;
}

// --- main ------------------------------------------------------------------
async function initOverview() {
  const loading = document.getElementById('loading');
  const content = document.getElementById('content');

  try {
    // Load core tabs; targets/config are optional
    const [googleDaily, metaDaily, convDaily, actionLog] = await Promise.all([
      ZaapiDataService.fetchTab('raw_google_daily').catch(() => []),
      ZaapiDataService.fetchTab('raw_meta_daily').catch(() => []),
      ZaapiDataService.fetchTab('raw_google_conversions_daily').catch(() => []),
      ZaapiDataService.fetchTab('action_log').catch(() => []),
    ]);
    const targets = await ZaapiDataService.fetchTab('targets').catch(() => []);
    const config = await ZaapiDataService.getConfig().catch(() => ({}));
    const rate = N(config.usd_thb_rate) || 34;

    const weekly = aggregateWeekly(googleDaily, metaDaily, convDaily);
    const history = groupByCW(weekly);

    if (!history.length) {
      loading.textContent = 'No data found in raw_google_daily or raw_meta_daily tabs.';
      return;
    }

    const latestCW = history[history.length - 1].cw;

    // Populate week selector
    const weekSelect = document.getElementById('week-select');
    weekSelect.innerHTML = history.map(h => `<option>${h.cw}</option>`).join('');
    weekSelect.value = latestCW;

    const getTargetForCW = (cw) => {
      const row = targets.find(t => ZaapiDataService.fmtCW(F(t, ['CW', 'cw'])) === cw);
      return N(F(row || {}, ['fti_target', 'FTI Target']));
    };

    const render = () => {
      const cw = weekSelect.value;
      const currency = document.getElementById('currency-toggle').value;
      const selected = history.find(h => h.cw === cw);
      if (!selected) return;

      const ftiTarget = getTargetForCW(cw);
      document.getElementById('fti-target').textContent = ftiTarget
        ? `${selected.fti.toFixed(1)} / ${ftiTarget} FTI`
        : `${selected.fti.toFixed(1)} FTI (no target set)`;

      // Health: compare FTI to target if available, else just show OK
      let health = 'OK';
      if (ftiTarget) {
        const ratio = selected.fti / ftiTarget;
        health = ratio >= 1 ? 'On track' : ratio >= 0.7 ? 'Watch (yellow)' : 'Behind (red)';
      }
      document.getElementById('global-health').textContent = `${healthEmoji(health)} ${health}`;

      document.getElementById('ai-summary').textContent =
        `${cw}: Spend ${fmtMoney(selected.spend, currency, rate)}, FTI ${selected.fti.toFixed(1)}` +
        (ftiTarget ? ` against target of ${ftiTarget}.` : '.');

      renderTrend(history);

      // Market grid: TH / SEA / ROW with sub-regions collapsed into parent
      const regions = ['TH', 'SEA', 'ROW'];
      document.getElementById('market-grid').innerHTML = regions
        .map(r => marketCard(r, selected.regions[r], currency, rate))
        .join('');

      // Action log panel
      const latestActions = (actionLog || []).filter(a =>
        ZaapiDataService.fmtCW(F(a, ['CW', 'cw'])) === cw
      );
      const topThree = latestActions
        .map(a => F(a, ['action_suggested', 'suggestion']))
        .filter(Boolean)
        .slice(0, 3);
      const nextStep = latestActions.find(a =>
        String(F(a, ['priority'])).toLowerCase() === 'high' &&
        String(F(a, ['status'])).toLowerCase() === 'pending'
      );

      document.getElementById('reallocation').innerHTML = [
        topThree.length ? `Insights:<br>${topThree.map(i => `• ${i}`).join('<br>')}` : 'Insights: —',
        nextStep
          ? `<br>Next step: ${F(nextStep, ['action_suggested', 'suggestion'])}`
          : '<br>Next step: No high-priority pending action.',
      ].join('');

      document.getElementById('look-links').innerHTML = [
        '<a class="underline" href="search.html">Search page</a>',
        '<a class="underline" href="meta-asset.html">Meta Asset page</a>',
        '<a class="underline" href="action-log.html">Action Log</a>',
      ].join('<span class="text-slate-500 mx-2">|</span>');
    };

    weekSelect.addEventListener('change', render);
    document.getElementById('currency-toggle').addEventListener('change', render);
    render();

    loading.classList.add('hidden');
    content.classList.remove('hidden');
  } catch (error) {
    loading.textContent = `Failed to load data: ${error.message}`;
  }
}

document.addEventListener('DOMContentLoaded', initOverview);
