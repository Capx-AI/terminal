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
