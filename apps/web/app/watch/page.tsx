"use client";
import { useEffect, useState } from "react";
import { api, type Me } from "../../src/client";
import { Login } from "../../src/Login";
import { Shell } from "../../src/Shell";
import { TodayCard } from "../../src/TodayCard";
import { useMe } from "../../src/useMe";

// FRONTEND: Link a Watch, plus the dev-only Simulated Watch panel.
export default function WatchPage() {
  const { me, state, refresh } = useMe();
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [left, setLeft] = useState(0);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!code) return;
    const t = setInterval(() => setLeft(Math.max(0, Math.round((Date.parse(code.expiresAt) - Date.now()) / 1000))), 500);
    return () => clearInterval(t);
  }, [code]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3500); return () => clearTimeout(t); }, [toast]);
  // while waiting for the phone, check for the first Watch sample
  useEffect(() => {
    if (!code || state !== "ready" || me?.link.linked) return;
    const t = setInterval(() => void refresh(), 3000);
    return () => clearInterval(t);
  }, [code, state, me?.link.linked, refresh]);

  if (state === "loading") return <Shell hello="" head="Loading…"><div /></Shell>;
  if (state === "signedOut" || !me) return <Login onDone={refresh} />;

  async function makeCode() {
    const r = await api<{ code: string; expiresAt: string }>("/api/v1/devices/pairing-code", {});
    if (r.ok) { setCode(r.data); setLeft(300); } else setToast("Could not make a code");
  }
  async function send(id: string, label: string) {
    setBusy(true);
    const r = await api<{ accepted?: number; rejected?: number; duplicates?: number; error?: string }>("/api/dev/watch", { preset: id });
    setBusy(false);
    setToast(r.ok ? `${label}: ${r.data.accepted} accepted, ${r.data.rejected} rejected` : r.data.error ?? "failed");
    await refresh();
  }
  async function newContract(goal: "STEPS_10K" | "GYM_WORKOUT") {
    const r = await api<{ error?: string }>("/api/dev/contract", { goal, windowDays: 30, unitPaise: 10000 });
    setToast(r.ok ? "Test contract created (payment simulated)" : r.data.error ?? "failed");
    await refresh();
  }
  async function revoke(id: string) {
    await api("/api/v1/devices/revoke", { deviceId: id });
    setCode(null);
    await refresh();
  }
  const { link } = me;
  const hasActive = me.contracts.some((c) => c.state === "ACTIVE");
  const mm = String(Math.floor(left / 60)) + ":" + String(left % 60).padStart(2, "0");

  return (
    <Shell hello="Apple Watch" head={<>Your Watch is the<br />only referee.</>}>
      <div className="card rv in" data-testid="link-status">
        <div className="row"><b>{link.linked ? `Apple Watch (${link.productType})` : "Not linked"}</b>
          <span className={"badge" + (link.linked ? " ok" : "")} data-testid="link-badge">{link.linked ? "Linked" : link.waitingForFirstSample ? "Waiting for first Watch data" : "Not linked"}</span></div>
        <div className="meta" style={{ marginTop: 6 }}>{link.linked ? `Last sync ${link.lastSyncAt ? new Date(link.lastSyncAt).toLocaleString() : "never"}` : "Linking finishes when the first Watch sample arrives."}</div>
        {link.deviceId && <><div style={{ height: 10 }} /><button className="btn ghost small" onClick={() => revoke(link.deviceId!)}>Revoke this device</button></>}
      </div>

      <div className="sec"><div className="label">Link with your iPhone</div>
        <div className="card rv in">
          <div style={{ fontWeight: 700 }}>1. Open Grindly Sync on your iPhone<br />2. Enter this code</div>
          {code ? (<>
            <div className="pairbig" data-testid="pair-code" aria-label={`Pairing code ${code.code}`}>{code.code.split("").map((d, i) => <b key={i}>{d}</b>)}</div>
            <div className="meta" style={{ textAlign: "center" }}>{left > 0 ? `Expires in ${mm} · single use` : "Expired. Make a new code."}</div>
          </>) : <div className="meta" style={{ margin: "8px 0" }}>The code lasts 5 minutes and works once.</div>}
          <div style={{ height: 10 }} /><button className="btn" onClick={makeCode}>{code ? "New code" : "Show pairing code"}</button>
          <div className="note">The iPhone app is built in the next phase. Until then use the Simulated Watch below.</div>
        </div>
      </div>

      {me.devTools && (
        <div className="sec" data-testid="sim-panel"><div className="label">Simulated Watch (dev only)</div>
          <div className="card rv in">
            <div className="meta" style={{ marginBottom: 8 }}>Sends the same raw samples the iPhone app would. Real ones first, then fakes the server should ignore.</div>
            <div className="meta" style={{ fontWeight: 700, margin: "6px 0" }}>Real Watch data</div>
            <div className="row2">{me.presets.filter((p) => p.group === "real").map((p) => <button key={p.id} className="chipbtn" disabled={busy} title={p.hint} onClick={() => send(p.id, p.label)}>{p.label}</button>)}</div>
            <div className="meta" style={{ fontWeight: 700, margin: "12px 0 6px" }}>Fake data (should not count)</div>
            <div className="row2">{me.presets.filter((p) => p.group === "fake").map((p) => <button key={p.id} className="chipbtn fake" disabled={busy} title={p.hint} onClick={() => send(p.id, p.label)}>{p.label}</button>)}</div>
          </div>
          <div className="card rv in">
            <b>Test contract</b>
            <div className="meta" style={{ margin: "6px 0 10px" }}>30 days, ₹100 a day, payment simulated. Needs a linked Watch that synced in the last 24 hours.</div>
            <div className="row2">
              <button className="chipbtn" disabled={hasActive} onClick={() => newContract("STEPS_10K")}>Start steps contract</button>
              <button className="chipbtn" disabled={hasActive} onClick={() => newContract("GYM_WORKOUT")}>Start gym contract</button>
            </div>
          </div>
        </div>
      )}
      {me.today && <TodayCard today={me.today as NonNullable<Me["today"]>} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </Shell>
  );
}
