async function renderSharedNav() {
  const pages = [
    { href: 'index.html', label: 'Overview' },
    { href: 'search.html', label: 'Search' },
    { href: 'meta-asset.html', label: 'Meta Asset' },
    { href: 'action-log.html', label: 'Action Log' },
    { href: 'learning-accum.html', label: 'Learning' }
  ];

  const path = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const nav = document.getElementById('shared-nav');
  if (!nav) return;

  let latestCW = '—';
  try {
    const rows = await ZaapiDataService.fetchTab('weekly_summary');
    latestCW = ZaapiDataService.fmtCW(ZaapiDataService.pick(rows[rows.length - 1] || {}, ['CW', 'cw'], '—'));
  } catch (error) {
    latestCW = '—';
  }

  nav.innerHTML = pages
    .map((p) => {
      const active = p.href.toLowerCase() === path;
      return `<a href="${p.href}" class="px-3 py-2 rounded border text-xs font-semibold ${active ? 'bg-slate-100 text-slate-950 border-slate-100' : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'}">${p.label}</a>`;
    })
    .join('') + `<span class="px-3 py-2 rounded border border-slate-700 text-xs text-slate-300">Latest ${latestCW}</span>`;
}

document.addEventListener('DOMContentLoaded', renderSharedNav);
