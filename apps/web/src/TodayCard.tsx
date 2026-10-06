"use client";
import { FLAGS, REASONS, type Me } from "./client";

// FRONTEND: shows today's verdict. The verdict itself is decided by the server, this only displays it.
export function TodayCard({ today }: { today: NonNullable<Me["today"]> }) {
  const steps = today.goal === "STEPS_10K";
  const total = today.stepsTotal ?? 0;
  const p = Math.min(1, total / 10000);
  const reasons = [...new Set(today.rejected.map((r) => r.reason))];
  return (
    <div className="card rv in" data-testid="today">
      <div className="row"><b>{steps ? "Today: 10,000 steps" : "Today: gym workout"}</b>
        <span className={"badge" + (today.verified ? " ok" : "")} data-testid="verdict">{today.verified ? "Verified" : "Not yet"}</span></div>
      {steps ? (
        <>
          <div className="ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="var(--dot-off)" strokeWidth="11" />
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--accent)" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(2 * Math.PI * 52 * p).toFixed(1)} 999`} /></svg>
            <div className="mid"><b data-testid="steps">{total.toLocaleString("en-IN")}</b><span>of 10,000 steps</span></div></div>
        </>
      ) : (
        <div className="meta" style={{ margin: "10px 0" }}>{today.workoutId ? "A qualifying Watch workout counted." : "Needs a Watch workout of 30+ minutes with heart rate."}</div>
      )}
      {(reasons.length > 0 || today.flags.length > 0) && (
        <div data-testid="evidence" style={{ marginTop: 8 }}>
          <div className="meta" style={{ marginBottom: 4 }}>Ignored or flagged:</div>
          {reasons.map((r) => <span className="reject" key={r}>{REASONS[r] ?? r}</span>)}
          {today.flags.map((f) => <span className="reject flag" key={f.code}>{FLAGS[f.code] ?? f.code}</span>)}
        </div>
      )}
      <div className="note">The server works this out from raw Watch samples. Nothing on this screen can change it.</div>
    </div>
  );
}
