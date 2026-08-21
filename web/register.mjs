/** Casa redeem mapping for POST /api/register. Terminal stores no credential. */

export const REGISTER_MESSAGES = Object.freeze({
  PUBLISH: "Company published",
  CLAIM: "Company claimed",
  CODE_EXPIRED: "Registration code is expired",
  CODE_USED: "Registration code has already been used",
  CODE_INVALID: "No such registration code",
  NOT_READY: "Company is not ready to publish",
  PRIVATE: "Company is private",
  SLUG_CONFLICT: "Slug is already used by another company",
  CASA_UNAVAILABLE: "Casa is unavailable",
});

export const REGISTER_STATUS = Object.freeze({
  CODE_EXPIRED: 410,
  CODE_USED: 409,
  CODE_INVALID: 404,
  NOT_READY: 409,
  PRIVATE: 404,
  SLUG_CONFLICT: 409,
  CASA_UNAVAILABLE: 503,
});

const SLUG_RE = /^[a-z0-9-]{1,32}$/;

export function parseRegisterBody(raw, contentType) {
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("application/x-www-form-urlencoded")) {
    return { code: new URLSearchParams(raw).get("code") };
  }
  if (!raw || !String(raw).trim()) return {};
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return { invalid: true };
    return data;
  } catch {
    return { invalid: true };
  }
}

export function codeFromBody(parsed) {
  if (!parsed || typeof parsed.code !== "string") return "";
  return parsed.code.trim();
}

export function redeemErrorResponse(error) {
  const code = REGISTER_STATUS[error] ? error : "CASA_UNAVAILABLE";
  return {
    status: REGISTER_STATUS[code],
    body: { error: code, message: REGISTER_MESSAGES[code] },
  };
}

export function redeemSuccessResponse(data) {
  const outcome = data && data.outcome;
  const slug = data && typeof data.slug === "string" ? data.slug : "";
  if ((outcome !== "PUBLISH" && outcome !== "CLAIM") || !SLUG_RE.test(slug)) {
    return redeemErrorResponse("CASA_UNAVAILABLE");
  }
  return {
    status: 200,
    body: {
      outcome,
      company_id: data.company_id ?? null,
      slug,
      canonical_url: data.canonical_url ?? null,
      visibility: data.visibility ?? null,
      published_at: data.published_at ?? null,
      redirect: `/c/${slug}`,
      message: REGISTER_MESSAGES[outcome],
    },
  };
}
