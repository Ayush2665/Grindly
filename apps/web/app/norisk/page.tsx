"use client";
import { Login } from "../../src/Login";
import { Shell } from "../../src/Shell";
import { useMe } from "../../src/useMe";

// FRONTEND: No Risk (friend mode). A preview with sample data: invites and friend payouts are not built yet.
export default function NoRiskPage() {
  const { me, state, refresh } = useMe();
  if (state === "loading") return <Shell hello="" head="Loading…"><div /></Shell>;
  if (state === "signedOut" || !me) return <Login onDone={refresh} />;
  return (
    <Shell hello="No Risk mode" head={<>Same stakes.<br />Your friend gets the misses.</>}>
      <div className="note" style={{ marginTop: 0 }}><span className="sample">PREVIEW</span> &nbsp;This is a sample of how friend mode will look. Invites and friend payouts are not built yet, and none of the numbers below are real.</div>
      <div className="card ghostcard" style={{ marginTop: 12 }}>
        <div className="row"><div><b>Riya Sharma</b><div className="meta">Invited 3 h ago · expires in 45 h</div></div><span className="badge">Pending</span></div>
        <div className="flow"><div className="node">You<br /><span className="meta">₹1,620 stake</span></div><div className="arrow">⇄</div><div className="node">Riya<br /><span className="meta">₹1,620 stake</span></div></div>
      </div>
      <div className="card ghostcard"><b>Contract terms</b>
        <div className="kv"><span>Goal</span><b>Gym, 30+ min</b></div>
        <div className="kv"><span>Window / required</span><b>30 days / 27 days</b></div>
        <div className="kv"><span>Per verified day</span><b>₹60</b></div>
        <div className="kv"><span>On a forfeit</span><b>Goes to friend's wallet</b></div>
        <div className="kv"><span>Pool bonus</span><b>None in this mode</b></div></div>
      <div className="note">Both of you must accept before either contract starts. The invite expires after 48 hours and you get a full refund. No cancelling once active. The Watch is the only judge, so there is nothing to dispute.</div>
    </Shell>
  );
}
