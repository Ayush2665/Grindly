// The one forfeiture rule: must_forfeit = max(0, (R - v) - (W - d))
// R required days, v verified so far, W window, d days closed so far.
// "Units" are whole days' worth of stake. unit value = stake / R.

export interface Progress {
  windowDays: number; // W
  requiredDays: number; // R
  daysClosed: number; // d
  verified: number; // units released to the user (v)
  forfeited: number; // units sent to the pool or friend (f)
}

export function startProgress(windowDays: number, requiredDays: number): Progress {
  return { windowDays, requiredDays, daysClosed: 0, verified: 0, forfeited: 0 };
}

export function remainingUnits(p: Progress): number {
  return p.requiredDays - p.verified - p.forfeited;
}

export function mustForfeit(requiredDays: number, verified: number, windowDays: number, daysClosed: number): number {
  return Math.max(0, requiredDays - verified - (windowDays - daysClosed));
}

export interface DayOutcome {
  progress: Progress;
  released: number; // 0 or 1 unit goes escrow -> wallet
  newForfeits: number; // units go escrow -> pool (or friend)
}

// Close one local day. Pure: returns a new Progress.
export function closeDay(p: Progress, dayVerified: boolean): DayOutcome {
  if (p.daysClosed >= p.windowDays) throw new Error("window already closed");
  // a verified day only pays while there is stake left to release
  const released = dayVerified && remainingUnits(p) > 0 ? 1 : 0;
  const verified = p.verified + released;
  const daysClosed = p.daysClosed + 1;
  const target = mustForfeit(p.requiredDays, verified, p.windowDays, daysClosed);
  const newForfeits = Math.max(0, target - p.forfeited);
  return {
    progress: { ...p, daysClosed, verified, forfeited: p.forfeited + newForfeits },
    released,
    newForfeits,
  };
}

export function isComplete(p: Progress): boolean {
  return p.daysClosed === p.windowDays && p.forfeited === 0;
}
