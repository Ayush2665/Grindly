import { PGlite } from "@electric-sql/pglite";
import type { Db } from "./client";
import { migrate } from "./migrate";

// Supabase provides these roles and auth.uid() itself. Stand-ins let the same SQL files run locally.
export const SUPABASE_STUBS = `
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
`;

export type PgliteDb = PGlite & Db;

// A real Postgres engine that runs inside Node. Used for tests and for local dev (no Docker needed).
// Pass a folder to keep data between restarts, or nothing for a throwaway in-memory database.
export async function openPglite(dataDir?: string, migrationsDir?: string): Promise<PgliteDb> {
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  const fresh = await pg.query<{ n: string }>(`SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = 'public'`);
  if (Number(fresh.rows[0]!.n) === 0) {
    await pg.exec(SUPABASE_STUBS);
    await migrate(pg as never, migrationsDir);
  }
  return pg as unknown as PgliteDb;
}
