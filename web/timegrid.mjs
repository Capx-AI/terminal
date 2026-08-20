/** Age-based heatmap / chart buckets. New tokens do not get 180 empty days. */

const HOUR = 3600_000;
const DAY = 24 * HOUR;

export function heatmapSpec(ageMs) {
  const days = Math.max(0, ageMs) / DAY;
  if (days <= 2) {
    return {
      kind: "1h",
      bucketMs: HOUR,
      codexResolution: "60",
      sparkResolution: "60",
      label: "1h",
      cols: 24,
      layout: "hours",
    };
  }
  if (days <= 8) {
    return {
      kind: "4h",
      bucketMs: 4 * HOUR,
      codexResolution: "240",
      sparkResolution: "240",
      label: "4h",
      cols: 6,
      layout: "blocks",
    };
  }
  if (days <= 32) {
    return {
      kind: "1d",
      bucketMs: DAY,
      codexResolution: "1D",
      sparkResolution: "1D",
      label: "1d",
      cols: 7,
      layout: "weeks",
      maxBuckets: 32,
    };
  }
  return {
    kind: "1d",
    bucketMs: DAY,
    codexResolution: "1D",
    sparkResolution: "1D",
    label: "1d",
    cols: 7,
    layout: "weeks",
    maxBuckets: 180,
  };
}

function parseMs(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  const t = Date.parse(String(value));
  return isFinite(t) ? t : null;
}

