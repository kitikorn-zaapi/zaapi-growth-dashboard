// shared-nav.js — shared navigation bar across all pages
// Pulls latest CW from raw_google_daily (falls back to raw_meta_daily).

async function renderSharedNav() {
  const pages = [
    { href: 'index.html', label: 'Overview' },
    { href: 'search.html', label: 'Search' },
    { href: 'meta-asset.html', label: 'Meta Asset' },
    { href: 'action-log.html', label: 'Action Log' },
    { href: 'learning-accum.html', label: 'Learning' },
  ];

  const path = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const nav = document.getElementById('shared-nav');
  if (!nav) return;

  // Try raw_google_daily first, fall back to raw_meta_daily, then show —
  let latestCW = '—';
  try {
    let source = await ZaapiDataService.fetchTab('raw_google_daily').catch(() => []);
    if (!source.length) source = await ZaapiDataService.fetchTab('raw_meta_daily').catch(() => []);

    const cws = [...new Set(source.map(r =>
      ZaapiDataService.fmtCW(ZaapiDataService.pick(r, ['CW', 'cw']))
    ))].filter(Boolean);

    if (cws.length) {
      const sorted = cws.sort((a, b) =>
        parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10)
      );
      latestCW = sorted[sorted.length - 1];
    }
  } catch (e) {
    latestCW = '—';
  }

  nav.innerHTML = pages
    .map((p) => {
      const active = p.href.toLowerCase() === path;
      return `<a href="${p.href}" class="px-3 py-2 rounded border text-xs font-semibold ${
        active
          ? 'bg-slate-100 text-slate-950 border-slate-100'
          : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
      }">${p.label}</a>`;
    })
    .join('') +
    `<span class="px-3 py-2 rounded border border-slate-700 text-xs text-slate-300">Latest ${latestCW}</span>`;
}

document.addEventListener('DOMContentLoaded', renderSharedNav);
