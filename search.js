function td(v, cls = "") { return `<td class="px-2 py-1 border-b border-slate-800 ${cls}">${v ?? "—"}</td>`; }

function rankColor(v) {
  const n = ZaapiDataService.toNumber(v);
  if (n > 60) return "text-red-400";
  if (n >= 30) return "text-yellow-400";
  return "text-emerald-400";
}

function fatigueTOF(r) {
  return ZaapiDataService.toNumber(r.frequency) > 2.5 && ZaapiDataService.toNumber(r.hook_rate_wow) < 0 ? "🟡 Refresh creative" : "—";
}

function fatigueBOF(r) {
  return ZaapiDataService.toNumber(r.frequency) > 3 && ZaapiDataService.toNumber(r.fti_wow) <= 0 ? "🔴 Audience saturated" : "—";
}

async function initSearch() {
  const loading = document.getElementById("loading");
  const content = document.getElementById("content");

  try {
    const tabs = await ZaapiDataService.fetchTabs(["weekly_summary", "raw_google_daily", "raw_meta_daily", "creative_log", "action_log"]);

    const gHead = `<tr class="text-slate-400">${["Campaign","Market","Spend THB","IS","Lost IS Rank","Lost IS Budget","WoW IS","Fatigue signal"].map((h)=>`<th class="text-left px-2 py-1 border-b border-slate-700">${h}</th>`).join("")}</tr>`;
    const gRows = tabs.raw_google_daily.map((r) => `<tr>${td(r.campaign)}${td(r.market)}${td(`฿${ZaapiDataService.toNumber(r.spend_thb).toLocaleString()}`)}${td(r.is)}${td(r.lost_is_rank, rankColor(r.lost_is_rank))}${td(r.lost_is_budget)}${td(r.wow_is)}${td(r.fatigue_signal || "—")}</tr>`).join("");
    document.getElementById("google-table").innerHTML = gHead + gRows;

    const mHead = `<tr class="text-slate-400">${["Campaign","Market","Spend THB","Impressions","FTI","CPA THB","WoW FTI","Fatigue signal"].map((h)=>`<th class="text-left px-2 py-1 border-b border-slate-700">${h}</th>`).join("")}</tr>`;
    const mRows = tabs.raw_meta_daily.map((r) => {
      const sig = String(r.funnel).toUpperCase() === "TOF" ? fatigueTOF(r) : fatigueBOF(r);
      return `<tr>${td(r.campaign)}${td(r.market)}${td(`฿${ZaapiDataService.toNumber(r.spend_thb).toLocaleString()}`)}${td(ZaapiDataService.toNumber(r.impressions).toLocaleString())}${td(r.fti)}${td(`฿${ZaapiDataService.toNumber(r.cpa_thb).toLocaleString()}`)}${td(r.wow_fti)}${td(sig)}</tr>`;
    }).join("");
    document.getElementById("meta-table").innerHTML = mHead + mRows;

    const top = tabs.action_log.filter((r) => /search|meta/i.test(r.scope || "")).slice(0, 2);
    document.getElementById("suggestions").innerHTML = top.length ? top.map((r) => `• ${r.suggestion}`).join("<br>") : "No suggestions.";

    loading.classList.add("hidden");
    content.classList.remove("hidden");
  } catch (error) {
    loading.textContent = `Failed to load Google Sheets data: ${error.message}`;
  }
}

document.addEventListener("DOMContentLoaded", initSearch);
