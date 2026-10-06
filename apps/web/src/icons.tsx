// FRONTEND: small line icons (static, hand-written SVG paths).
const P: Record<string, string> = {
  flame: '<path d="M12 3c.5 3-1.5 4.5-3 6.5C7.7 11.2 7 12.7 7 14.5a5 5 0 0 0 10 0c0-1.6-.6-2.8-1.5-4-.4 1-1 1.6-1.8 2 .3-3-.7-6.5-1.7-9.5Z"/>',
  steps: '<path d="M8 4c2 0 3 1.6 3 3.6S10 11 8.5 11 5 9.6 5 7.4 6 4 8 4ZM16 11c2 0 3 1.6 3 3.6S18 18 16.5 18 13 16.6 13 14.4 14 11 16 11Z"/><path d="M8 14v1.5M16 21.5V21"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><rect x="4" y="8" width="16" height="11" rx="3"/><circle cx="16" cy="13.5" r="1.1"/>',
  watch: '<rect x="6.5" y="6.5" width="11" height="11" rx="3.5"/><path d="M9 6.5 9.6 3h4.8l.6 3.5M9 17.5l.6 3.5h4.8l.6-3.5M12 10v2.2l1.4 1"/>',
  dumbbell: '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  down: '<path d="M12 4v13M6.5 11.5 12 17l5.5-5.5M5 20h14"/>',
  up: '<path d="M12 20V7M6.5 12.5 12 7l5.5 5.5M5 4h14"/>',
  pool: '<path d="M3 9c3-2 6 2 9 0s6-2 9 0M3 14c3-2 6 2 9 0s6-2 9 0M3 19c3-2 6 2 9 0s6-2 9 0"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><path d="M16 5.6a3 3 0 0 1 0 5.8M17.5 14.3c1.7.6 2.7 2 3 4.2"/>',
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: P[name] ?? "" }} />;
}
