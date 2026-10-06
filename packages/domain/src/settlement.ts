import { closeDay, type Progress } from "./forfeiture";
import type { LedgerTx } from "./ledger";
import type { Mode } from "./contract";
import type { Paise } from "./money";

export interface SettleInput {
  contractId: string;
  mode: Mode;
  userId: string;
  unit: Paise;
  cohortId: string; // stake mode: pool the forfeits go to
  friendUserId?: string; // no risk mode: who receives the forfeits
  progress: Progress;
  dayIndex: number; // 1-based day being closed
  dayVerified: boolean;
}

export interface SettleResult {
  progress: Progress;
  txs: LedgerTx[];
}

const escrow = (id: string) => ({ kind: "escrow" as const, owner: id });

// Plan the money moves for closing one day. The keys are built from contract + day,
// so running the same day twice cannot move money twice.
export function planDaySettlement(i: SettleInput): SettleResult {
  if (i.dayIndex !== i.progress.daysClosed + 1) {
    // already closed (or out of order): nothing to do
    if (i.dayIndex <= i.progress.daysClosed) return { progress: i.progress, txs: [] };
    throw new Error(`day ${i.dayIndex} is not next, ${i.progress.daysClosed} days are closed`);
  }
  const out = closeDay(i.progress, i.dayVerified);
  const txs: LedgerTx[] = [];
  if (out.released > 0) {
    const amt = out.released * i.unit;
    txs.push({
      key: `contract:${i.contractId}:day:${i.dayIndex}:release`,
      postings: [
        { account: escrow(i.contractId), amount: -amt },
        { account: { kind: "wallet", owner: i.userId }, amount: amt },
      ],
    });
  }
  if (out.newForfeits > 0) {
    const amt = out.newForfeits * i.unit;
    let dest;
    if (i.mode === "NO_RISK") {
      if (!i.friendUserId) throw new Error("no risk contract needs a friend");
      dest = { kind: "wallet" as const, owner: i.friendUserId };
    } else {
      dest = { kind: "pool" as const, owner: i.cohortId };
    }
    txs.push({
      key: `contract:${i.contractId}:day:${i.dayIndex}:forfeit`,
      postings: [
        { account: escrow(i.contractId), amount: -amt },
        { account: dest, amount: amt },
      ],
    });
  }
  return { progress: out.progress, txs };
}
