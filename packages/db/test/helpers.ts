import { openPglite, type PgliteDb } from "../src";

export async function freshDb(): Promise<PgliteDb> {
  return openPglite();
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
