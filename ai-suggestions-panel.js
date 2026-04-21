// ai-suggestions-panel.js — shared module
// Renders "This Week's Suggestions + Last 2 Weeks Results" panel.
// Called from Overview, Campaign, and Asset pages with different scope filters.
//
// Data flow:
//   - action_log: current + past AI suggestions
//   - learning_accum: outcomes measured later, linked via linked_action_id → action_log.id
//
// Usage:
//   AISuggestionsPanel.render(containerEl, {
//     actionLog, learningAccum, currentCW,
//     layers: ['campaign', 'overview'],  // optional filter
//     region: 'TH',                       // optional filter
//     lookbackWeeks: 2,                   // default 2
//     title: 'AI Suggestions · Campaign Layer'
//   });

window.AISuggestionsPanel = (function () {

  const F = (row, keys, fallback = '') => ZaapiDataService.pick(row, keys, fallback);
  const N = (v) => ZaapiDataService.toNumber(v);

  const verdictColor = {
    scale:       'bg-emerald-950/60 border-emerald-900 text-emerald-300',
    kill:        'bg-red-950/60 border-red-900 text-red-300',
    reduce:      'bg-red-900/40 border-red-900 text-red-300',
    hold:        'bg-slate-900/60 border-slate-700 text-slate-300',
    watch:       'bg-orange-950/60 border-orange-900 text-orange-300',
    refresh:     'bg-yellow-950/60 border-yellow-900 text-yellow-300',
    new_target:  'bg-purple-950/60 border-purple-900 text-purple-300',
    new_channel: 'bg-cyan-950/60 border-cyan-900 text-cyan-300',
  };

  const outcomeColor = {
    worked:    'bg-emerald-900 text-emerald-200',
    partial:   'bg-yellow-900 text-yellow-200',
    missed:    'bg-red-900 text-red-200',
    too_early: 'bg-slate-700 text-slate-300',
  };

  const statusBadge = {
    pending:  '⏳ pending',
    actioned: '🔧 actioned',
    done:     '✓ done',
    skipped:  '⏭ skipped',
    measured: '📊 measured',
  };

  // --- CW math ------------------------------------------------------------
  function cwNum(cwStr) {
    const m = String(cwStr || '').match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
  }

  // --- filter -------------------------------------------------------------
  function filterActions(actionLog, layers, region) {
    return (actionLog || []).filter((a) => {
      if (layers && layers.length) {
        const layer = String(F(a, ['layer'])).toLowerCase();
        if (!layers.map((l) => l.toLowerCase()).includes(layer)) return false;
      }
      if (region) {
        if (String(F(a, ['region'])).toUpperCase() !== String(region).toUpperCase()) return false;
      }
      return true;
    });
  }

  // --- outcome lookup -----------------------------------------------------
  function buildOutcomeMap(learningAccum) {
    const map = new Map();
    (learningAccum || []).forEach((r) => {
      const link = F(r, ['linked_action_id']);
      if (link) map.set(link, r);
    });
    return map;
  }

  // --- render a single action card ---------------------------------------
  function renderActionCard(action, outcome, opts = {}) {
    const id        = F(action, ['id']);
    const region    = F(action, ['region']);
    const layer     = F(action, ['layer']);
    const entity    = F(action, ['entity_id']);
    const verdict   = String(F(action, ['verdict'])).toLowerCase();
    const actionTxt = F(action, ['action']);
    const reason    = F(action, ['reasoning']);
    const confRaw   = N(F(action, ['confidence']));
    const conf      = confRaw > 0 ? `${Math.round(confRaw * 100)}%` : '—';
    const predMetric = F(action, ['expected_primary_metric']);
    const predValue  = F(action, ['expected_primary_value']);
    const byCW       = F(action, ['expected_by_CW']);
    const status     = String(F(action, ['status'])).toLowerCase();

    const verdCls = verdictColor[verdict] || verdictColor.hold;
    const statusLabel = statusBadge[status] || status || 'pending';

    // Outcome display
    let outcomeBlock = '';
    if (outcome) {
      const oVerdict = String(F(outcome, ['verdict'])).toLowerCase();
      const oCls = outcomeColor[oVerdict] || 'bg-slate-700';
      const actualVal = F(outcome, ['actual_primary_value']);
      const variance = N(F(outcome, ['variance_pct']));
      const varSign = variance > 0 ? '+' : '';
      const lesson = F(outcome, ['lesson']);
      outcomeBlock = `
        <div class="mt-2 pt-2 border-t border-slate-800">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-[10px] px-1.5 py-0.5 rounded ${oCls}">${F(outcome, ['verdict']) || 'recorded'}</span>
            <span class="text-[11px] font-mono opacity-80">predicted ${predValue} → actual <b>${actualVal}</b></span>
            ${Number.isFinite(variance) ? `<span class="text-[11px] ${Math.abs(variance) < 15 ? 'text-emerald-300' : Math.abs(variance) < 40 ? 'text-yellow-300' : 'text-red-300'}">${varSign}${variance.toFixed(0)}%</span>` : ''}
          </div>
          ${lesson ? `<div class="text-[11px] text-slate-400 italic mt-1">💡 ${lesson}</div>` : ''}
        </div>`;
    } else if (status === 'pending') {
      outcomeBlock = `<div class="mt-2 pt-2 border-t border-slate-800 text-[11px] text-slate-500 italic">⏱ awaiting outcome · expected by ${byCW || '?'}</div>`;
    }

    const entityBlock = entity ? `<span class="text-[10px] font-mono opacity-50">${entity}</span>` : '';
    const regionBadge = `<span class="text-[10px] px-1 py-0.5 rounded bg-slate-800 text-slate-400">${region}</span>`;
    const layerBadge = `<span class="text-[10px] px-1 py-0.5 rounded bg-slate-800 text-slate-400">${layer}</span>`;
    const showRegion = !opts.hideRegion;

    return `
      <div class="border ${verdCls} rounded p-2.5 space-y-1.5">
        <div class="flex items-start justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-2 flex-wrap min-w-0">
            <span class="text-[10px] font-mono opacity-50">${id}</span>
            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${verdCls}">${verdict.toUpperCase().replace('_', ' ')}</span>
            ${showRegion ? regionBadge : ''}
            ${layerBadge}
            ${entityBlock}
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <span class="text-[10px] opacity-60">conf ${conf}</span>
            <span class="text-[10px] opacity-80">${statusLabel}</span>
          </div>
        </div>
        <div class="text-xs font-semibold">${actionTxt}</div>
        ${reason ? `<div class="text-[11px] opacity-70 leading-snug">${reason}</div>` : ''}
        <div class="text-[11px] font-mono opacity-80">
          Target: ${predMetric || '—'} = ${predValue || '—'} by ${byCW || '—'}
        </div>
        ${outcomeBlock}
      </div>`;
  }

  // --- main render --------------------------------------------------------
  function render(container, opts) {
    if (!container) return;

    const {
      actionLog = [],
      learningAccum = [],
      currentCW = '',
      layers = null,
      region = null,
      lookbackWeeks = 2,
      title = 'AI Suggestions + Outcomes',
    } = opts;

    const filtered = filterActions(actionLog, layers, region);
    const outcomeMap = buildOutcomeMap(learningAccum);
    const nowCW = cwNum(currentCW);

    // Group into buckets: this week, CW-1, CW-2, older-with-outcome
    const thisWeek = [];
    const lastWeek = [];
    const twoWeeksAgo = [];
    const olderOutcomed = [];

    filtered.forEach((a) => {
      const acw = cwNum(F(a, ['CW', 'cw']));
      if (acw === nowCW) thisWeek.push(a);
      else if (acw === nowCW - 1) lastWeek.push(a);
      else if (acw === nowCW - 2 && lookbackWeeks >= 2) twoWeeksAgo.push(a);
      else if (acw < nowCW && outcomeMap.has(F(a, ['id']))) olderOutcomed.push(a);
    });

    // Sort: highest confidence first inside each bucket
    const sortByConf = (a, b) => N(F(b, ['confidence'])) - N(F(a, ['confidence']));
    thisWeek.sort(sortByConf);
    lastWeek.sort(sortByConf);
    twoWeeksAgo.sort(sortByConf);

    // Helper: section renderer
    const section = (heading, items, emptyMsg) => {
      const count = items.length;
      const worked = items.filter((a) => {
        const o = outcomeMap.get(F(a, ['id']));
        return o && String(F(o, ['verdict'])).toLowerCase() === 'worked';
      }).length;
      const missed = items.filter((a) => {
        const o = outcomeMap.get(F(a, ['id']));
        return o && String(F(o, ['verdict'])).toLowerCase() === 'missed';
      }).length;
      const pending = items.filter((a) => String(F(a, ['status'])).toLowerCase() === 'pending').length;

      const badges = [];
      if (count) badges.push(`${count} total`);
      if (worked) badges.push(`<span class="text-emerald-300">✅ ${worked} worked</span>`);
      if (missed) badges.push(`<span class="text-red-300">❌ ${missed} missed</span>`);
      if (pending) badges.push(`<span class="text-amber-300">⏳ ${pending} pending</span>`);

      return `
        <div class="space-y-2">
          <div class="flex items-baseline gap-2 flex-wrap border-b border-slate-800 pb-1">
            <h3 class="text-sm font-semibold">${heading}</h3>
            <span class="text-[11px] opacity-70">${badges.join(' · ')}</span>
          </div>
          ${items.length
            ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-2">${items.map((a) => renderActionCard(a, outcomeMap.get(F(a, ['id'])), { hideRegion: !!region })).join('')}</div>`
            : `<div class="text-xs text-slate-500 italic p-3 bg-slate-950/40 rounded">${emptyMsg}</div>`}
        </div>`;
    };

    // Compose the panel
    const thisWeekHeading = `🤖 This Week (${currentCW}) · Pending Actions`;
    const lastWeekHeading = `📊 Last Week (CW${nowCW - 1}) · Results`;
    const twoWeeksHeading = `📊 2 Weeks Ago (CW${nowCW - 2}) · Results`;

    const scopeLabel = [
      layers ? `layer: ${layers.join('/')}` : 'all layers',
      region ? `region: ${region}` : null,
    ].filter(Boolean).join(' · ');

    container.innerHTML = `
      <article class="bg-slate-900 border border-slate-800 rounded p-4 space-y-4">
        <header class="flex items-baseline justify-between flex-wrap gap-2">
          <h2 class="font-semibold">${title}</h2>
          <span class="text-[10px] uppercase tracking-wide text-slate-500">${scopeLabel}</span>
        </header>

        ${section(thisWeekHeading, thisWeek, 'No AI suggestions logged for this week in this scope.')}
        ${section(lastWeekHeading, lastWeek, 'No actions from last week in this scope.')}
        ${lookbackWeeks >= 2 ? section(twoWeeksHeading, twoWeeksAgo, 'No actions from two weeks ago in this scope.') : ''}

        ${olderOutcomed.length ? `
          <details>
            <summary class="cursor-pointer text-xs text-slate-400 hover:text-slate-200">▸ ${olderOutcomed.length} older actions with recorded outcomes</summary>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
              ${olderOutcomed.slice(0, 10).map((a) => renderActionCard(a, outcomeMap.get(F(a, ['id'])), { hideRegion: !!region })).join('')}
            </div>
          </details>
        ` : ''}
      </article>`;
  }

  return { render };
})();
