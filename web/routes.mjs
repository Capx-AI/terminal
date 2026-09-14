import { isMint } from "./join.mjs";
import { isValidSlug } from "./company.mjs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const RESERVED = new Set(["api", "register", "health", "t", "c", "vendor", "brand", "tools", "test"]);
const VIEWS = new Set(["architecture", "flow", "data-model", "roadmap", "plan", "agents", "activity", "attestation"]);

// Validate before URL parsing, which otherwise normalizes away traversal.
export function safePath(raw) {
  try {
    const path = decodeURIComponent(raw.split("?")[0]);
    return path.startsWith("/") && !/[\\%\x00-\x20\x7f?#]/.test(path) && !path.includes("..");
  } catch { return false; }
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
