let rows = [];
let usdRate = 34;
let sortKey = 'hook_rate';

function n(v) { return ZaapiDataService.toNumber(v); }
function v(row, keys, fallback = '') { return ZaapiDataService.pick(row, keys, fallback); }
function money(thb, ccy) { return ccy === 'USD' ? `$${(n(thb) / usdRate).toFixed(0)}` : `฿${n(thb).toLocaleString()}`; }

function signalClass(r) {
  if (n(v(r, ['kill_signal'])) > 0 || String(v(r, ['status'])).toLowerCase() === 'kill') return 'border-red-500';
  if (n(v(r, ['scale_signal'])) > 0) return 'border-emerald-500';
  if (n(v(r, ['fatigue_signal'])) > 0 || n(v(r, ['frequency'])) > 3) return 'border-yellow-500';
  return 'border-slate-700';
}

function render() {
  const funnel = document.getElementById('funnel').value;
  const ccy = document.getElementById('currency').value;
  const filtered = rows.filter((r) => funnel === 'All' || String(v(r, ['funnel'])).toUpperCase() === funnel);

  document.getElementById('cards').innerHTML = filtered.map((r) => `
    <article class="bg-slate-900 border ${signalClass(r)} rounded p-3 space-y-1">
      <div class="flex justify-between"><b>${v(r, ['ad_code'])}</b><span class="text-xs px-2 py-0.5 rounded ${String(v(r, ['status'])).toLowerCase()==='kill'?'bg-red-900 text-red-200':'bg-emerald-900 text-emerald-200'}">${v(r, ['status'], 'Live')}</span></div>
      <div class="text-xs text-slate-400">${v(r, ['region'])} · ${v(r, ['prod'])} · ${v(r, ['angle'])}</div>
      <div class="text-sm">Hook Rate: ${n(v(r, ['hook_rate']))}%</div>
      <div class="text-sm">Thumb-Stop: ${n(v(r, ['thumb_stop']))} · ThruPlay: ${n(v(r, ['thruplay']))} · Frequency: ${n(v(r, ['frequency']))}</div>
      <div class="text-sm">FTI: ${n(v(r, ['fti']))} · CPA: ${money(v(r, ['cpa_thb']), ccy)}</div>
      <div class="text-xs text-slate-400">Assessment: ${v(r, ['assessment'], '—')}</div>
    </article>`).join('');

  const sorted = [...filtered].sort((a, b) => n(v(b, [sortKey])) - n(v(a, [sortKey])));
  const head = `<tr class="text-slate-400">${['Ad','Hook Rate','FTI','CPA'].map((h,i)=>`<th data-k="${['', 'hook_rate', 'fti', 'cpa_thb'][i]}" class="text-left px-2 py-1 border-b border-slate-700 ${i?'cursor-pointer':''}">${h}</th>`).join('')}</tr>`;
  const body = sorted.map((r) => `<tr><td class="px-2 py-1 border-b border-slate-800">${v(r, ['ad_code'])}</td><td class="px-2 py-1 border-b border-slate-800">${n(v(r, ['hook_rate']))}%</td><td class="px-2 py-1 border-b border-slate-800">${n(v(r, ['fti']))}</td><td class="px-2 py-1 border-b border-slate-800">${money(v(r, ['cpa_thb']), ccy)}</td></tr>`).join('');
  const table = document.getElementById('summary');
  table.innerHTML = head + body;
  table.querySelectorAll('th[data-k]').forEach((th) => th.addEventListener('click', () => { if (th.dataset.k) { sortKey = th.dataset.k; render(); } }));
}

async function initMeta() {
  const loading = document.getElementById('loading');
  try {
    const tabs = await ZaapiDataService.fetchTabs(['creative_log', 'config']);
    rows = tabs.creative_log;
    const config = await ZaapiDataService.getConfig();
    usdRate = ZaapiDataService.toNumber(config.usd_thb_rate, 34);
    document.getElementById('usd-rate').value = usdRate;
    document.getElementById('usd-rate').addEventListener('change', (e) => { usdRate = ZaapiDataService.toNumber(e.target.value, usdRate); render(); });
    document.getElementById('currency').addEventListener('change', render);
    document.getElementById('funnel').addEventListener('change', render);
    render();
    loading.classList.add('hidden');
    document.getElementById('content').classList.remove('hidden');
  } catch (error) {
    loading.textContent = `Failed to load Google Sheets data: ${error.message}`;
  }
}

document.addEventListener('DOMContentLoaded', initMeta);
