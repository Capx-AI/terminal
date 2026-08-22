/** Full Casa terminal-surface documents. No ledger.note, no spend, no claims object. */

const LEVEL_NAMES = [
  "Ideation and Validation",
  "Commit and incorporate",
  "Product and infra foundation",
  "Build and pre-launch",
  "Launch",
  "First customers and PMF",
  "Scale acquisition",
  "Enterprise sales",
  "Growth finance and fundraise",
];

function hex64(seed) {
  let out = "";
  let x = seed >>> 0;
  while (out.length < 64) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    out += x.toString(16).padStart(8, "0");
  }
  return out.slice(0, 64);
}

function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function utcDate(daysAgo) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function isoDaysAgo(daysAgo, hour = 12) {
  const d = new Date();
  d.setUTCHours(hour, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString();
}

function calendar180({ seed, attestedThroughAgo = 0, density = 0.55, pushEvery = 7 }) {
  const r = rng(seed);
  const days = [];
  for (let i = 179; i >= 0; i--) {
    const unattested = i < attestedThroughAgo;
    const events = unattested ? 0 : r() < density ? 1 + Math.floor(r() * 6) : 0;
    const attestation = !unattested && i % pushEvery === 0 && i <= 170;
    const decision = !unattested && events > 0 && r() < 0.08;
    days.push({
      date: utcDate(i),
      events,
      attestation,
      decision,
    });
  }
  return { plane: "reproduced", days };
}

function levels(current, done, total) {
  return LEVEL_NAMES.map((name, level) => {
    if (level < current) return { level, name, total: 12, done: 12 };
    if (level === current) {
      const t = Math.max(8, Math.round(total / 9));
      return { level, name, total: t, done: Math.min(done, t) };
    }
    return { level, name, total: 10, done: 0 };
  });
}

function emptyAttestation() {
  return {
    attested: false,
    caf_version: null,
    sequence: null,
    observed_at: null,
    health_score: null,
    freshness: "unobserved",
    hours_since: null,
    claims_digest: null,
    attestation_digest: null,
    brain_root: null,
    disclosed_root: null,
    chain_head: null,
  };
}

function attestation({ attested, health_score, freshness, sequence, hours_since }) {
  const observed = freshness === "unobserved";
  return {
    attested: observed ? false : attested,
    caf_version: observed ? null : "1.1.0",
    sequence: observed ? null : sequence,
    observed_at: observed ? null : isoDaysAgo(hours_since / 24, 15),
    health_score: observed ? null : health_score,
    freshness,
    hours_since: observed ? null : hours_since,
    claims_digest: observed ? null : hex64(11),
    attestation_digest: observed ? null : hex64(22),
    brain_root: observed ? null : hex64(33),
    disclosed_root: observed ? null : hex64(44),
    chain_head: observed ? null : hex64(55),
  };
}

function progressLive(over = {}) {
  const playbooks_total = over.playbooks_total ?? 105;
  const playbooks_done = over.playbooks_done ?? 72;
  return {
    plane: "claimed",
    level: over.level ?? 5,
    level_name: over.level_name ?? LEVEL_NAMES[over.level ?? 5],
    levels: levels(over.level ?? 5, playbooks_done, playbooks_total),
    playbooks_total,
    playbooks_done,
    playbooks_ready: over.playbooks_ready ?? 15,
    playbooks_blocked: over.playbooks_blocked ?? 18,
    critical_remaining: over.critical_remaining ?? 8,
    done_nodes: [
      { node_id: "opportunity-scan", title: "Opportunity Scan", has_rubric: true, department: "Strategy" },
      { node_id: "problem-validation-interviews", title: "Problem Validation Interviews", has_rubric: true, department: "Strategy" },
      { node_id: "mvp-scoping", title: "MVP Scoping", has_rubric: true, department: "Product" },
    ],
    ready_nodes: [
      { node_id: "first-users-traction", title: "First Users Traction", department: "Growth" },
    ],
    blocked_nodes: [
      { node_id: "pricing-research", title: "Pricing Research", department: "Finance" },
    ],
    departments: ["Strategy", "Growth", "Product"],
    constraint: {
      archetype: "no_users",
      lead_departments: ["Growth", "Sales"],
      win: {
        metric_id: "paying_customers",
        label: "paying restaurants",
        current_value: 63,
        target_value: 100,
        deadline: 41,
        unit: null,
      },
      win_gap: 37,
    },
    north_star: {
      band: "retention",
      metric_id: "repeat_customers",
      label: "repeat restaurants",
      guardrails: ["forecast accuracy above 90 percent", "support load flat"],
    },
    quality: { self_score_mean: 83, self_score_n: 53, gaps_open: 2 },
    work: {
      tasks_7d: over.tasks_7d ?? 42,
      tasks_30d: over.tasks_30d ?? 180,
      tasks_total: over.tasks_total ?? 900,
      tasks_window: 12,
      artifacts_total: over.artifacts_total ?? 72,
      rubric_pins: over.rubric_pins ?? 40,
      in_flight: over.in_flight ?? 3,
    },
    driver_harness: { name: "claude-code", version: "1.0.0" },
    last_session_at: isoDaysAgo((over.hours_since ?? 6) / 24, 15),
  };
}

function reproducedLive(over = {}) {
  return {
    plane: "reproduced",
    chain_intact: over.chain_intact ?? true,
    signature_valid: over.signature_valid ?? true,
    tier0: over.tier0 ?? true,
    tier1: over.tier1 ?? true,
    tier2_ran: over.tier2_ran ?? true,
    coverage_bp: over.coverage_bp ?? 8471,
    catalog_matches: over.catalog_matches ?? true,
    violations: over.violations ?? { dag: 0, dataflow: 0, level: 0, other: 0 },
    streak: over.streak ?? 3,
    median_gap_days: over.median_gap_days ?? 2,
  };
}

function ledgerShown() {
  const items = [
    { kind: "playbook", status: "done", node_id: "opportunity-scan", title: "Opportunity Scan", department: "Strategy", committed: true, has_rubric: true },
    { kind: "playbook", status: "done", node_id: "mvp-scoping", title: "MVP Scoping", department: "Product", committed: true, has_rubric: true },
    { kind: "task", status: "done", node_id: null, title: "Weekly ledger digest", department: "Operations", committed: true, has_rubric: false },
    { kind: "playbook", status: "done", node_id: "problem-validation-interviews", title: "Problem Validation Interviews", department: "Strategy", committed: true, has_rubric: true },
    { kind: "decision", status: "done", node_id: null, title: "Paused paid acquisition until activation clears", department: "Growth", committed: false, has_rubric: false },
  ];
  return {
    plane: "claimed",
    window_events: 12,
    shown: items.map((row, i) => ({
      ts: isoDaysAgo(i + 1, 14),
      ...row,
    })),
  };
}

function envelope() {
  return {
    plane: "reproduced",
    subject: {
      company_pubkey: "dGVzdC1saXZlLXByb2ctcHVia2V5LTEyMzQ",
      driver_harness: { name: "claude-code", version: "1.0.0" },
      brain_schema_version: "1.1.0",
      playbook_index_sha256: hex64(99),
    },
    window: {
      from_ts: isoDaysAgo(7, 0),
      to_ts: isoDaysAgo(0, 15),
    },
    roots: {
      brain_root: hex64(33),
      disclosed_root: hex64(44),
    },
    signature_present: true,
  };
}

function chainHistory(sequence, hoursSince) {
  const items = [];
  for (let i = 0; i < Math.min(12, sequence + 1); i++) {
    const seq = sequence - i;
    items.push({
      sequence: seq,
      observed_at: isoDaysAgo(hoursSince / 24 + i * 2, 15),
      attested: true,
      event_count: 8 + (i % 5),
    });
  }
  return items;
}

function extras() {
  return {
    decisions: {
      plane: "claimed",
      items: [
        { ts: isoDaysAgo(4, 16), text: "Moved onboarding from email to in-product checklist", department: "Product" },
        { ts: isoDaysAgo(11, 11), text: "Paused paid acquisition until activation clears", department: "Growth" },
      ],
    },
    departments_30d: {
      plane: "claimed",
      items: [
        { department: "Growth", events: 22 },
        { department: "Strategy", events: 18 },
        { department: "Product", events: 14 },
        { department: "Engineering", events: 9 },
        { department: "Finance", events: 3 },
      ],
    },
    next: [
      { node_id: "first-users-traction", title: "First Users Traction", department: "Growth" },
      { node_id: "onboarding-flow-design", title: "Onboarding Flow Design", department: "Product" },
    ],
    waiting: [
      { node_id: "entity-formation", title: "Entity Formation", reason: "founder signature", department: "Legal" },
    ],
    loops: [
      { id: "weekly-retro", title: "Weekly retro", last_run: utcDate(3), cadence_days: 7 },
    ],
    catalog: { sha: hex64(99), matches: true, size: 169 },
    pay: { plane: "reproduced", pay_attested: false },
  };
}

function company(pubkey, slug, name, extra = {}) {
  return {
    pubkey,
    slug,
    name,
    created_at: extra.created_at ?? "2026-01-19T00:00:00.000Z",
    one_liner: extra.one_liner ?? "Forecast weekly orders for independent restaurants so they stop over-ordering perishables.",
    primary_type: extra.primary_type ?? "saas",
  };
}

function binding(status, extra = {}) {
  return {
    status,
    bound_at: extra.bound_at ?? "2026-08-18T12:00:00Z",
    released_at: extra.released_at ?? null,
    rebind_count: extra.rebind_count ?? 0,
    continuity_break: extra.continuity_break ?? false,
    previous_pubkeys: extra.previous_pubkeys ?? [],
  };
}

export const MINTS = {
  live: "FixLiveProg111111111111111111capx",
  none: "FixLiveNone111111111111111111capx",
  released: "FixRefunded111111111111111111capx",
  rebind: "FixRebind11111111111111111111capx",
  aging: "FixAging111111111111111111111capx",
};

export function liveDocument() {
  const hours_since = 6.2;
  return {
    mint: MINTS.live,
    company: company("dGVzdC1saXZlLXByb2ctcHVia2V5LTEyMzQ", "fixture-live", "Fixture Live"),
    creator_wallet: "CapxTermFixCreator1111111111111111111111",
    binding: binding("live"),
    attestation: attestation({
      attested: true,
      health_score: 78,
      freshness: "fresh",
      sequence: 47,
      hours_since,
    }),
    reproduced: reproducedLive(),
    progress: progressLive({ hours_since }),
    calendar: calendar180({ seed: 7, attestedThroughAgo: 0, density: 0.6, pushEvery: 6 }),
    ledger: ledgerShown(),
    envelope: envelope(),
    chain_history: chainHistory(47, hours_since),
    ...extras(),
  };
}

export function unobservedDocument() {
  const cal = calendar180({ seed: 1, attestedThroughAgo: 180, density: 0 });
  cal.days = cal.days.map((d) => ({ ...d, events: 0, attestation: false, decision: false }));
  // Keep this E2E fixture inside the <= 2 day hourly-heatmap window. A fixed
  // launch timestamp makes the full release gate start failing as wall time
  // advances even though the production age-selection behavior is unchanged.
  const startedAt = isoDaysAgo(1, 18);
  return {
    mint: MINTS.none,
    company: company(
      "dGVzdC1saXZlLW5vbmUtcHVia2V5LTEyMz",
      "fixture-none",
      "Fixture Unobserved",
      { one_liner: "Bound, never pushed.", created_at: startedAt },
    ),
    creator_wallet: "CapxTermFixCreator1111111111111111111111",
    binding: binding("live", { bound_at: startedAt }),
    attestation: emptyAttestation(),
    reproduced: {
      plane: "reproduced",
      chain_intact: null,
      signature_valid: null,
      tier0: null,
      tier1: null,
      tier2_ran: false,
      coverage_bp: null,
      catalog_matches: null,
      violations: { dag: 0, dataflow: 0, level: 0, other: 0 },
      streak: 0,
      median_gap_days: null,
    },
    progress: null,
    calendar: cal,
    ledger: { plane: "claimed", window_events: 0, shown: [] },
    envelope: { plane: "reproduced", subject: {}, window: {}, roots: {}, signature_present: false },
    decisions: { plane: "claimed", items: [] },
    departments_30d: { plane: "claimed", items: [] },
    next: [],
    waiting: [],
    loops: [],
    chain_history: [],
    catalog: { sha: null, matches: false, size: 169 },
    pay: { plane: "reproduced", pay_attested: false },
  };
}

export function releasedDocument() {
  const hours_since = 192;
  return {
    mint: MINTS.released,
    company: company(
      "dGVzdC1yZWxlYXNlZC1wdWJrZXktMTIz",
      "fixture-released",
      "Fixture Released",
      { one_liner: "Casa was connected. This launch ended." },
    ),
    creator_wallet: "CapxTermFixCreator1111111111111111111111",
    binding: binding("released", {
      bound_at: "2026-08-17T12:00:00Z",
      released_at: "2026-08-19T14:00:00Z",
    }),
    attestation: attestation({
      attested: true,
      health_score: 22,
      freshness: "stale",
      sequence: 2,
      hours_since,
    }),
    reproduced: reproducedLive({ coverage_bp: 4100, streak: 0, median_gap_days: 11 }),
    progress: progressLive({
      level: 2,
      playbooks_done: 6,
      playbooks_total: 42,
      tasks_7d: 0,
      hours_since,
    }),
    calendar: calendar180({ seed: 3, attestedThroughAgo: 8, density: 0.3, pushEvery: 10 }),
    ledger: ledgerShown(),
    envelope: envelope(),
    chain_history: chainHistory(2, hours_since),
    ...extras(),
  };
}

export function rebindDocument() {
  const hours_since = 8;
  return {
    mint: MINTS.rebind,
    company: company("dGVzdC1yZWJpbmQtbGl2ZS1wdWJrZXkx", "fixture-rebind", "Fixture Rebind"),
    creator_wallet: "CapxTermFixCreator1111111111111111111111",
    binding: binding("live", {
      rebind_count: 1,
      continuity_break: true,
      previous_pubkeys: ["dGVzdC1vbGQta2V5LXByZXZpb3VzLTEy"],
    }),
    attestation: attestation({
      attested: true,
      health_score: 55,
      freshness: "fresh",
      sequence: 0,
      hours_since,
    }),
    reproduced: reproducedLive({ coverage_bp: 6200, streak: 1, median_gap_days: 0 }),
    progress: progressLive({
      level: 1,
      playbooks_done: 3,
      playbooks_total: 42,
      tasks_7d: 9,
      hours_since,
    }),
    calendar: calendar180({ seed: 11, attestedThroughAgo: 0, density: 0.35, pushEvery: 8 }),
    ledger: ledgerShown(),
    envelope: envelope(),
    chain_history: chainHistory(0, hours_since),
    ...extras(),
  };
}

export function agingDocument() {
  const hours_since = 72;
  return {
    mint: MINTS.aging,
    company: company("dGVzdC1hZ2luZy1wdWJrZXktMTIzNDU2", "fixture-aging", "Fixture Aging"),
    creator_wallet: "CapxTermFixCreator1111111111111111111111",
    binding: binding("live"),
    attestation: attestation({
      attested: true,
      health_score: 41,
      freshness: "aging",
      sequence: 5,
      hours_since,
    }),
    reproduced: reproducedLive({ coverage_bp: 5400, streak: 1, median_gap_days: 4 }),
    progress: progressLive({
      level: 2,
      playbooks_done: 4,
      playbooks_total: 42,
      tasks_7d: 4,
      hours_since,
    }),
    calendar: calendar180({ seed: 19, attestedThroughAgo: 3, density: 0.4, pushEvery: 7 }),
    ledger: ledgerShown(),
    envelope: envelope(),
    chain_history: chainHistory(5, hours_since),
    ...extras(),
  };
}

export const FIXTURES = {
  [MINTS.live]: liveDocument(),
  [MINTS.none]: unobservedDocument(),
  [MINTS.released]: releasedDocument(),
  [MINTS.rebind]: rebindDocument(),
  [MINTS.aging]: agingDocument(),
};
