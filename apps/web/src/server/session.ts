import { createHmac, timingSafeEqual } from "node:crypto";
import { isProd, sessionSecret } from "./runtime";

export const COOKIE = "grindly_session";
const MAX_AGE_S = 7 * 24 * 3600;

const sign = (payload: string) => createHmac("sha256", sessionSecret()).update(payload).digest("base64url");

export function makeSessionCookie(userId: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: now + MAX_AGE_S * 1000 })).toString("base64url");
  const value = `${payload}.${sign(payload)}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_S}${isProd() ? "; Secure" : ""}`;
}

export const clearSessionCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProd() ? "; Secure" : ""}`;

export function readSession(req: Request, now = Date.now()): string | null {
  const raw = (req.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  if (!raw) return null;
  const value = raw.slice(COOKIE.length + 1);
  const [payload, mac] = value.split(".");
  if (!payload || !mac) return null;
  const want = Buffer.from(sign(payload));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString()) as { u?: unknown; e?: unknown };
    if (typeof p.u !== "string" || typeof p.e !== "number" || p.e < now) return null;
    return p.u;
  } catch {
    return null;
  }
}
