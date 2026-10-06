import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import { openPglite, type Db } from "@grindly/db";

const g = globalThis as unknown as { __grindlyDb?: Promise<Db>; __grindlySecret?: string };

export const isProd = () => process.env.NODE_ENV === "production";
// The simulated Watch and dev sign-in exist only outside production.
export const devToolsEnabled = () => !isProd() && process.env.ENABLE_SIMULATED_WATCH !== "false";

// Local dev database: Postgres running inside Node, saved in apps/web/.data. Supabase replaces it later.
export function getDb(): Promise<Db> {
  // GRINDLY_DB_DIR=memory gives a throwaway database (used by the browser tests)
  const dir = process.env.GRINDLY_DB_DIR === "memory" ? undefined : (process.env.GRINDLY_DB_DIR ?? join(process.cwd(), ".data", "dev-db"));
  g.__grindlyDb ??= openPglite(dir, resolve(process.cwd(), "..", "..", "packages", "db", "migrations")) as Promise<Db>;
  return g.__grindlyDb;
}

// Tests give the handlers their own throwaway database.
export function setDbForTests(db: Db | null): void {
  if (db) g.__grindlyDb = Promise.resolve(db);
  else delete g.__grindlyDb;
}

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) {
    if (s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
    return s;
  }
  if (isProd()) throw new Error("SESSION_SECRET is required in production");
  g.__grindlySecret ??= randomBytes(32).toString("hex"); // dev: sessions reset when the server restarts
  return g.__grindlySecret;
}
