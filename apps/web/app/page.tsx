"use client";
import Link from "next/link";
import { inr } from "../src/client";
import { Login } from "../src/Login";
import { Shell } from "../src/Shell";
import { TodayCard } from "../src/TodayCard";
import { useMe } from "../src/useMe";

// FRONTEND: Home. Shows Watch status, today's verdict and your contracts.
export default function Home() {
  const { me, state, refresh } = useMe();
  if (state === "loading") return <Shell hello="" head="Loading…"><div /></Shell>;
  if (state === "signedOut" || !me) return <Login onDone={refresh} />;
  const { link } = me;
  return (
    <Shell hello={`Good day, ${me.user.name}`} head={<>Keep the streak alive,<br />show up for your stake.</>}>
      <h2>Your Watch</h2>
      <div className="card rv in" style={{ marginTop: 10 }}>
        <div className="row"><b>{link.linked ? `Apple Watch (${link.productType ?? "Watch"})` : "No Watch linked"}</b>
          <span className={"badge" + (link.linked ? " ok" : "")}>{link.linked ? (link.fresh ? "Synced" : "Stale") : link.waitingForFirstSample ? "Waiting" : "Not linked"}</span></div>
        <div className="meta" style={{ marginTop: 6 }}>
          {link.linked ? `Last sync ${link.lastSyncAt ? new Date(link.lastSyncAt).toLocaleString() : "never"}` : "Link your Watch before you can start a contract."}
        </div>
        <div style={{ height: 10 }} />
        <Link href="/watch"><button className="btn small">{link.linked ? "Manage Watch" : "Link Apple Watch"}</button></Link>
      </div>

      {me.today && <TodayCard today={me.today} />}

      <h2 style={{ marginTop: 18 }}>Your contracts</h2>
      {me.contracts.length === 0 && <div className="sub" style={{ marginTop: 6 }}>None yet. {link.linked ? "Create a test contract on the Watch page." : "Link a Watch first."}</div>}
      {me.contracts.map((c) => (
        <div className="card rv in" key={c.id} style={{ marginTop: 10 }} data-testid="contract">
          <div className="row"><span className="tag">{c.goal_type === "STEPS_10K" ? "10,000 steps a day" : "Gym workout, 30+ min"}</span><span className="badge">{c.state}</span></div>
          <h3>{inr(c.stake_paise)} staked · {inr(c.unit_paise)}/day</h3>
          <div className="meta"><b>{c.verified_units}/{c.required_days}</b> days paid · {c.window_days - c.required_days} rest days · starts {c.start_date}</div>
          <div className="bar" style={{ marginTop: 10 }}><i style={{ width: `${(c.verified_units / c.required_days) * 100}%` }} /></div>
        </div>
      ))}
    </Shell>
  );
}
