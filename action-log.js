// action-log.js — Actions + Outcomes (new schema)
// Reads action_log + learning_accum; joins on action_log.id = learning_accum.linked_action_id
//
// New schema:
//   id, created_at, CW, region, layer, entity_id, verdict, action, reasoning,
//   confidence, expected_primary_metric, expected_primary_value,
//   expected_structural_metric, expected_structural_value, expected_by_CW,
//   status, pattern_tags, outcome_id

let rows = [];
let outcomesByActionId = new Map();

const F = (row, keys, fallback = '') => ZaapiDataService.pick(row, keys, fallback);
const N = (v) => ZaapiDataService.toNumber(v);

const verdictBadge = {
  scale:      'bg-emerald-900 text-emerald-200',
  kill:       'bg-red-900 text-red-200',
  reduce:     'bg-red-900/60 text-red-300',
  hold:       'bg-slate-700 text-slate-200',
  watch:      'bg-orange-900 text-orange-200',
  refresh:    'bg-yellow-900 text-yellow-200',
  new_target: 'bg-purple-900 text-purple-200',
  new_channel:'bg-cyan-900 text-cyan-200',
};

const statusBadge = {
  pending:   'bg-amber-900 text-amber-200',
  actioned:  'bg-sky-900 text-sky-200',
  done:      'bg-emerald-900 text-emerald-200',
  skipped:   'bg-slate-700 text-slate-300',
  measured:  'bg-indigo-900 text-indigo-200',
};

function badge(v, map, icon = '') {
  const key = String(v || '').toLowerCase().trim();
  const cls = map[key] || 'bg-slate-700 text-slate-300';
  return `<span class="px-2 py-0.5 rounded text-xs ${cls}">${icon}${v || '—'}</span>`;
}

function setOptions(id, values) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML += [...new Set(values.filter(Boolean))].sort().map((v) => `<option>${v}</option>`).join('');
}

