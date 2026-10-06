"use client";
import { useCallback, useEffect, useState } from "react";
import { api, inr } from "../../src/client";
import { CountUp } from "../../src/CountUp";
import { Icon } from "../../src/icons";
import { Login } from "../../src/Login";
import { Shell } from "../../src/Shell";
import { useMe } from "../../src/useMe";

interface W { balancePaise: number; escrowPaise: number; entries: Array<{ at: string; title: string; amountPaise: number }> }

// FRONTEND: Wallet and ledger. Balances come straight from the server's ledger.
export default function WalletPage() {
  const { me, state, refresh } = useMe();
  const [w, setW] = useState<W | null>(null);
  const [toast, setToast] = useState("");
  const load = useCallback(async () => { const r = await api<W>("/api/v1/wallet"); if (r.ok) setW(r.data); }, []);
  useEffect(() => { if (state === "ready") void load(); }, [state, load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3500); return () => clearTimeout(t); }, [toast]);

  if (state === "loading") return <Shell hello="" head="Loading…"><div /></Shell>;
  if (state === "signedOut" || !me) return <Login onDone={refresh} />;

  async function withdraw() {
    if (!w || w.balancePaise <= 0) return;
    const r = await api<{ error?: string; repeated?: boolean }>("/api/v1/wallet/withdraw", { amountPaise: w.balancePaise, idempotencyKey: crypto.randomUUID() });
    setToast(r.ok ? `${inr(w.balancePaise)} withdrawn (simulated)` : r.data.error ?? "Could not withdraw");
    await load();
  }

  return (
    <Shell hello="Wallet" head={<>Money you've<br />earned back.</>}>
      <div className="card rv in">
        <div className="meta">Available balance</div>
        <div className="bigbal" data-testid="balance">{w ? <CountUp value={w.balancePaise} format={inr} /> : "…"}</div>
        <div className="kv" style={{ marginTop: 8 }}><span>In escrow</span><b data-testid="escrow">{w ? inr(w.escrowPaise) : "…"}</b></div>
        <div className="kv"><span>Pool bonus</span><b>after the month closes</b></div>
        <div className="kv"><span>Simulated interest, 6% APY</span><b>not running yet</b></div>
        <div style={{ height: 10 }} />
        <button className="btn" disabled={!w || w.balancePaise <= 0} onClick={withdraw}>Withdraw (simulated)</button>
      </div>

      <div className="sec" style={{ marginTop: 6 }}><div className="label">Ledger</div>
        <div className="card rv in" style={{ padding: "4px 16px" }} data-testid="ledger">
          {w && w.entries.length === 0 && <div className="meta" style={{ padding: "14px 0" }}>Nothing yet. Start a contract and verified days will show up here.</div>}
          {w?.entries.map((e, i) => (
            <div className="led" key={i}>
              <div className="ic"><Icon name={e.amountPaise >= 0 ? "down" : "up"} /></div>
              <div className="t">{e.title}<small>{new Date(e.at).toLocaleString()}</small></div>
              <div className={"a " + (e.amountPaise >= 0 ? "pos" : "neg")}>{e.amountPaise >= 0 ? "+" : ""}{inr(e.amountPaise)}</div>
            </div>
          ))}
        </div>
        <div className="meta" style={{ fontSize: 12, marginTop: 4 }}>Every entry is double-entry and sums to zero. Entries are never edited.</div>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </Shell>
  );
}
