"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// FRONTEND: the page frame (test-mode banner, orange header, bottom nav). Every screen uses it.
export function Shell({ hello, head, children }: { hello: string; head: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  const items = [
    { href: "/", label: "Home", d: "M12 3c.5 3-1.5 4.5-3 6.5C7.7 11.2 7 12.7 7 14.5a5 5 0 0 0 10 0c0-1.6-.6-2.8-1.5-4-.4 1-1 1.6-1.8 2 .3-3-.7-6.5-1.7-9.5Z" },
    { href: "/watch", label: "Watch", d: "M6.5 6.5h11v11h-11zM9 6.5 9.6 3h4.8l.6 3.5M9 17.5l.6 3.5h4.8l.6-3.5M12 10v2.2l1.4 1" },
  ];
  return (
    <div className="app"><div className="screen">
      <div className="testbanner"><i />TEST MODE · no real money</div>
      <div className="hero">
        <span className="orb o1" /><span className="orb o2" />
        <div className="hello" style={{ marginTop: 6 }}>{hello}</div>
        <div className="headline">{head}</div>
      </div>
      <div className="sheet">{children}</div>
      <nav className="nav" aria-label="Main">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className={path === i.href ? "on" : ""} aria-label={i.label} style={{ display: "contents" }}>
            <button className={path === i.href ? "on" : ""} tabIndex={-1}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={i.d} /></svg></button>
          </Link>
        ))}
      </nav>
    </div></div>
  );
}
