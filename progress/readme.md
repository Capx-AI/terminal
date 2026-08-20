# Terminal operator board

Localhost progress board in the same format as Launchpad `:4188` and Casa `:4174`.
Dark operator CSS, calibrated clocks, now/blocked panels, estimate vs actual log.

Source of truth is `progress.json`. Serve with:

```bash
node progress/server.mjs
```

Default URL: `http://127.0.0.1:4199/`. Binds 127.0.0.1. `Cache-Control: no-store`. Page refreshes every 30s.

Calibration uses only this Grok session's completed engineering tasks:
`calibration = sum(actual) / sum(first estimate)` over `timeLog` rows with
`kind: "engineering"`. That factor scales remaining engineering first-estimates.
Founder waits are unscaled.

The orchestrator (not child agents) updates `progress.json` on every task start
and finish. At least one item stays `in_progress` while work is happening.

## Log

- **2026-08-20** — Board created from the Casa tracker copy of the Launchpad 4188 board. Port 4199.
