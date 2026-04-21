let rows = [];
const badge = (v, map) => `<span class="px-2 py-0.5 rounded text-xs ${map[v] || "bg-slate-700"}">${v || "—"}</span>`;

function options(id, values) {
  const el = document.getElementById(id);
  el.innerHTML += [...new Set(values.filter(Boolean))].map((v) => `<option>${v}</option>`).join("");
}

function render() {
  const f = {
    cw: document.getElementById("f-cw").value,
    region: document.getElementById("f-region").value,
    status: document.getElementById("f-status").value,
    type: document.getElementById("f-type").value
  };

  const list = rows.filter((r) => (!f.cw || r.cw === f.cw) && (!f.region || r.region === f.region) && (!f.status || r.status === f.status) && (!f.type || r.type === f.type));

  const head = `<tr class="text-slate-400">${["CW","Suggestion","Region/Campaign","Priority","Status","Date actioned","Date check","Outcome","AI verdict"].map((h)=>`<th class="text-left px-2 py-1 border-b border-slate-700">${h}</th>`).join("")}</tr>`;
  const body = list.map((r) => `<tr>
    <td class="px-2 py-1 border-b border-slate-800">${r.cw}</td>
    <td class="px-2 py-1 border-b border-slate-800">${r.suggestion}</td>
    <td class="px-2 py-1 border-b border-slate-800">${r.region_campaign || r.region || r.campaign || "—"}</td>
    <td class="px-2 py-1 border-b border-slate-800">${r.priority || "—"}</td>
    <td class="px-2 py-1 border-b border-slate-800">${badge(r.status, {"Pending":"bg-amber-900 text-amber-200","Done":"bg-emerald-900 text-emerald-200","Skipped":"bg-slate-700 text-slate-100"}).replace("Pending","⏳ Pending").replace("Done","✅ Done").replace("Skipped","⏭️ Skipped")}</td>
    <td class="px-2 py-1 border-b border-slate-800">${r.date_actioned || "—"}</td>
    <td class="px-2 py-1 border-b border-slate-800">${r.date_check || "—"}</td>
    <td class="px-2 py-1 border-b border-slate-800">${badge(r.outcome, {"Worked":"bg-emerald-900 text-emerald-200","No impact":"bg-red-900 text-red-200","Too early":"bg-yellow-900 text-yellow-200"}).replace("Worked","✅ Worked").replace("No impact","❌ No impact").replace("Too early","⚠️ Too early")}</td>
    <td class="px-2 py-1 border-b border-slate-800">${r.ai_verdict || "—"}</td>
  </tr>`).join("");
  document.getElementById("table").innerHTML = head + body;
}

async function init() {
  const loading = document.getElementById("loading");
  try {
    rows = await ZaapiDataService.fetchTab("action_log");
    options("f-cw", rows.map((r) => r.cw));
    options("f-region", rows.map((r) => r.region));
    options("f-status", rows.map((r) => r.status));
    options("f-type", rows.map((r) => r.type));
    ["f-cw","f-region","f-status","f-type"].forEach((id) => document.getElementById(id).addEventListener("change", render));
    render();
    loading.classList.add("hidden");
    document.getElementById("content").classList.remove("hidden");
  } catch (error) {
    loading.textContent = `Failed to load Google Sheets data: ${error.message}`;
  }
}

document.addEventListener("DOMContentLoaded", init);
