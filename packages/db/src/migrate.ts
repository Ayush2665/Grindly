import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Queryable } from "./client";

export const MIGRATIONS_DIR = join(import.meta.dirname, "..", "migrations");

// Runs *.sql files in name order. The runner used by tests; production applies the same files with the Supabase CLI.
export async function migrate(db: { exec(sql: string): Promise<unknown> } & Queryable, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) await db.exec(readFileSync(join(dir, f), "utf8"));
  return files;
}
