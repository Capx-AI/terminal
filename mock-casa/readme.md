# mock-casa

Local fixture server for `GET /v1/tokens/{mint}` while `casa.capx.ai` and
`:8787` are not the Terminal origin.

```bash
node mock-casa/server.mjs
```

Binds `127.0.0.1:4201`. Documents follow the Casa **terminal surface**
(`docs/TERMINAL-AGENT-SURFACE.md`): calendar 180 UTC days, redacted ledger
(no `note`), claimed north star / win, reproduced coverage and checks.

| Mint | HTTP |
|---|---|
| `FixLiveProg111111111111111111capx` | 200 live + progress |
| `FixLiveNone111111111111111111capx` | 200 live, unobserved |
| `FixRefunded111111111111111111capx` | 200 released |
| `FixRebind11111111111111111111capx` | 200 live, continuity_break |
| `FixAging111111111111111111111capx` | 200 live, aging |
| any other well-formed `*capx` mint | 404 TOKEN_NOT_BOUND |
| invalid mint | 400 INVALID_MINT |

Live Launchpad mints such as XY 404 on purpose. Connect Casa is not built.

## Log

- **2026-08-20** — Fixture server created per TERMINAL-V1-CONTRACT.md section 7.
