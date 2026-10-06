"use client";
import Link from "next/link";
import { inr } from "../src/client";
import { Login } from "../src/Login";
import { Shell } from "../src/Shell";
import { TodayCard } from "../src/TodayCard";
import { useMe } from "../src/useMe";
import { GymStory, StepsStory } from "../src/ScrollStory";
import { Icon } from "../src/icons";

// FRONTEND: Home. Watch status, today's verdict, your contracts, and the scroll scenes that explain a day.
export default function Home() {
  const { me, state, refresh } = useMe();
  if (state === "loading") return <Shell hello="" head="Loading…"><div /></Shell>;
  if (state === "signedOut" || !me) return <Login onDone={refresh} />;
  const { link } = me;
  return (
    <Shell hello={`Good day, ${me.user.name}`} head={<>Keep the streak alive,<br />show up for your stake.</>}>
      <div className="row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Your contracts</h2>
        <span className={"badge" + (link.linked ? " ok" : "")}>{link.linked ? "Watch linked" : "No Watch"}</span>
      </div>
      <div className="sub">Verified automatically from your Apple Watch.</div>

      {!link.linked && (
        <div className="card rv in" style={{ marginTop: 12 }}>
          <b>Link your Apple Watch first</b>
          <div className="meta" style={{ margin: "6px 0 10px" }}>Contracts need a Watch that has synced in the last 24 hours.</div>
          <Link href="/watch"><button className="btn small">Link Apple Watch</button></Link>
        </div>
      )}

      {me.today && <TodayCard today={me.today} />}

      {me.contracts.length === 0 && link.linked && <div className="sub" style={{ marginTop: 10 }}>No contracts yet.</div>}
      {me.contracts.map((c) => (
        <Link href="/today" className="card link rv in" key={c.id} style={{ marginTop: 12 }} data-testid="contract">
          <div className="row"><span className="tag"><Icon name={c.goal_type === "STEPS_10K" ? "steps" : "dumbbell"} size={13} />{c.window_days - c.days_closed} days left</span><span className="badge">{c.state}</span></div>
          <h3>{c.goal_type === "STEPS_10K" ? "10,000 steps a day" : "Gym workout, 30+ min"}</h3>
          <div className="meta"><b>{c.verified_units}/{c.required_days}</b> days paid · {inr(c.stake_paise)} staked · {inr(c.unit_paise)}/day</div>
          <div className="bar" style={{ marginTop: 10 }}><i style={{ width: `${(c.verified_units / c.required_days) * 100}%` }} /></div>
        </Link>
      ))}
      <Link href="/norisk" className="card link rv in" style={{ marginTop: 12 }}>
        <div className="row"><span className="tag"><Icon name="users" size={13} />No Risk with a friend</span><span className="sample">PREVIEW</span></div>
        <div className="meta" style={{ marginTop: 6 }}>Miss a day and your unit goes to your friend. Not live yet.</div>
      </Link>

      <Link href="/create"><button className="btn" style={{ marginTop: 6 }}>Start a new contract</button></Link>

      <div className="sec"><div className="label">Scroll to see how a day counts</div></div>
      <StepsStory />
      <GymStory />
    </Shell>
  );
}
