import { isMint } from "./join.mjs";
import { isValidSlug } from "./company.mjs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const RESERVED = new Set(["api", "register", "health", "t", "c", "vendor", "brand", "tools", "test"]);
const VIEWS = new Set(["architecture", "flow", "data-model", "roadmap", "plan", "agents", "activity", "attestation"]);

// Validate before URL parsing, which otherwise normalizes away traversal
// and accepts a scheme-relative target ("//host") as a different origin.
export function safePath(raw) {
  try {
    if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return false;
    const path = decodeURIComponent(raw.split("?")[0]);
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("..")) return false;
    return !/[\\%\x00-\x20\x7f?#]/.test(path);
  } catch { return false; }
}

export const SECURITY_HEADERS = Object.freeze({
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
});

export function applySecurityHeaders(response) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.setHeader(name, value);
}

// The http server does not await async listeners; a rejection would crash the process.
export async function guardRequest(response, handler, log = console.error) {
  try {
    await handler();
  } catch (err) {
    log("request failed", err && err.stack ? err.stack : err);
    if (response.headersSent) {
      response.destroy();
      return;
    }
    try {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end("internal error");
    } catch { /* socket already closed */ }
  }
}

export function readCacheEntry(map, key, now, ttlMs) {
  const hit = map.get(key);
  if (!hit) return undefined;
  if (!(now - hit.at < ttlMs)) {
    map.delete(key);
    return undefined;
  }
  map.delete(key);
  map.set(key, hit);
  return hit.value;
}

export function writeCacheEntry(map, key, value, now, ttlMs, max) {
  for (const [k, hit] of [...map]) {
    if (!hit || !(now - hit.at < ttlMs)) map.delete(k);
  }
  if (map.has(key)) map.delete(key);
  map.set(key, { at: now, value });
  const limit = Number.isFinite(max) && max >= 1 ? Math.floor(max) : 1;
  while (map.size > limit) map.delete(map.keys().next().value);
}

export function companyRoute(path) {
  if (!safePath(path)) return null;
  const parts = path.split("/").slice(1);
  if (parts.length === 2 && ((parts[0] === "t" && isMint(parts[1])) || (parts[0] === "c" && isValidSlug(parts[1]) && !RESERVED.has(parts[1])))) {
    return { redirect: "/" + parts[1] };
  }
  const [id, view] = parts;
  if (RESERVED.has(id)) return null;
  if (parts.length === 1 && (isMint(id) || isValidSlug(id))) return { id, view: "" };
  if (parts.length === 2 && isValidSlug(id) && VIEWS.has(view)) return { id, view };
  return null;
}

export function proxyTarget(method, raw) {
  if (method !== "GET" || !safePath(raw)) return null;
  const [path, query] = raw.split(/\?(.*)/s);
  const match = path.match(/^\/([^/]+)\/(site|one-pager|deck)(\/.*)?$/);
  if (!match || !isValidSlug(match[1]) || RESERVED.has(match[1])) return null;
  const suffix = match[3] || "/";
  return "https://" + match[1] + ".casa.capx.ai" + (match[2] === "site" ? "" : "/" + match[2]) + suffix + (query ? "?" + query : "");
}

const PROXY_MAX_BYTES = 5 * 1024 * 1024; // the Casa per-file cap
const SAFE_TYPE = /^(text\/|image\/|font\/|application\/(javascript|json|xml|pdf|font-woff2?|x-font|manifest\+json))/i;

export async function proxyCompany(target, response, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    let upstream = await fetchImpl(target, { method: "GET", redirect: "manual", signal: controller.signal });
    // Follow one hop only when it stays on the same company host (a site that 302s / to /index.html).
    if ([301, 302, 307, 308].includes(upstream.status)) {
      const next = new URL(upstream.headers.get("location") || "", target);
      if (next.origin !== new URL(target).origin) throw new Error("redirect off host");
      upstream = await fetchImpl(next.href, { method: "GET", redirect: "manual", signal: controller.signal });
    }
    if (!upstream.ok || !upstream.body) throw new Error("upstream unavailable");
    const declared = (upstream.headers.get("content-type") || "").split(";")[0].trim();
    let sent = 0;
    const capped = new TransformStream({ transform(chunk, ctl) { sent += chunk.byteLength; if (sent > PROXY_MAX_BYTES) { ctl.error(new Error("too large")); return; } ctl.enqueue(chunk); } });
    response.writeHead(200, {
      "content-type": SAFE_TYPE.test(declared) ? upstream.headers.get("content-type") : "application/octet-stream",
      "cache-control": "public, max-age=60",
      "content-security-policy": "sandbox allow-scripts",
      "x-content-type-options": "nosniff",
    });
    await pipeline(Readable.fromWeb(upstream.body.pipeThrough(capped)), response, { signal: controller.signal });
  } catch {
    if (!response.headersSent) response.writeHead(404).end("not found");
    else response.destroy();
  } finally { clearTimeout(timer); }
}