function render() {
  const fCW      = document.getElementById('f-cw').value;
  const fRegion  = document.getElementById('f-region').value;
  const fStatus  = document.getElementById('f-status').value;
  const fVerdict = document.getElementById('f-verdict').value;

  const list = rows.filter((r) => {
    const cw      = F(r, ['CW', 'cw']);
    const region  = F(r, ['region']);
    const status  = F(r, ['status']);
    const verdict = F(r, ['verdict']);
    return (!fCW || cw === fCW)
        && (!fRegion || region === fRegion)
        && (!fStatus || status === fStatus)
        && (!fVerdict || verdict === fVerdict);
  });

  // Sort: pending first (descending confidence), then done/measured
  list.sort((a, b) => {
    const sa = String(F(a, ['status'])).toLowerCase();
    const sb = String(F(b, ['status'])).toLowerCase();
    const pendingA = sa === 'pending' ? 0 : 1;
    const pendingB = sb === 'pending' ? 0 : 1;
    if (pendingA !== pendingB) return pendingA - pendingB;
    return N(F(b, ['confidence'])) - N(F(a, ['confidence']));
  });

  const cols = ['CW', 'Region', 'Layer', 'Entity', 'Verdict', 'Action', 'Conf', 'Predicted', 'By CW', 'Status', 'Outcome'];
  const head = `<tr class="text-slate-400">${cols.map((h) => `<th class="text-left px-2 py-1 border-b border-slate-700 text-xs">${h}</th>`).join('')}</tr>`;

  const body = list.map((r) => {
    const id      = F(r, ['id']);
    const cw      = F(r, ['CW', 'cw']);
    const region  = F(r, ['region']);
    const layer   = F(r, ['layer']);
    const entity  = F(r, ['entity_id']);
    const verdict = F(r, ['verdict']);
    const action  = F(r, ['action']);
    const confRaw = N(F(r, ['confidence']));
    const conf    = confRaw > 0 ? `${Math.round(confRaw * 100)}%` : '—';
    const predMetric = F(r, ['expected_primary_metric']);
    const predVal    = F(r, ['expected_primary_value']);
    const predicted  = predMetric ? `${predMetric}=${predVal}` : '—';
    const byCW    = F(r, ['expected_by_CW']);
    const status  = F(r, ['status']);

    // Outcome join: look up learning_accum row where linked_action_id == action.id
    const outcome = outcomesByActionId.get(id);
    let outcomeCell = '—';
    if (outcome) {
      const v  = String(F(outcome, ['verdict'])).toLowerCase();
      const va = N(F(outcome, ['variance_pct']));
      const icon = v === 'worked' ? '✅' : v === 'partial' ? '🟡' : v === 'missed' ? '❌' : '·';
      const pct = Number.isFinite(va) && va !== 0 ? ` (${va > 0 ? '+' : ''}${va.toFixed(0)}%)` : '';
      outcomeCell = `<span class="text-xs">${icon} ${F(outcome, ['verdict']) || 'recorded'}${pct}</span>`;
    } else if (String(status).toLowerCase() === 'pending') {
      outcomeCell = `<span class="text-xs text-slate-500 italic">awaiting ${byCW || '?'}</span>`;
    }

    return `<tr class="hover:bg-slate-800/40">
      <td class="px-2 py-1 border-b border-slate-800 text-xs font-mono">${cw}</td>
      <td class="px-2 py-1 border-b border-slate-800 text-xs">${region}</td>
      <td class="px-2 py-1 border-b border-slate-800 text-xs opacity-70">${layer}</td>
      <td class="px-2 py-1 border-b border-slate-800 text-xs font-mono opacity-70">${entity || '—'}</td>
      <td class="px-2 py-1 border-b border-slate-800">${badge(verdict, verdictBadge)}</td>
      <td class="px-2 py-1 border-b border-slate-800 text-xs">${action}</td>
      <td class="px-2 py-1 border-b border-slate-800 text-xs">${conf}</td>
      <td class="px-2 py-1 border-b border-slate-800 text-xs font-mono opacity-80">${predicted}</td>
      <td class="px-2 py-1 border-b border-slate-800 text-xs">${byCW || '—'}</td>
      <td class="px-2 py-1 border-b border-slate-800">${badge(status, statusBadge)}</td>
      <td class="px-2 py-1 border-b border-slate-800">${outcomeCell}</td>
    </tr>`;
  }).join('');

  document.getElementById('table').innerHTML = head + (body || `<tr><td class="px-2 py-6 text-center text-slate-500" colspan="${cols.length}">No actions match current filters.</td></tr>`);

  // Summary counts under filters
  const counts = {
    total: list.length,
    pending: list.filter((r) => String(F(r, ['status'])).toLowerCase() === 'pending').length,
    done: list.filter((r) => ['done', 'actioned', 'measured'].includes(String(F(r, ['status'])).toLowerCase())).length,
    worked: list.filter((r) => {
      const o = outcomesByActionId.get(F(r, ['id']));
      return o && String(F(o, ['verdict'])).toLowerCase() === 'worked';
    }).length,
  };
  const summary = document.getElementById('summary-counts');
  if (summary) {
    summary.innerHTML = `
      <span>${counts.total} actions</span>
      <span class="text-amber-300">${counts.pending} pending</span>
      <span class="text-sky-300">${counts.done} actioned</span>
      <span class="text-emerald-300">${counts.worked} worked</span>`;
  }
}

async function init() {
  const loading = document.getElementById('loading');
  try {
    const [actionLog, learningAccum] = await Promise.all([
      ZaapiDataService.fetchTab('action_log'),
      ZaapiDataService.fetchTab('learning_accum').catch(() => []),
    ]);
    rows = actionLog;

    // Build outcome lookup by linked_action_id → learning_accum row
    outcomesByActionId = new Map();
    (learningAccum || []).forEach((r) => {
      const link = F(r, ['linked_action_id']);
      if (link) outcomesByActionId.set(link, r);
    });

    setOptions('f-cw',      rows.map((r) => F(r, ['CW', 'cw'])));
    setOptions('f-region',  rows.map((r) => F(r, ['region'])));
    setOptions('f-status',  rows.map((r) => F(r, ['status'])));
    setOptions('f-verdict', rows.map((r) => F(r, ['verdict'])));

    ['f-cw', 'f-region', 'f-status', 'f-verdict'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', render);
    });

    render();
    loading.classList.add('hidden');
    document.getElementById('content').classList.remove('hidden');
  } catch (error) {
    loading.textContent = `Failed to load Google Sheets data: ${error.message}`;
  }
}

document.addEventListener('DOMContentLoaded', init);
