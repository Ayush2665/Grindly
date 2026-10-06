import { PGlite } from "@electric-sql/pglite";
import { migrate, type Db } from "../src";

// Supabase provides these. We create stand-ins so the same SQL files run in tests.
const SUPABASE_STUBS = `
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
`;

export async function freshDb(): Promise<PGlite & Db> {
  const pg = new PGlite();
  await pg.exec(SUPABASE_STUBS);
  await migrate(pg);
  return pg as unknown as PGlite & Db;
}

export async function expectDbError(p: Promise<unknown>, match: RegExp): Promise<void> {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  if (!err) throw new Error(`expected a database error matching ${match}, but it succeeded`);
  const msg = (err as Error).message;
  if (!match.test(msg)) throw new Error(`expected ${match}, got: ${msg}`);
}
