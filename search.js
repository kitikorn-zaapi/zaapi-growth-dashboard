function td(v, cls = '') { return `<td class="px-2 py-1 border-b border-slate-800 ${cls}">${v ?? '—'}</td>`; }

function rankColor(v) {
  const n = ZaapiDataService.toNumber(v);
  if (n > 60) return 'text-red-400';
  if (n >= 30) return 'text-yellow-400';
  return 'text-emerald-400';
}

function f(row, keys, fallback = '') {
  return ZaapiDataService.pick(row, keys, fallback);
}

async function initSearch() {
  const loading = document.getElementById('loading');
  const content = document.getElementById('content');

  try {
    const tabs = await ZaapiDataService.fetchTabs(['weekly_summary', 'raw_google_daily', 'action_log']);

    const weekly = tabs.weekly_summary.filter((r) => String(f(r, ['channel', 'Channel'])).toLowerCase() === 'google');
    const gHead = `<tr class="text-slate-400">${['Campaign','Market','Spend THB','Search IS','Lost IS Rank','Lost IS Budget','CW'].map((h)=>`<th class="text-left px-2 py-1 border-b border-slate-700">${h}</th>`).join('')}</tr>`;
    const gRows = tabs.raw_google_daily.map((r) => `<tr>${td(f(r, ['campaign', 'Campaign']))}${td(f(r, ['region', 'market', 'Market']))}${td(`฿${ZaapiDataService.toNumber(f(r, ['spend_thb', 'Spend THB'])).toLocaleString()}`)}${td(f(r, ['search_IS', 'search_is', 'is']))}${td(f(r, ['lost_IS_rank', 'lost_is_rank']), rankColor(f(r, ['lost_IS_rank', 'lost_is_rank'])))}${td(f(r, ['lost_IS_budget', 'lost_is_budget']))}${td(ZaapiDataService.fmtCW(f(r, ['CW', 'cw'])))}</tr>`).join('');
    document.getElementById('google-table').innerHTML = gHead + gRows;

    const wHead = `<tr class="text-slate-400">${['CW','Region','Spend THB','FTI','Health'].map((h)=>`<th class="text-left px-2 py-1 border-b border-slate-700">${h}</th>`).join('')}</tr>`;
    const wRows = weekly.map((r) => `<tr>${td(ZaapiDataService.fmtCW(f(r, ['CW', 'cw'])))}${td(f(r, ['region', 'market', 'Region']))}${td(`฿${ZaapiDataService.toNumber(f(r, ['spend_thb', 'Spend THB'])).toLocaleString()}`)}${td(ZaapiDataService.toNumber(f(r, ['fti', 'FTI', 'fti_actual'])))}${td(f(r, ['health_signal', 'health']))}</tr>`).join('');
    document.getElementById('meta-table').innerHTML = wHead + wRows;

    const suggestions = tabs.action_log
      .filter((r) => String(f(r, ['scope', 'Scope'])).toLowerCase() === 'search')
      .slice(0, 5)
      .map((r) => f(r, ['action_suggested', 'suggestion']))
      .filter(Boolean);

    document.getElementById('suggestions').innerHTML = suggestions.length
      ? suggestions.map((s) => `• ${s}`).join('<br>')
      : 'No suggestions.';

    loading.classList.add('hidden');
    content.classList.remove('hidden');
  } catch (error) {
    loading.textContent = `Failed to load Google Sheets data: ${error.message}`;
  }
}

document.addEventListener('DOMContentLoaded', initSearch);
