"use client";
import { useEffect, useState } from "react";

// FRONTEND: a number that counts up once when it first shows.
export function CountUp({ value, format = (n: number) => n.toLocaleString("en-IN") }: { value: number; format?: (n: number) => string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(value); return; }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 900);
      setV(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(v)}</>;
}
