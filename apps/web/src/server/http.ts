export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

export const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => json({ error, ...extra }, status);

// ---- body reading with a hard size cap ----
export async function readJson(req: Request, maxBytes: number): Promise<{ ok: true; body: unknown } | { ok: false; res: Response }> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().startsWith("application/json")) return { ok: false, res: fail(415, "send application/json") };
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return { ok: false, res: fail(413, "body too large") };
  const text = await req.text();
  if (Buffer.byteLength(text) > maxBytes) return { ok: false, res: fail(413, "body too large") };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, res: fail(400, "invalid JSON") };
  }
}

// ---- simple in-memory rate limit (one server; Redis or the platform replaces it when deployed) ----
const buckets = new Map<string, { n: number; reset: number }>();
export function rateLimited(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || b.reset <= now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
    return false;
  }
  b.n += 1;
  return b.n > limit;
}
export const resetRateLimits = () => buckets.clear();

export const clientIp = (req: Request) => (req.headers.get("x-forwarded-for") ?? "local").split(",")[0]!.trim();

// ---- CSRF for cookie routes: same-origin only (plus SameSite=Lax cookie and JSON-only bodies) ----
export function crossSite(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host !== (req.headers.get("host") ?? new URL(req.url).host);
    } catch {
      return true;
    }
  }
  return req.headers.get("sec-fetch-site") === "cross-site";
}
