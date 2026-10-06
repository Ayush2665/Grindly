"use client";
import { useEffect, useRef, useState } from "react";
import { Dumbbell, Shoe } from "./art";

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

// FRONTEND: a sticky card whose animation follows how far you have scrolled past it (0 to 1).
// It shows how a day counts. The numbers here are an illustration, not your data.
function useScrollProgress() {
  const ref = useRef<HTMLElement>(null);
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = ref.current;
        const sticky = el?.firstElementChild as HTMLElement | null;
        if (!el || !sticky) return;
        const travel = Math.max(1, el.offsetHeight - sticky.offsetHeight);
        setP(clamp(-(el.getBoundingClientRect().top - 8) / travel));
      });
    };
    update();
    addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    return () => { cancelAnimationFrame(raf); removeEventListener("scroll", update); removeEventListener("resize", update); };
  }, []);
  return { ref, p };
}

export function StepsStory() {
  const { ref, p } = useScrollProgress();
  const done = p > 0.96;
  const s = Math.sin(p * Math.PI * 30);
  const dots = 14;
  return (
    <section ref={ref} className={"story" + (done ? " done" : "")} data-testid="story-steps">
      <div className="story-sticky">
        <div className="story-top"><span className="tag">Steps · from your Watch</span><span className="chk">✓</span></div>
        <h3>Walk. It counts itself.</h3>
        <div className="stage">
          <div className="trail">{Array.from({ length: dots }, (_, i) => <i key={i} className={i / dots < p ? "on" : ""} />)}</div>
          <div className="actor" style={{ position: "absolute", left: `${p * 100}%`, transform: `translate(-${p * 100}%, ${s * 3 - 2}px) rotate(${s * 2.2 - 1}deg)` }}><Shoe /></div>
        </div>
        <div className="readout"><div><b>{Math.round(p * 10000).toLocaleString("en-IN")}</b><span>steps (example)</span></div><div className="mini"><b>{done ? "₹100" : "₹0"}</b><span>released</span></div></div>
        <div className="bar"><i style={{ width: `${p * 100}%` }} /></div>
        <p className="cap">{p < 0.3 ? "Warm-up. Your Watch is counting quietly." : p < 0.96 ? "In the zone. Samples sync every hour." : "10,000 hit. ₹100 moves from escrow to your wallet."}</p>
      </div>
    </section>
  );
}

export function GymStory() {
  const { ref, p } = useScrollProgress();
  const lift = Math.abs(Math.sin(p * Math.PI * 7));
  const mins = Math.round(p * 35);
  return (
    <section ref={ref} className={"story gym" + (mins >= 30 && p > 0.96 ? " done" : "")} style={{ ["--lift" as string]: lift.toFixed(3) }} data-testid="story-gym">
      <div className="story-sticky">
        <div className="story-top"><span className="tag">Gym · Watch workout</span><span className="chk">✓</span></div>
        <h3>Lift. The Watch is watching.</h3>
        <div className="stage">
          <div className="actor" style={{ transform: `translateY(${26 - lift * 52}px) rotate(${(lift - 0.5) * 9}deg) scale(${1 + lift * 0.05})`, filter: `drop-shadow(0 ${10 + lift * 8}px ${14 + lift * 26}px rgba(255,122,47,${0.25 + lift * 0.4}))` }}><Dumbbell /></div>
          <div className="floor" />
        </div>
        <div className="readout"><div><b>{mins}</b><span>minutes (example)</span></div><div className="mini"><b>{Math.round(92 + p * 58)}</b><span>avg bpm</span></div></div>
        <div className="bar"><i style={{ width: `${p * 100}%` }} /></div>
        <p className="cap">{p < 0.3 ? "Strength training detected." : mins < 30 ? "Heart rate is up. Keep going to 30 min." : "30+ min with heart rate. Workout verified."}</p>
      </div>
    </section>
  );
}
