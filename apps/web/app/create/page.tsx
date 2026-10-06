"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deriveTerms, stakeForUnit } from "@grindly/domain";
import { api, inr } from "../../src/client";
import { Dumbbell, Shoe } from "../../src/art";
import { Icon } from "../../src/icons";
import { Login } from "../../src/Login";
import { Shell } from "../../src/Shell";
import { useMe } from "../../src/useMe";

const WINDOWS = [7, 14, 20, 30];
const UNITS = [5000, 10000, 20000, 50000];

// FRONTEND: Create goal. The numbers use the same rules package the server uses, so the preview cannot disagree with it.
export default function CreatePage() {
  const { me, state, refresh } = useMe();
  const router = useRouter();
  const [goal, setGoal] = useState<"STEPS_10K" | "GYM_WORKOUT">("STEPS_10K");
  const [mode, setMode] = useState<"STAKE" | "NO_RISK">("STAKE");
  const [w, setW] = useState(30);
  const [u, setU] = useState(10000);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (state === "loading") return <Shell hello="" head="Loading…"><div /></Shell>;
  if (state === "signedOut" || !me) return <Login onDone={refresh} />;

  const t = deriveTerms(stakeForUnit(u, w), w);
  const hasActive = me.contracts.some((c) => c.state === "ACTIVE");
  const seg = (items: Array<{ v: number | string; label: string; sub?: string }>, cur: number | string, set: (v: never) => void, wrap = false, name = "") => (
    <div className={"seg" + (wrap ? " wrap" : "")} role="group" aria-label={name}>
      {items.map((i) => <button key={i.v} className={cur === i.v ? "on" : ""} onClick={() => set(i.v as never)}>{i.label}{i.sub && <small>{i.sub}</small>}</button>)}
    </div>
  );

  async function go() {
    setBusy(true); setErr("");
    const r = await api<{ error?: string }>("/api/dev/contract", { goal, windowDays: w, unitPaise: u });
    setBusy(false);
    if (r.ok) { await refresh(); router.push("/today"); } else setErr(r.data.error ?? "Could not create the contract");
  }

  return (
    <Shell hello="New contract" head={<>Pick a goal.<br />Put something on it.</>}>
      <div className="goalprev">
        <div className="gp-art">{goal === "STEPS_10K" ? <Shoe /> : <Dumbbell />}</div>
        <div><b>{goal === "STEPS_10K" ? "10,000 steps a day" : "Gym workout, 30+ min"}</b>
          <span>{goal === "STEPS_10K" ? "Your Watch counts. You just walk." : "Strength, HIIT and more. Heart rate required."}</span></div>
      </div>
      <div className="sec" style={{ marginTop: 4 }}><div className="label">Goal</div>
        <div className="seg" role="group" aria-label="Goal">
          <button className={goal === "STEPS_10K" ? "on" : ""} onClick={() => setGoal("STEPS_10K")}><Icon name="steps" size={20} /><small>10k steps / day</small></button>
          <button className={goal === "GYM_WORKOUT" ? "on" : ""} onClick={() => setGoal("GYM_WORKOUT")}><Icon name="dumbbell" size={20} /><small>Gym 30+ min</small></button>
        </div></div>
      <div className="sec"><div className="label">Mode</div>
        {seg([{ v: "STAKE", label: "Stake", sub: "Forfeits join the pool" }, { v: "NO_RISK", label: "No Risk", sub: "Forfeits go to a friend" }], mode, setMode, false, "Mode")}</div>
      <div className="sec"><div className="label">Window (days)</div>{seg(WINDOWS.map((x) => ({ v: x, label: String(x) })), w, setW, true, "Window")}</div>
      <div className="sec"><div className="label">Value of each verified day</div>{seg(UNITS.map((x) => ({ v: x, label: inr(x) })), u, setU, true, "Value per day")}</div>

      <div className="card" style={{ marginTop: 18 }} data-testid="terms">
        <div className="kv"><span>Rest days (10%)</span><b>{t.restDays === 0 ? `0 (every miss costs ${inr(t.unit)})` : `${t.restDays} days`}</b></div>
        <div className="kv"><span>Required days</span><b>{t.requiredDays} of {t.windowDays} days</b></div>
        <div className="kv"><span>Total stake</span><b data-testid="stake">{inr(t.stake)}</b></div>
        <div className="kv"><span>Held in escrow</span><b>until each day is verified</b></div>
      </div>
      <div className="note">{mode === "STAKE"
        ? `Miss more than ${t.restDays} days and ${inr(t.unit)} per extra miss joins the monthly pool. Finish clean and you share it, plus simulated interest.`
        : "No Risk (friend mode) is not live yet. It needs invites and payments, which come in a later phase."}</div>
      {err && <div className="note" role="alert" style={{ color: "var(--bad)" }}>{err}</div>}
      {!me.link.linked && <div className="note">You need a linked Apple Watch first. Go to the Watch page.</div>}
      <div style={{ height: 12 }} />
      <button className="btn" disabled={busy || mode === "NO_RISK" || hasActive || !me.link.linked} onClick={go}>
        {mode === "NO_RISK" ? "Invite a friend (coming soon)" : hasActive ? "You already have an active contract" : "Continue to test payment"}
      </button>
      <div className="meta" style={{ textAlign: "center", marginTop: 8 }}>Test mode: the payment is simulated. No real money.</div>
    </Shell>
  );
}
