# Terminal perimeter configuration

`edge-waf.json` is the final CloudFront viewer-IP policy. `vercel-origin-template.json` requires the distribution origin credential; render its placeholders only in memory from Secrets Manager `capx-terminal/prod/origin-auth` in us-east-1. Never commit a rendered template or CloudFront configuration containing its header value. Vercel PUT applies immediately.

- 2026-11-07: Prepared pinned managed-rule groups, measured API/all-viewer rate ceilings and origin authentication. No application code or custody change. See the workspace security-audit-2026-11-06/R2-TERMINAL-RELEASE.md for staged activation, evidence and rollback. Source templates contain no credential.

- 2026-11-07: Policies activated: CloudFront Deployed, Vercel origin rule version 1, all 20 direct/public checks pass with redirects inspected explicitly. Generated URLs retain Vercel Authentication; stable origin denies missing/wrong credential. Managed signatures block on both viewer hosts. Static HEAD canary produced two proven 429 responses and was removed; normal traffic remains healthy. Ten-minute observation underway.
