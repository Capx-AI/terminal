# web/ - Capx Terminal product

Demo-derived public market. Serves on `http://127.0.0.1:4200/`.

```bash
SAMPLE=1 CASA_API=http://127.0.0.1:4201 CODEX_API_KEY=... node web/server.mjs
```

`CODEX_API_KEY` is the Codex (defined.fi) GraphQL key. Never commit it.
The browser never calls Codex. Price buckets follow project age (1h / 4h / 1d), same as the heatmap.

Browser talks only to this process. This process GETs Launchpad
(`https://api.launchpad.capx.ai`) and Casa (`CASA_API`). Casa responses cache
300 seconds.

Visual source: `~/Documents/july/capx/capx-terminal-demo/` (`app.css` copied
intact). `v1.css` only covers missing-tile layout.

## Log

- **2026-08-20** - Folder created. CSS, logo, favicons copied from the demo.
  Server proxies Launchpad + Casa. Pages consume `/api/market` and `/api/tokens/:mint`.
  Localhost: `SAMPLE=1` on :4200, mock Casa on :4201.
- **2026-08-20 (surface)** - Token bento and market Casa columns read the
  terminal-surface GET (calendar, ledger, reproduced, claimed north star).
- **2026-08-21** - CT-02 adversarial composite goldens. `web/test/` loads
  shared passing and rejecting fixtures from
  `ORCHESTRATOR/casa-terminal-plan-01/contracts` over the relative path.
  Token-later pair keeps company_id, slug, and canonical_url. TR-01 joins
  Casa `GET /v1/companies` with Launchpad tokens into typed `rows[]` and
  keeps `tokens[]` for existing clients. Directory assembly does not
  per-mint `GET /v1/tokens/{mint}` or use the 5-minute Casa cache.
  TR-02 adds company+token / company-only / token-only chips, search
  across both sources, and dash/null market columns on tokenless rows.
  TR-03 adds `/register` and `POST /api/register`, a no-store proxy to
  Casa `POST /v1/companies/redeem`. Success drops the companies snapshot
  and redirects to `/c/{slug}`.
  TR-04 adds `/c/{slug}` and `GET /api/companies/{slug}`. Casa progress
  and health, sandboxed website/one-pager/deck previews, full-site links
  on `{slug}.casa.capx.ai`. Market chart only when a joined token exists.
  Token-later keeps the same company URL. `/t/{mint}` links to `/c/{slug}`
  when a public company is joined.
  TR-05: Casa or Launchpad outage is partial on `/api/market`. Broken
  iframe previews fall back to copy plus the full-site link. Keyboard
  labels, skip links, and Vercel `includeFiles` cover register and
  `/c/{slug}`.
- **2026-08-22 (IN-02)** - Vercel `includeFiles` in `web/vercel.json` is
  the Terminal static-asset fingerprint (html, css, js, favicons,
  brand). Names in that glob are the packaged set. Do not restyle the
  glob. Hashes of those files are release evidence; no secret values.
