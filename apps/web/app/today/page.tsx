"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { addDays } from "@grindly/domain";
import { api, inr } from "../../src/client";
import { Icon } from "../../src/icons";
import { Login } from "../../src/Login";
import { StepsStory } from "../../src/ScrollStory";
import { Shell } from "../../src/Shell";
import { TodayCard } from "../../src/TodayCard";
import { useMe } from "../../src/useMe";

interface Day { local_date: string; verified: boolean; settled_at: string | null; evidence: { forfeitedUnits?: number } }

// FRONTEND: Daily status. This week, the whole window as a dot grid, and today's verdict.
export default function TodayPage() {
  const { me, state, refresh } = useMe();
  const [days, setDays] = useState<Day[]>([]);
  const [toast, setToast] = useState("");
  const active = me?.contracts.find((c) => c.state === "ACTIVE") ?? me?.contracts[0];

  const load = useCallback(async () => {
    if (!active) return;
    const r = await api<{ days: Day[] }>(`/api/v1/contracts/${active.id}/days`);
    if (r.ok) setDays(r.data.days);
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load, me?.today?.verified, me?.contracts]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3500); return () => clearTimeout(t); }, [toast]);

  if (state === "loading") return <Shell hello="" head="Loading…"><div /></Shell>;
  if (state === "signedOut" || !me) return <Login onDone={refresh} />;

  if (!active) {
    return (
      <Shell hello="Daily status" head={<>Nothing to track<br />yet.</>}>
        <div className="card rv in"><b>No contract yet</b><div className="meta" style={{ margin: "6px 0 12px" }}>Start one and your days will show up here.</div>
          <Link href="/create"><button className="btn small">Create a goal</button></Link></div>
      </Shell>
    );
  }

  const byDate = new Map(days.map((d) => [d.local_date, d]));
  const today = me.today?.localDate ?? active.start_date;
  const cell = (date: string): "v" | "r" | "f" | "" => {
    const d = byDate.get(date);
    if (d?.settled_at) return d.verified ? "v" : (d.evidence.forfeitedUnits ?? 0) > 0 ? "f" : "r";
    if (d?.verified) return "v";
    return "";
  };
  const grid = Array.from({ length: active.window_days }, (_, i) => cell(addDays(active.start_date, i)));
  const restUsed = grid.filter((c) => c === "r").length;
  const dow = new Date(today + "T00:00:00Z").getUTCDay();
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - dow);
    return { date, name: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i]!, n: Number(date.slice(8)), s: date === today ? "today" : cell(date) };
  });
  const left = active.window_days - active.days_closed;
  const nextIdx = active.days_closed + 1;

  async function fastForward() {
    const r = await api<{ settled: null | { dayIndex: number; verified: boolean; releasedPaise: number; forfeitedPaise: number } }>("/api/dev/settle", { contractId: active!.id });
    const s = r.data.settled;
    setToast(!r.ok ? "Could not close the day" : !s ? "Nothing left to close" : s.releasedPaise > 0 ? `Day ${s.dayIndex} closed: ${inr(s.releasedPaise)} released to your wallet` : s.forfeitedPaise > 0 ? `Day ${s.dayIndex} closed: ${inr(s.forfeitedPaise)} forfeited` : `Day ${s.dayIndex} closed: rest day, no money moved`);
    await refresh();
    await load();
  }

  return (
    <Shell hello={`Day ${Math.min(nextIdx, active.window_days)} of ${active.window_days}`} head={me.today?.verified ? <>Today is done.<br />Nice work.</> : <>Today still<br />needs a pass.</>}>
      <div className="card rv in"><div className="week">
        {week.map((w) => (
          <div className="d" key={w.date}>{w.name}<div className={"c " + w.s}>{w.s === "v" ? <Icon name="flame" size={18} /> : w.n}</div></div>
        ))}
      </div></div>

      {me.today && <TodayCard today={me.today} />}

      <div className="stat2" style={{ marginTop: 4 }}>
        <div><div className="n">{active.required_days}<small>days</small></div><div className="l">Required</div></div>
        <div><div className="n">{active.verified_units}<small>days</small></div><div className="l">Paid so far</div></div>
      </div>

      <div className="card rv in" style={{ marginTop: 12 }}>
        <div className="row"><b>{active.goal_type === "STEPS_10K" ? "10,000 steps a day" : "Gym workout, 30+ min"}</b>
          <span className={"badge" + (active.forfeited_units === 0 ? " ok" : "")}>{active.forfeited_units === 0 ? "On track" : `${active.forfeited_units} forfeited`}</span></div>
        <div className="meta" style={{ margin: "6px 0 12px" }}>{active.window_days - active.required_days} rest days allowed · {restUsed} used · {active.forfeited_units} forfeited · {left} days left</div>
        <div className="dots big" style={{ gridTemplateColumns: "repeat(10, auto)" }} data-testid="grid">
          {grid.map((c, i) => <i key={i} className={c} style={{ ["--i" as string]: i }} />)}
        </div>
        <div className="legend"><span><i style={{ background: "var(--dot-on)" }} />Verified</span><span><i style={{ background: "var(--dot-rest)" }} />Rest day</span><span><i style={{ background: "var(--bad)" }} />Forfeited</span><span><i style={{ background: "var(--dot-off)" }} />Upcoming</span></div>
        <div className="note">A day settles at 06:00 the next morning, so a late overnight sync still counts. A verified day pays {inr(active.unit_paise)} from escrow to your wallet.</div>
      </div>

      {me.devTools && active.state === "ACTIVE" && (
        <div className="card rv in">
          <b>Dev: pretend a day passed</b>
          <div className="meta" style={{ margin: "6px 0 10px" }}>Closes day {nextIdx} now instead of waiting. The real hourly job comes later.</div>
          <button className="btn ghost small" onClick={fastForward} data-testid="fast-forward">Close day {nextIdx}</button>
        </div>
      )}

      <div className="sec"><div className="label">How a day counts</div></div>
      <StepsStory />
      {toast && <div className="toast" role="status">{toast}</div>}
    </Shell>
  );
}
