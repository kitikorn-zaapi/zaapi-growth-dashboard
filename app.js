let trendChart;

function healthEmoji(v) {
  const s = String(v || "").toLowerCase();
  if (s.includes("red") || s.includes("bad")) return "🔴";
  if (s.includes("yellow") || s.includes("watch")) return "🟡";
  return "🟢";
}

function linRegPredict(last4) {
  const n = last4.length;
  if (!n) return 0;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    const x = i + 1;
    const y = last4[i];
    sx += x; sy += y; sxy += x * y; sxx += x * x;
  }
  const m = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
  const b = (sy - m * sx) / n;
  return m * (n + 1) + b;
}

function fmtMoney(thb, currency, rate) {
  const n = ZaapiDataService.toNumber(thb);
  if (currency === "USD") return `$${(n / rate).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `฿${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function renderTrend(rows) {
  const last8 = rows.slice(-8);
  const fti = last8.map((r) => ZaapiDataService.toNumber(r.fti));
  const pred = linRegPredict(fti.slice(-4));
  const labels = last8.map((r) => ZaapiDataService.fmtCW(r.cw)).concat("Next");
  const data = fti.concat(pred);

  const dirUp = pred >= fti[fti.length - 1];
  document.getElementById("trend-label").textContent = `${dirUp ? "📈 Trending up" : "📉 Trending down"} — est. ${Math.round(pred)} FTI next week`;

  if (trendChart) trendChart.destroy();
  trendChart = new Chart(document.getElementById("fti-trend"), {
    type: "line",
    data: { labels, datasets: [{ data, borderColor: "#38bdf8", tension: 0.3, pointRadius: 2 }] },
    options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#cbd5e1" } }, y: { ticks: { color: "#cbd5e1" } } } }
  });
}

function marketCard(title, row, currency, rate, children = []) {
  const wow = ZaapiDataService.toNumber(row.wow_delta);
  const wowText = `${wow >= 0 ? "+" : ""}${wow.toFixed(1)}%`;
  return `<article class="bg-slate-900 border border-slate-800 rounded p-3">
    <h3 class="font-semibold mb-2">${title}</h3>
    <div class="text-sm space-y-1">
      <div>Spend: <b>${fmtMoney(row.spend_thb, currency, rate)}</b></div>
      <div>FTI: <b>${ZaapiDataService.toNumber(row.fti)}</b></div>
      <div>WoW delta: <b>${wowText}</b></div>
      <div>Health: <b>${healthEmoji(row.health_signal)} ${row.health_signal || ""}</b></div>
      ${children.join("")}
    </div>
  </article>`;
}

async function initOverview() {
  const loading = document.getElementById("loading");
  const content = document.getElementById("content");

  try {
    const tabs = await ZaapiDataService.fetchTabs(["weekly_summary", "action_log", "targets", "config"]);
    const config = await ZaapiDataService.fetchConfig();
    const rate = ZaapiDataService.toNumber(config.usd_thb_rate, 34);

    const weeks = [...new Set(tabs.weekly_summary.map((r) => ZaapiDataService.fmtCW(r.cw)))];
    const weekSelect = document.getElementById("week-select");
    weekSelect.innerHTML = weeks.map((w) => `<option>${w}</option>`).join("");
    weekSelect.value = weeks[weeks.length - 1] || "";

    const render = () => {
      const cw = weekSelect.value;
      const currency = document.getElementById("currency-toggle").value;
      const current = tabs.weekly_summary.find((r) => ZaapiDataService.fmtCW(r.cw) === cw) || {};
      document.getElementById("ai-summary").textContent = current.ai_summary || "No summary available.";
      document.getElementById("global-health").textContent = `${healthEmoji(current.health_signal)} ${current.health_signal || ""}`;

      const targetRow = tabs.targets.find((r) => ZaapiDataService.fmtCW(r.cw) === cw) || {};
      document.getElementById("fti-target").textContent = `${ZaapiDataService.toNumber(current.fti_actual)} / ${ZaapiDataService.toNumber(targetRow.fti_target)} FTI`;

      renderTrend(tabs.weekly_summary);

      const top = (market) => tabs.weekly_summary.find((r) => ZaapiDataService.fmtCW(r.cw) === cw && String(r.market).toUpperCase() === market) || {};
      const seaSubs = ["MY", "SG", "PH"].map((m) => {
        const r = top(m);
        return `<div class="pl-3 text-slate-300">• ${m}: ${ZaapiDataService.toNumber(r.fti)} FTI, ${fmtMoney(r.spend_thb, currency, rate)}</div>`;
      });
      const rowSubs = ["UK", "US"].map((m) => {
        const r = top(m);
        return `<div class="pl-3 text-slate-300">• ${m}: ${ZaapiDataService.toNumber(r.fti)} FTI, ${fmtMoney(r.spend_thb, currency, rate)}</div>`;
      });

      document.getElementById("market-grid").innerHTML = [
        marketCard("TH", top("TH"), currency, rate),
        marketCard("SEA", top("SEA"), currency, rate, seaSubs),
        marketCard("ROW", top("ROW"), currency, rate, rowSubs)
      ].join("");

      const realloc = tabs.action_log.find((r) => ZaapiDataService.fmtCW(r.cw) === cw && String(r.type).toLowerCase() === "reallocate");
      document.getElementById("reallocation").textContent = realloc
        ? `Move ฿${ZaapiDataService.toNumber(realloc.amount).toLocaleString()} from ${realloc.from} to ${realloc.to} — ${realloc.reason || ""}`
        : "No reallocation suggestion for this week.";

      const links = [];
      if (tabs.action_log.some((r) => ZaapiDataService.fmtCW(r.cw) === cw && /search|meta campaign/i.test(r.scope || ""))) links.push('<a class="underline" href="search.html">Search page</a>');
      if (tabs.action_log.some((r) => ZaapiDataService.fmtCW(r.cw) === cw && /asset|creative/i.test(r.scope || ""))) links.push('<a class="underline" href="meta-asset.html">Meta Asset page</a>');
      links.push('<a class="underline" href="action-log.html">Action Log</a>');
      document.getElementById("look-links").innerHTML = links.join('<span class="text-slate-500">|</span>');
    };

    weekSelect.addEventListener("change", render);
    document.getElementById("currency-toggle").addEventListener("change", render);
    render();

    loading.classList.add("hidden");
    content.classList.remove("hidden");
  } catch (error) {
    loading.textContent = `Failed to load Google Sheets data: ${error.message}`;
  }
}

document.addEventListener("DOMContentLoaded", initOverview);
