let trendChart;

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
    const x = i + 1;
    const y = last4[i];
    sx += x; sy += y; sxy += x * y; sxx += x * x;
  }
  const m = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
  const b = (sy - m * sx) / n;
  return m * (n + 1) + b;
}

function fmtMoney(thb, currency, rate) {
  const n = ZaapiDataService.toNumber(thb);
  if (currency === 'USD') return `$${(n / rate).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `฿${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function field(row, keys, fallback = '') {
  return ZaapiDataService.pick(row, keys, fallback);
}

function groupedByCW(weeklyRows) {
  const map = new Map();
  weeklyRows.forEach((r) => {
    const cw = ZaapiDataService.fmtCW(field(r, ['CW', 'cw']));
    if (!map.has(cw)) map.set(cw, { cw, spend_thb: 0, fti: 0 });
    const ref = map.get(cw);
    ref.spend_thb += ZaapiDataService.toNumber(field(r, ['spend_thb', 'Spend THB']));
    ref.fti += ZaapiDataService.toNumber(field(r, ['fti', 'FTI', 'fti_actual']));
  });
  return [...map.values()].sort((a, b) => parseInt(a.cw.replace(/\D/g, ''), 10) - parseInt(b.cw.replace(/\D/g, ''), 10));
}

function renderTrend(history) {
  const last8 = history.slice(-8);
  const fti = last8.map((r) => ZaapiDataService.toNumber(r.fti));
  const pred = linRegPredict(fti.slice(-4));
  const labels = last8.map((r) => r.cw).concat('Next');
  const data = fti.concat(pred);

  const dirUp = pred >= (fti[fti.length - 1] || 0);
  document.getElementById('trend-label').textContent = `${dirUp ? '📈 Trending up' : '📉 Trending down'} — est. ${Math.round(pred)} FTI next week`;

  if (trendChart) trendChart.destroy();
  trendChart = new Chart(document.getElementById('fti-trend'), {
    type: 'line',
    data: { labels, datasets: [{ data, borderColor: '#38bdf8', tension: 0.3, pointRadius: 2 }] },
    options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#cbd5e1' } }, y: { ticks: { color: '#cbd5e1' } } } }
  });
}

function marketCard(title, row, currency, rate, children = []) {
  const wow = ZaapiDataService.toNumber(field(row, ['wow_delta', 'WoW Delta']));
  const wowText = `${wow >= 0 ? '+' : ''}${wow.toFixed(1)}%`;
  return `<article class="bg-slate-900 border border-slate-800 rounded p-3">
    <h3 class="font-semibold mb-2">${title}</h3>
    <div class="text-sm space-y-1">
      <div>Spend: <b>${fmtMoney(field(row, ['spend_thb', 'Spend THB']), currency, rate)}</b></div>
      <div>FTI: <b>${ZaapiDataService.toNumber(field(row, ['fti', 'FTI', 'fti_actual']))}</b></div>
      <div>WoW delta: <b>${wowText}</b></div>
      <div>Health: <b>${healthEmoji(field(row, ['health_signal', 'health']))} ${field(row, ['health_signal', 'health']) || ''}</b></div>
      ${children.join('')}
    </div>
  </article>`;
}

async function initOverview() {
  const loading = document.getElementById('loading');
  const content = document.getElementById('content');

  try {
    const tabs = await ZaapiDataService.fetchTabs(['weekly_summary', 'action_log', 'targets', 'config']);
    const config = await ZaapiDataService.getConfig();
    const rate = ZaapiDataService.toNumber(config.usd_thb_rate, 34);

    const history = groupedByCW(tabs.weekly_summary);
    const latestCW = history[history.length - 1]?.cw || '—';
    const latestRows = tabs.weekly_summary.filter((r) => ZaapiDataService.fmtCW(field(r, ['CW', 'cw'])) === latestCW);

    const snapshot = {
      spend_thb: latestRows.reduce((sum, r) => sum + ZaapiDataService.toNumber(field(r, ['spend_thb', 'Spend THB'])), 0),
      fti: latestRows.reduce((sum, r) => sum + ZaapiDataService.toNumber(field(r, ['fti', 'FTI', 'fti_actual'])), 0)
    };

    const regionSpend = latestRows.reduce((acc, row) => {
      const region = field(row, ['region', 'market', 'Region'], 'Unknown');
      if (!acc[region]) acc[region] = { region, spend_thb: 0, fti: 0, health_signal: field(row, ['health_signal', 'health']) };
      acc[region].spend_thb += ZaapiDataService.toNumber(field(row, ['spend_thb', 'Spend THB']));
      acc[region].fti += ZaapiDataService.toNumber(field(row, ['fti', 'FTI', 'fti_actual']));
      return acc;
    }, {});

    const latestActions = tabs.action_log.filter((r) => ZaapiDataService.fmtCW(field(r, ['CW', 'cw'])) === latestCW);
    const insights = latestActions
      .map((r) => field(r, ['action_suggested', 'suggestion']))
      .filter(Boolean)
      .slice(-3);

    const nextStep = latestActions.find((r) => String(field(r, ['priority'])).toLowerCase() === 'high' && String(field(r, ['status'])).toLowerCase() === 'pending');

    const weeks = history.map((r) => r.cw);
    const weekSelect = document.getElementById('week-select');
    weekSelect.innerHTML = weeks.map((w) => `<option>${w}</option>`).join('');
    weekSelect.value = latestCW;

    const render = () => {
      const cw = weekSelect.value;
      const currency = document.getElementById('currency-toggle').value;
      const targetRow = tabs.targets.find((r) => ZaapiDataService.fmtCW(field(r, ['CW', 'cw'])) === cw) || {};
      const selectedRows = tabs.weekly_summary.filter((r) => ZaapiDataService.fmtCW(field(r, ['CW', 'cw'])) === cw);
      const selectedSummary = {
        spend_thb: selectedRows.reduce((sum, r) => sum + ZaapiDataService.toNumber(field(r, ['spend_thb', 'Spend THB'])), 0),
        fti: selectedRows.reduce((sum, r) => sum + ZaapiDataService.toNumber(field(r, ['fti', 'FTI', 'fti_actual'])), 0)
      };

      document.getElementById('ai-summary').textContent = field(selectedRows[0] || {}, ['ai_summary']) || `Latest CW ${latestCW}: Spend ${fmtMoney(snapshot.spend_thb, currency, rate)}, FTI ${snapshot.fti}.`;
      document.getElementById('global-health').textContent = `${healthEmoji(field(selectedRows[0] || {}, ['health_signal', 'health']))} ${field(selectedRows[0] || {}, ['health_signal', 'health']) || '—'}`;
      document.getElementById('fti-target').textContent = `${selectedSummary.fti} / ${ZaapiDataService.toNumber(field(targetRow, ['fti_target', 'FTI Target']))} FTI`;

      renderTrend(history);

      const rowsByRegion = Object.values(selectedRows.reduce((acc, row) => {
        const region = field(row, ['region', 'market', 'Region'], 'Unknown');
        if (!acc[region]) acc[region] = { region, spend_thb: 0, fti: 0, health_signal: field(row, ['health_signal', 'health']) };
        acc[region].spend_thb += ZaapiDataService.toNumber(field(row, ['spend_thb', 'Spend THB']));
        acc[region].fti += ZaapiDataService.toNumber(field(row, ['fti', 'FTI', 'fti_actual']));
        return acc;
      }, {}));

      document.getElementById('market-grid').innerHTML = rowsByRegion.map((row) => marketCard(row.region, row, currency, rate)).join('')
        || Object.values(regionSpend).map((row) => marketCard(row.region, row, currency, rate)).join('');

      document.getElementById('reallocation').innerHTML = [
        insights.length ? `Insights: ${insights.map((i) => `• ${i}`).join('<br>')}` : 'Insights: —',
        nextStep ? `Next step: ${field(nextStep, ['action_suggested', 'suggestion'])}` : 'Next step: No high-priority pending action.'
      ].join('<br>');

      document.getElementById('look-links').innerHTML = [
        '<a class="underline" href="search.html">Search page</a>',
        '<a class="underline" href="meta-asset.html">Meta Asset page</a>',
        '<a class="underline" href="action-log.html">Action Log</a>'
      ].join('<span class="text-slate-500">|</span>');
    };

    weekSelect.addEventListener('change', render);
    document.getElementById('currency-toggle').addEventListener('change', render);
    render();

    loading.classList.add('hidden');
    content.classList.remove('hidden');
  } catch (error) {
    loading.textContent = `Failed to load Google Sheets data: ${error.message}`;
  }
}

document.addEventListener('DOMContentLoaded', initOverview);