function utcDayKey(ms) {
  const d = new Date(ms);
  if (!isFinite(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function floorTo(ms, bucketMs) {
  return Math.floor(ms / bucketMs) * bucketMs;
}

function isoOf(ms, kind) {
  const d = new Date(ms);
  if (kind === "1d") return d.toISOString().slice(0, 10);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function labelOf(ms, kind) {
  const d = new Date(ms);
  const mon = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (kind === "1d") return mon;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  return `${mon} ${hh}:00 UTC`;
}

export function projectStartMs(token, casa, now = Date.now()) {
  const candidates = [];
  if (token) {
    candidates.push(parseMs(token.fundingFinalizedAt));
    const deadline = parseMs(token.fundraisingDeadlineAt);
    if (deadline) candidates.push(deadline - 4 * HOUR);
  }
  if (casa && casa.binding) candidates.push(parseMs(casa.binding.bound_at));
  const cal = casa && casa.calendar && Array.isArray(casa.calendar.days) ? casa.calendar.days : [];
  for (const day of cal) {
    if (!day) continue;
    if (day.events || day.attestation || day.decision) {
      candidates.push(parseMs(day.date + (String(day.date).length <= 10 ? "T00:00:00Z" : "")));
      break;
    }
  }
  const ledger = casa && casa.ledger && Array.isArray(casa.ledger.shown) ? casa.ledger.shown : [];
  for (const row of ledger) candidates.push(parseMs(row && row.ts));
  const chain = casa && Array.isArray(casa.chain_history) ? casa.chain_history : [];
  for (const row of chain) candidates.push(parseMs(row && row.observed_at));
  if (casa && casa.attestation) candidates.push(parseMs(casa.attestation.observed_at));
  if (casa && casa.company) candidates.push(parseMs(casa.company.created_at));

  const valid = candidates.filter((t) => t != null && t <= now + HOUR && t > now - 5 * 365 * DAY);
  if (!valid.length) return now - 180 * DAY;
  return Math.min(...valid);
}

function bucketIndex(start, bucketMs, ms, len) {
  const i = Math.floor((ms - start) / bucketMs);
  if (i < 0 || i >= len) return -1;
  return i;
}

export function buildHeatmap(token, casa, now = Date.now()) {
  const startRaw = projectStartMs(token, casa, now);
  let spec = heatmapSpec(now - startRaw);
  let start = floorTo(startRaw, spec.bucketMs);
  if (spec.maxBuckets) {
    const minStart = floorTo(now, spec.bucketMs) - (spec.maxBuckets - 1) * spec.bucketMs;
    if (start < minStart) start = minStart;
  }
  spec = heatmapSpec(now - start);
  start = floorTo(Math.min(start, now), spec.bucketMs);

  const buckets = [];
  for (let t = start; t <= now; t += spec.bucketMs) {
    buckets.push({
      t,
      iso: isoOf(t, spec.kind),
      date: isoOf(t, spec.kind),
      label: labelOf(t, spec.kind),
      events: 0,
      attestation: false,
      decision: false,
    });
    if (spec.maxBuckets && buckets.length >= spec.maxBuckets) break;
  }
  if (!buckets.length) {
    buckets.push({
      t: start,
      iso: isoOf(start, spec.kind),
      date: isoOf(start, spec.kind),
      label: labelOf(start, spec.kind),
      events: 0,
      attestation: false,
      decision: false,
    });
  }

  const n = buckets.length;
  const idx = (ms) => bucketIndex(start, spec.bucketMs, ms, n);
  const daysWithLedger = new Set();

  const ledger = casa && casa.ledger && Array.isArray(casa.ledger.shown) ? casa.ledger.shown : [];
  for (const row of ledger) {
    const ms = parseMs(row && row.ts);
    const i = ms == null ? -1 : idx(ms);
    if (i < 0) continue;
    buckets[i].events += 1;
    daysWithLedger.add(utcDayKey(ms));
  }

  const cal = casa && casa.calendar && Array.isArray(casa.calendar.days) ? casa.calendar.days : [];
  for (const day of cal) {
    if (!day || !day.date) continue;
    const dayMs = parseMs(String(day.date).length <= 10 ? `${day.date}T00:00:00Z` : day.date);
    if (dayMs == null) continue;
    const key = utcDayKey(dayMs);
    if (spec.kind === "1d") {
      const i = idx(dayMs);
      if (i < 0) continue;
      if (typeof day.events === "number") buckets[i].events = Math.max(buckets[i].events, day.events);
      if (day.attestation) buckets[i].attestation = true;
      if (day.decision) buckets[i].decision = true;
      continue;
    }
    if (typeof day.events === "number" && day.events > 0 && !daysWithLedger.has(key)) {
      const noon = Date.parse(`${key}T12:00:00Z`);
      const i = idx(isFinite(noon) ? noon : dayMs);
      if (i >= 0) buckets[i].events += day.events;
    }
    if (day.attestation) {
      const noon = Date.parse(`${key}T12:00:00Z`);
      const i = idx(isFinite(noon) ? noon : dayMs);
      if (i >= 0) buckets[i].attestation = true;
    }
    if (day.decision) {
      const noon = Date.parse(`${key}T12:00:00Z`);
      const i = idx(isFinite(noon) ? noon : dayMs);
      if (i >= 0) buckets[i].decision = true;
    }
  }

  const chain = casa && Array.isArray(casa.chain_history) ? casa.chain_history : [];
  for (const row of chain) {
    const i = idx(parseMs(row && row.observed_at));
    if (i >= 0) buckets[i].attestation = true;
  }
  if (casa && casa.attestation) {
    const i = idx(parseMs(casa.attestation.observed_at));
    if (i >= 0) buckets[i].attestation = true;
  }
  const decisions = casa && casa.decisions && Array.isArray(casa.decisions.items) ? casa.decisions.items : [];
  for (const row of decisions) {
    const i = idx(parseMs(row && row.ts));
    if (i >= 0) buckets[i].decision = true;
  }

  let lastCovered = -1;
  for (let i = 0; i < n; i++) if (buckets[i].attestation) lastCovered = i;
  if (casa && casa.attestation && typeof casa.attestation.hours_since === "number") {
    const coveredUntil = now - casa.attestation.hours_since * HOUR;
    const i = idx(coveredUntil);
    if (i > lastCovered) lastCovered = i;
  }
  if (casa && casa.attestation && casa.attestation.freshness === "unobserved") {
    lastCovered = lastCovered;
  }

  return {
    spec,
    start: new Date(start).toISOString(),
    ageHours: Math.round(((now - startRaw) / HOUR) * 10) / 10,
    lastCovered,
    buckets,
  };
}
