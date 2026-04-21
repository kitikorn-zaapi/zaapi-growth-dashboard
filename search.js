// search.js — Campaign Layer (Layer 2)
// Reads from: raw_google_daily (additive), raw_google_weekly_is (IS rate metrics),
//             raw_meta_daily (Meta spend), action_log (suggestions)

function td(v, cls = '') {
  return `<td class="px-2 py-1 border-b border-slate-800 ${cls}">${v ?? '—'}</td>`;
}

function rankColor(v) {
  const n = ZaapiDataService.toNumber(v);
  if (n > 60) return 'text-red-400';
  if (n >= 30) return 'text-yellow-400';
  return 'text-emerald-400';
}

function f(row, keys, fallback = '') {
  return ZaapiDataService.pick(row, keys, fallback);
}

function fmtTHB(n) {
  return `฿${ZaapiDataService.toNumber(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// --- Aggregate raw_google_daily by latest CW × campaign (spend/clicks/impressions are additive) ---
function aggGoogleDailyToLatestCW(rows) {
  if (!rows.length) return { cw: '', campaigns: [] };

  // Find latest CW present
  const cws = [...new Set(rows.map(r => ZaapiDataService.fmtCW(f(r, ['CW', 'cw']))))]
    .filter(Boolean)
    .sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10));
  const latestCW = cws[cws.length - 1];

  const byCampaign = new Map();
  rows
    .filter(r => ZaapiDataService.fmtCW(f(r, ['CW', 'cw'])) === latestCW)
    .forEach(r => {
      const cid = f(r, ['campaign_id']);
      if (!byCampaign.has(cid)) {
        byCampaign.set(cid, {
          campaign_id: cid,
          campaign_name: f(r, ['campaign_name', 'campaign', 'Campaign']),
          channel_type: f(r, ['channel_type']),
          region: f(r, ['region', 'market', 'Region']),
          country: f(r, ['country']),
          spend: 0, clicks: 0, impressions: 0,
        });
      }
      const agg = byCampaign.get(cid);
      agg.spend += ZaapiDataService.toNumber(f(r, ['spend', 'spend_thb', 'Spend THB']));
      agg.clicks += ZaapiDataService.toNumber(f(r, ['clicks']));
      agg.impressions += ZaapiDataService.toNumber(f(r, ['impressions']));
    });

  return { cw: latestCW, campaigns: [...byCampaign.values()] };
}

// --- Index raw_google_weekly_is by {CW, campaign_id} for lookup ---
function indexWeeklyIS(rows) {
  const idx = new Map();
  rows.forEach(r => {
    const cw = ZaapiDataService.fmtCW(f(r, ['CW', 'cw']));
    const cid = f(r, ['campaign_id']);
    idx.set(`${cw}::${cid}`, {
      search_IS:      ZaapiDataService.toNumber(f(r, ['search_IS'])),
      lost_IS_rank:   ZaapiDataService.toNumber(f(r, ['lost_IS_rank'])),
      lost_IS_budget: ZaapiDataService.toNumber(f(r, ['lost_IS_budget'])),
    });
  });
  return idx;
}

// --- Aggregate raw_meta_daily by latest CW × campaign ---
function aggMetaDailyToLatestCW(rows) {
  if (!rows.length) return { cw: '', campaigns: [] };
  const cws = [...new Set(rows.map(r => ZaapiDataService.fmtCW(f(r, ['CW', 'cw']))))]
    .filter(Boolean)
    .sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10));
  const latestCW = cws[cws.length - 1];

  const byCampaign = new Map();
  rows
    .filter(r => ZaapiDataService.fmtCW(f(r, ['CW', 'cw'])) === latestCW)
    .forEach(r => {
      const cid = f(r, ['campaign_id']);
      if (!byCampaign.has(cid)) {
        byCampaign.set(cid, {
          campaign_id: cid,
          campaign_name: f(r, ['campaign_name']),
          region: f(r, ['region']),
          country: f(r, ['country']),
          funnel: f(r, ['funnel']),
          status: f(r, ['status']),
          spend: 0, impressions: 0, clicks: 0, reach: 0,
        });
      }
      const agg = byCampaign.get(cid);
      agg.spend       += ZaapiDataService.toNumber(f(r, ['spend_thb', 'spend']));
      agg.impressions += ZaapiDataService.toNumber(f(r, ['impressions']));
      agg.clicks      += ZaapiDataService.toNumber(f(r, ['clicks']));
      agg.reach       += ZaapiDataService.toNumber(f(r, ['reach']));
    });

  return { cw: latestCW, campaigns: [...byCampaign.values()] };
}

async function initSearch() {
  const loading = document.getElementById('loading');
  const content = document.getElementById('content');

  try {
    const tabs = await ZaapiDataService.fetchTabs([
      'raw_google_daily',
      'raw_google_weekly_is',
      'raw_meta_daily',
      'action_log',
    ]);

    // ====== Google Search table ======
    const g = aggGoogleDailyToLatestCW(tabs.raw_google_daily);
    const isIdx = indexWeeklyIS(tabs.raw_google_weekly_is);

    const gHead = `<tr class="text-slate-400">${
      ['Campaign','Region','Country','Channel','Spend (THB)','Clicks','Impr','Search IS','Lost IS Rank','Lost IS Budget','CW']
        .map(h => `<th class="text-left px-2 py-1 border-b border-slate-700">${h}</th>`).join('')
    }</tr>`;

    const gRows = g.campaigns
      .sort((a, b) => b.spend - a.spend)
      .map(c => {
        const is = isIdx.get(`${g.cw}::${c.campaign_id}`) || {};
        const isCell      = is.search_IS      != null && is.search_IS      !== '' ? `${is.search_IS}%`      : '—';
        const lostRankCell= is.lost_IS_rank   != null && is.lost_IS_rank   !== '' ? `${is.lost_IS_rank}%`   : '—';
        const lostBudCell = is.lost_IS_budget != null && is.lost_IS_budget !== '' ? `${is.lost_IS_budget}%` : '—';
        return `<tr>
          ${td(c.campaign_name)}${td(c.region)}${td(c.country)}${td(c.channel_type)}
          ${td(fmtTHB(c.spend))}${td(c.clicks.toLocaleString())}${td(c.impressions.toLocaleString())}
          ${td(isCell)}${td(lostRankCell, rankColor(is.lost_IS_rank))}${td(lostBudCell)}
          ${td(g.cw)}
        </tr>`;
      })
      .join('');

    document.getElementById('google-table').innerHTML =
      gHead + (gRows || `<tr><td class="px-2 py-3 text-slate-500" colspan="11">No data for latest CW</td></tr>`);

    // ====== Meta Campaign table ======
    const m = aggMetaDailyToLatestCW(tabs.raw_meta_daily || []);
    const mHead = `<tr class="text-slate-400">${
      ['Campaign','Region','Country','Funnel','Status','Spend (THB)','Impr','Clicks','Reach','CW']
        .map(h => `<th class="text-left px-2 py-1 border-b border-slate-700">${h}</th>`).join('')
    }</tr>`;
    const mRows = m.campaigns
      .sort((a, b) => b.spend - a.spend)
      .map(c => `<tr>
        ${td(c.campaign_name)}${td(c.region)}${td(c.country)}${td(c.funnel)}${td(c.status)}
        ${td(fmtTHB(c.spend))}${td(c.impressions.toLocaleString())}${td(c.clicks.toLocaleString())}${td(c.reach.toLocaleString())}
        ${td(m.cw)}
      </tr>`).join('');

    document.getElementById('meta-table').innerHTML =
      mHead + (mRows || `<tr><td class="px-2 py-3 text-slate-500" colspan="10">No Meta data for latest CW</td></tr>`);

    // ====== Suggestions ======
    const suggestions = (tabs.action_log || [])
      .filter(r => String(f(r, ['scope', 'Scope'])).toLowerCase() === 'search')
      .slice(0, 5)
      .map(r => f(r, ['action_suggested', 'suggestion']))
      .filter(Boolean);
    document.getElementById('suggestions').innerHTML = suggestions.length
      ? suggestions.map(s => `• ${s}`).join('<br>')
      : 'No Search-scoped suggestions in action_log.';

    loading.classList.add('hidden');
    content.classList.remove('hidden');
  } catch (error) {
    loading.textContent = `Failed to load Google Sheets data: ${error.message}`;
  }
}

document.addEventListener('DOMContentLoaded', initSearch);
