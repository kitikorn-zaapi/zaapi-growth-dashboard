# Zaapi Growth Dashboard

Multi-page dark-mode dashboard that reads live data from Google Sheets (published CSV tabs), with no local `data.json` dependency.

## Data source
- Google Sheet ID: `1o9WPWpJtaHAQB6dB1tfsQJtKIuk1ea38-jQuJIOPLa8`
- CSV pattern: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet={TAB_NAME}`

## Pages
- `index.html` — Overview (Layer 1)
- `search.html` — Campaign Layer (Layer 2)
- `meta-asset.html` — Asset Layer (Layer 3)
- `action-log.html` — Actions + Outcomes
- `learning-accum.html` — Accumulated Learning

## Shared scripts
- `data-service.js` handles CSV fetch + parse + in-memory cache for session.
- `shared-nav.js` renders common nav + active state.
