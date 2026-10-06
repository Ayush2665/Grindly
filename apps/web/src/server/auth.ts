import { authenticateDevice, type AuthedDevice } from "@grindly/services";
import type { Db } from "@grindly/db";
import { fail, crossSite } from "./http";
import { readSession } from "./session";

// For routes the website calls: the user must be signed in, and the request must come from our own site.
export function requireUser(req: Request, opts: { mutating: boolean }): { userId: string } | Response {
  if (opts.mutating && crossSite(req)) return fail(403, "cross-site request refused");
  const userId = readSession(req);
  return userId ? { userId } : fail(401, "sign in first");
}

// For routes the iPhone app calls: Authorization: Bearer <device token>.
export async function requireDevice(db: Db, req: Request): Promise<AuthedDevice | Response> {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer ([0-9a-f]{64})$/.exec(h);
  if (!m) return fail(401, "missing or malformed device token");
  const d = await authenticateDevice(db, m[1]!);
  return d ?? fail(401, "invalid or revoked device token");
}
