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

export async function proxyCompany(target, response, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const upstream = await fetchImpl(target, { method: "GET", redirect: "error", signal: controller.signal });
    if (!upstream.ok || !upstream.body) throw new Error("upstream unavailable");
    response.writeHead(200, {
      "content-type": upstream.headers.get("content-type") || "application/octet-stream",
      "cache-control": "public, max-age=60",
      "content-security-policy": "sandbox allow-scripts",
      "x-content-type-options": "nosniff",
    });
    await pipeline(Readable.fromWeb(upstream.body), response, { signal: controller.signal });
  } catch {
    if (!response.headersSent) response.writeHead(404).end("not found");
    else response.destroy();
  } finally { clearTimeout(timer); }
}
