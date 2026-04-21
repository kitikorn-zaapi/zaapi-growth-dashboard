// learning-accum.js — Accumulated Learning (new schema)
// Reads learning_accum; joins back to action_log via linked_action_id for region/layer context.
//
// New schema:
//   id, linked_action_id, CW_measured, actual_primary_value, expected_primary_value,
//   actual_structural_value, expected_structural_value, variance_pct, verdict,
//   pattern_tags, lesson

let rows = [];
let actionsById = new Map();

const F = (row, keys, fallback = '') => ZaapiDataService.pick(row, keys, fallback);
const N = (v) => ZaapiDataService.toNumber(v);

const verdictBadge = {
  worked:  'bg-emerald-900 text-emerald-200',
  partial: 'bg-yellow-900 text-yellow-200',
  missed:  'bg-red-900 text-red-200',
  too_early: 'bg-slate-700 text-slate-300',
};

function badge(v, map) {
  const key = String(v || '').toLowerCase().trim();
  const cls = map[key] || 'bg-slate-700 text-slate-300';
  return `<span class="px-2 py-0.5 rounded text-xs ${cls}">${v || '—'}</span>`;
}

function parseTags(raw) {
  if (!raw) return [];
  return String(raw).replace(/^\[|\]$/g, '').split(',').map((t) => t.trim()).filter(Boolean);
}

function setOptions(id, values) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML += [...new Set(values.filter(Boolean))].sort().map((v) => `<option>${v}</option>`).join('');
}

function allTags(rows) {
  const s = new Set();
  rows.forEach((r) => parseTags(F(r, ['pattern_tags'])).forEach((t) => s.add(t)));
  return [...s].sort();
}

function render() {
  const fRegion  = document.getElementById('f-region').value;
  const fVerdict = document.getElementById('f-verdict').value;
  const fTag     = document.getElementById('f-tag').value;

  const list = rows.filter((r) => {
    const action = actionsById.get(F(r, ['linked_action_id']));
    const region = action ? F(action, ['region']) : '';
    const verdict = F(r, ['verdict']);
    const tags = parseTags(F(r, ['pattern_tags']));
    return (!fRegion || region === fRegion)
        && (!fVerdict || verdict === fVerdict)
        && (!fTag || tags.includes(fTag));
  });

  // Most recent first
  list.sort((a, b) => {
    const ca = parseInt(String(F(a, ['CW_measured'])).replace(/\D/g, ''), 10) || 0;
    const cb = parseInt(String(F(b, ['CW_measured'])).replace(/\D/g, ''), 10) || 0;
    return cb - ca;
  });

  const cols = ['CW', 'Region', 'Linked Action', 'Predicted → Actual', 'Variance', 'Verdict', 'Lesson', 'Tags'];
  const head = `<tr class="text-slate-400">${cols.map((h) => `<th class="text-left px-2 py-1 border-b border-slate-700 text-xs">${h}</th>`).join('')}</tr>`;

  const body = list.map((r) => {
    const linkId  = F(r, ['linked_action_id']);
    const action  = actionsById.get(linkId);
    const region  = action ? F(action, ['region']) : '—';
    const actText = action ? F(action, ['action']) : linkId || '—';

    const expected = N(F(r, ['expected_primary_value']));
    const actual   = N(F(r, ['actual_primary_value']));
    const variance = N(F(r, ['variance_pct']));
    const varSign  = variance > 0 ? '+' : '';
    const varColor = Math.abs(variance) < 15 ? 'text-emerald-300'
                   : Math.abs(variance) < 40 ? 'text-yellow-300'
                   : 'text-red-300';

    const predActual = Number.isFinite(expected) && Number.isFinite(actual)
      ? `${expected} → <b>${actual}</b>`
      : '—';
    const varCell = Number.isFinite(variance)
      ? `<span class="${varColor}">${varSign}${variance.toFixed(0)}%</span>`
      : '—';

    const tags = parseTags(F(r, ['pattern_tags']));
    const tagPills = tags.map((t) => `<span class="text-[10px] px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 mr-1 mb-1 inline-block">${t}</span>`).join('');

    return `<tr class="hover:bg-slate-800/40 align-top">
      <td class="px-2 py-2 border-b border-slate-800 text-xs font-mono">${F(r, ['CW_measured'])}</td>
      <td class="px-2 py-2 border-b border-slate-800 text-xs">${region}</td>
      <td class="px-2 py-2 border-b border-slate-800 text-xs">
        <div class="font-mono text-[10px] opacity-60">${linkId || '(unlinked)'}</div>
        <div class="opacity-90">${actText}</div>
      </td>
      <td class="px-2 py-2 border-b border-slate-800 text-xs font-mono">${predActual}</td>
      <td class="px-2 py-2 border-b border-slate-800 text-xs font-semibold">${varCell}</td>
      <td class="px-2 py-2 border-b border-slate-800">${badge(F(r, ['verdict']), verdictBadge)}</td>
      <td class="px-2 py-2 border-b border-slate-800 text-xs max-w-md">${F(r, ['lesson'])}</td>
      <td class="px-2 py-2 border-b border-slate-800 text-xs">${tagPills}</td>
    </tr>`;
  }).join('');

  document.getElementById('table').innerHTML = head + (body || `<tr><td class="px-2 py-6 text-center text-slate-500" colspan="${cols.length}">No learnings match current filters.</td></tr>`);

  // Counter strip
  const total = list.length;
  const worked = list.filter((r) => String(F(r, ['verdict'])).toLowerCase() === 'worked').length;
  const missed = list.filter((r) => String(F(r, ['verdict'])).toLowerCase() === 'missed').length;
  const counts = document.getElementById('summary-counts');
  if (counts) counts.innerHTML = `<span>${total} lessons</span><span class="text-emerald-300">${worked} worked</span><span class="text-red-300">${missed} missed</span>`;
}

async function init() {
  const loading = document.getElementById('loading');
  try {
    const [learning, actions] = await Promise.all([
      ZaapiDataService.fetchTab('learning_accum'),
      ZaapiDataService.fetchTab('action_log').catch(() => []),
    ]);
    rows = learning;

    // Build action lookup by id for region/action-text hydration
    actionsById = new Map();
    (actions || []).forEach((a) => {
      const id = F(a, ['id']);
      if (id) actionsById.set(id, a);
    });

    // Populate filter options
    const regions = rows.map((r) => {
      const a = actionsById.get(F(r, ['linked_action_id']));
      return a ? F(a, ['region']) : '';
    });
    setOptions('f-region',  regions);
    setOptions('f-verdict', rows.map((r) => F(r, ['verdict'])));
    setOptions('f-tag',     allTags(rows));

    ['f-region', 'f-verdict', 'f-tag'].forEach((id) => {
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
