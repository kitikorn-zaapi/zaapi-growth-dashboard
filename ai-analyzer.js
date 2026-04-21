// ai-analyzer.js — The brain of the learning loop.
// Called from app.js when user clicks 🧠 Analyze on a region card.
//
// Flow:
//   1. Gather current-week metrics + 6wk history + past actions for this region
//   2. Inject past actions' outcomes (learning_accum) as pattern context
//   3. Call Anthropic API (claude-sonnet-4) with structured JSON output
//   4. Render recommendations inline + provide CSV export for action_log
//
// API key:
//   - User-supplied, stored in localStorage only (never committed to repo)
//   - Security tradeoff: it's YOUR key on YOUR browser, talking to YOUR sheet.
//     For a multi-user deploy this would need a proxy.

window.AIAnalyzer = (function () {

  const MODEL = 'claude-sonnet-4-20250514';
  const API_URL = 'https://api.anthropic.com/v1/messages';
  const LS_KEY = 'zaapi_anthropic_api_key';

  // --- API KEY MGMT --------------------------------------------------------
  function getAPIKey() { return localStorage.getItem(LS_KEY) || ''; }
  function setAPIKey(key) {
    if (key) localStorage.setItem(LS_KEY, key);
    else localStorage.removeItem(LS_KEY);
  }
  function hasAPIKey() { return !!getAPIKey(); }

  // --- PROMPT BUILDER ------------------------------------------------------
  function buildPrompt({ region, cw, currentMetrics, history, pastActions, pastOutcomes }) {
    // Plan CACs by region (USD)
    const PLAN_CAC = { TH: 550, SEA: 739, ROW: 1800 };
    const cac = PLAN_CAC[region] || 'n/a';

    // Join actions to their outcomes
    const outcomeById = {};
    (pastOutcomes || []).forEach(o => {
      const key = String(o.linked_action_id || '').trim();
      if (key) outcomeById[key] = o;
    });

    const actionsWithOutcomes = (pastActions || [])
      .filter(a => String(a.region).toUpperCase() === region.toUpperCase())
      .slice(-12)   // last 12 actions for this region — enough pattern, not too much tokens
      .map(a => {
        const outcome = outcomeById[a.id];
        return {
          id: a.id,
          CW: a.CW,
          verdict: a.verdict,
          action: a.action,
          reasoning: a.reasoning,
          confidence: a.confidence,
          predicted: `${a.expected_primary_metric}=${a.expected_primary_value}`,
          pattern_tags: a.pattern_tags,
          outcome: outcome ? {
            actual: outcome.actual_primary_value,
            expected: outcome.expected_primary_value,
            variance_pct: outcome.variance_pct,
            verdict: outcome.verdict,
            lesson: outcome.lesson,
          } : null,
        };
      });

    const systemPrompt = `You are the Zaapi Growth Analyst AI. Zaapi is a SaaS omnichannel messaging platform running paid ads across TH, SEA (MY/SG/PH), and ROW (UK-primary).

Your job: analyze one region per call and produce 1-3 structured, falsifiable recommendations that get logged to action_log and measured against actuals next week.

Primary conversion: FTI (First Time Integrated — user registered + connected ≥1 channel).
Plan CACs: TH $550 / SEA $739 / ROW $1,800.

HARD RULES:
1. Produce 1-3 recommendations max. Fewer is better — weekly cognitive load matters.
2. Every prediction must be FALSIFIABLE: primary metric + structural signal + by_CW deadline.
3. Confidence (0.0-1.0) must reflect:
   - Data strength (weeks of clean signal)
   - Precedent (has similar past action succeeded in the history below?)
   - Shock context (recent holiday/collapse = lower confidence)
4. Never recommend SCALE if Lost IS (rank) < 30% (no auction headroom).
5. Never recommend SCALE during post-shock recovery without a stabilization signal.
6. Reference specific past action IDs (e.g., "[ref: 20260330-TH-01]") when patterns apply.
7. Reasoning: max 2 sentences. Be terse.

OUTPUT: Valid JSON matching this schema EXACTLY — no markdown, no prose, no code fences:
{
  "region": "${region}",
  "CW": "${cw}",
  "context_summary": "one sentence",
  "recommendations": [
    {
      "verdict": "hold|scale|reduce|new_target|refresh|watch|kill",
      "layer": "overview|campaign|asset",
      "entity_id": "campaign_id string or null",
      "action": "one-line imperative",
      "reasoning": "max 2 sentences",
      "confidence": 0.0,
      "expected_primary": {"metric": "FTI_weekly", "value": 15, "by_CW": "CW17"},
      "expected_structural": {"metric": "lost_IS_rank_avg", "value_max": 60, "by_CW": "CW18"},
      "past_references": ["20260330-TH-01"]
    }
  ]
}`;

    const userPrompt = `REGION: ${region}
CURRENT CW: ${cw}
PLAN CAC: $${cac}

=== CURRENT WEEK METRICS ===
${JSON.stringify(currentMetrics, null, 2)}

=== LAST 6 WEEKS HISTORY (additive) ===
${JSON.stringify(history.slice(-6), null, 2)}

=== PAST ACTIONS FOR ${region} (with outcomes where known) ===
${JSON.stringify(actionsWithOutcomes, null, 2)}

Now produce the JSON.`;

    return { systemPrompt, userPrompt };
  }

  // --- API CALL ------------------------------------------------------------
  async function callClaude({ systemPrompt, userPrompt }) {
    const apiKey = getAPIKey();
    if (!apiKey) throw new Error('No API key set. Click ⚙ to configure.');

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API error ${response.status}: ${text.slice(0, 300)}`);
    }
    const data = await response.json();
    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');
    return parseJSON(text);
  }

  function parseJSON(text) {
    // Strip ```json fences if present
    const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try { return JSON.parse(cleaned); }
    catch (e) { throw new Error(`Could not parse JSON from model: ${e.message}\nRaw: ${cleaned.slice(0, 400)}`); }
  }

  // --- CSV EXPORT for action_log paste ------------------------------------
  function toActionLogRow(rec, meta) {
    const id = `${meta.dateISO.replace(/[-:]/g, '').slice(0, 8)}-${meta.region}-${String(meta.idx).padStart(2, '0')}`;
    const csv = [
      id,
      `${meta.dateISO}`,
      meta.CW,
      meta.region,
      rec.layer || 'overview',
      rec.entity_id || '',
      rec.verdict,
      `"${(rec.action || '').replace(/"/g, '""')}"`,
      `"${(rec.reasoning || '').replace(/"/g, '""')}"`,
      rec.confidence,
      rec.expected_primary?.metric || '',
      rec.expected_primary?.value ?? '',
      rec.expected_structural?.metric || '',
      rec.expected_structural?.value_max ?? rec.expected_structural?.value ?? '',
      rec.expected_primary?.by_CW || '',
      'pending',
      `"[${(rec.past_references || []).join(',')}]"`,
      '', // outcome_id
    ].join(',');
    return { id, csv };
  }

  // --- RENDER --------------------------------------------------------------
  function verdictBadge(v) {
    const map = {
      kill:       'bg-red-950/60 border-red-900 text-red-300',
      scale:      'bg-emerald-950/60 border-emerald-900 text-emerald-300',
      reduce:     'bg-red-900/40 border-red-900 text-red-300',
      new_target: 'bg-purple-950/60 border-purple-900 text-purple-300',
      refresh:    'bg-yellow-950/60 border-yellow-900 text-yellow-300',
      watch:      'bg-orange-950/60 border-orange-900 text-orange-300',
      hold:       'bg-slate-900/60 border-slate-700 text-slate-300',
    };
    return map[v] || map.hold;
  }

  function renderAnalysis(containerEl, result, meta) {
    if (!result || !result.recommendations) {
      containerEl.innerHTML = '<div class="text-sm text-red-400">Model returned no recommendations.</div>';
      return;
    }

    const dateISO = new Date().toISOString();
    const csvLines = ['id,created_at,CW,region,layer,entity_id,verdict,action,reasoning,confidence,expected_primary_metric,expected_primary_value,expected_structural_metric,expected_structural_value,expected_by_CW,status,pattern_tags,outcome_id'];

    const recsHtml = result.recommendations.map((r, i) => {
      const { id, csv } = toActionLogRow(r, { ...meta, dateISO, idx: i + 1 });
      csvLines.push(csv);
      const confPct = Math.round((r.confidence || 0) * 100);
      const structVal = r.expected_structural?.value_max ?? r.expected_structural?.value;
      return `
        <div class="border ${verdictBadge(r.verdict)} rounded p-3 space-y-2">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="text-xs font-mono opacity-60">${id}</span>
              <span class="text-xs font-bold px-1.5 py-0.5 rounded ${verdictBadge(r.verdict)}">${(r.verdict || '').toUpperCase()}</span>
              ${r.entity_id ? `<span class="text-[10px] font-mono opacity-60">${r.entity_id}</span>` : ''}
            </div>
            <span class="text-xs">conf <b>${confPct}%</b></span>
          </div>
          <div class="text-sm font-semibold">${r.action}</div>
          <div class="text-xs opacity-80 leading-snug">${r.reasoning}</div>
          <div class="text-[11px] grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
            <div>
              <div class="opacity-60">Primary target</div>
              <div class="font-mono">${r.expected_primary?.metric} = ${r.expected_primary?.value} by ${r.expected_primary?.by_CW}</div>
            </div>
            <div>
              <div class="opacity-60">Structural signal</div>
              <div class="font-mono">${r.expected_structural?.metric} ≤ ${structVal} by ${r.expected_structural?.by_CW}</div>
            </div>
          </div>
          ${r.past_references?.length ? `<div class="text-[10px] opacity-50">Based on: ${r.past_references.map(p => `<code>${p}</code>`).join(', ')}</div>` : ''}
        </div>`;
    }).join('');

    const csvPayload = csvLines.join('\n');
    const csvB64 = btoa(unescape(encodeURIComponent(csvPayload)));

    containerEl.innerHTML = `
      <div class="space-y-2">
        <div class="text-xs text-slate-400 italic">${result.context_summary || ''}</div>
        ${recsHtml}
        <div class="flex gap-2 pt-2 border-t border-slate-800">
          <button id="copy-csv-btn" class="text-xs px-2 py-1 bg-emerald-900/40 border border-emerald-700 text-emerald-300 rounded hover:bg-emerald-800/40">📋 Copy action_log rows</button>
          <a href="data:text/csv;base64,${csvB64}" download="action_log_${meta.region}_${meta.CW}.csv" class="text-xs px-2 py-1 bg-slate-800 border border-slate-600 text-slate-300 rounded hover:bg-slate-700">⬇ Download CSV</a>
        </div>
      </div>`;

    const copyBtn = containerEl.querySelector('#copy-csv-btn');
    if (copyBtn) copyBtn.addEventListener('click', async () => {
      // Skip the header when copying — user pastes into existing sheet with headers already in row 1
      const rowsOnly = csvLines.slice(1).join('\n');
      try {
        await navigator.clipboard.writeText(rowsOnly);
        copyBtn.textContent = '✓ Copied';
        setTimeout(() => (copyBtn.textContent = '📋 Copy action_log rows'), 2000);
      } catch (e) {
        alert('Copy failed: ' + e.message);
      }
    });
  }

  // --- PUBLIC API ----------------------------------------------------------
  return {
    getAPIKey, setAPIKey, hasAPIKey,
    buildPrompt, callClaude, renderAnalysis,
  };
})();
