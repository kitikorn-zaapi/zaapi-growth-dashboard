let rows = [];

function setOpts(id, values) {
  document.getElementById(id).innerHTML += [...new Set(values.filter(Boolean))].map((v) => `<option>${v}</option>`).join("");
}

function render() {
  const scope = document.getElementById("scope").value;
  const market = document.getElementById("market").value;
  const list = rows.filter((r) => (!scope || r.scope === scope) && (!market || r.market === market));

  const head = `<tr class="text-slate-400">${["Date","CW","Scope","Market","Learning","Source CW","Impact","Added by","Jump"].map((h)=>`<th class="text-left px-2 py-1 border-b border-slate-700">${h}</th>`).join("")}</tr>`;
  const body = list.map((r) => `<tr>
    <td class="px-2 py-1 border-b border-slate-800">${r.date}</td><td class="px-2 py-1 border-b border-slate-800">${r.cw}</td><td class="px-2 py-1 border-b border-slate-800">${r.scope}</td>
    <td class="px-2 py-1 border-b border-slate-800">${r.market}</td><td class="px-2 py-1 border-b border-slate-800">${r.learning}</td><td class="px-2 py-1 border-b border-slate-800">${r.source_cw || "—"}</td>
    <td class="px-2 py-1 border-b border-slate-800">${r.impact || "—"}</td><td class="px-2 py-1 border-b border-slate-800">${r.added_by || "—"}</td>
    <td class="px-2 py-1 border-b border-slate-800"><a class="underline" href="action-log.html?cw=${encodeURIComponent(r.cw || "")}">Jump to action log CW</a></td>
  </tr>`).join("");
  document.getElementById("table").innerHTML = head + body;
}

async function init() {
  const loading = document.getElementById("loading");
  try {
    rows = await ZaapiDataService.fetchTab("learning_accum");
    setOpts("scope", rows.map((r) => r.scope));
    setOpts("market", rows.map((r) => r.market));
    document.getElementById("scope").addEventListener("change", render);
    document.getElementById("market").addEventListener("change", render);
    render();
    loading.classList.add("hidden");
    document.getElementById("content").classList.remove("hidden");
  } catch (error) {
    loading.textContent = `Failed to load Google Sheets data: ${error.message}`;
  }
}

document.addEventListener("DOMContentLoaded", init);
