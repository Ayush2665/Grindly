"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { ArtDefs } from "./art";
import { Icon, type IconName } from "./icons";

const NAV: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/", label: "Home", icon: "flame" },
  { href: "/today", label: "Today", icon: "steps" },
  { href: "/create", label: "Create goal", icon: "plus" },
  { href: "/wallet", label: "Wallet", icon: "wallet" },
  { href: "/watch", label: "Watch", icon: "watch" },
];

// FRONTEND: the page frame (test-mode banner, orange header that fades as you scroll, bottom nav). Every screen uses it.
export function Shell({ hello, head, children }: { hello: string; head: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  const screen = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const on = () => screen.current?.style.setProperty("--sp", Math.min(1, scrollY / 160).toFixed(3));
    on();
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  const active = path === "/norisk" ? "/" : path;
  return (
    <div className="app">
      <div className="screen" ref={screen}>
        <ArtDefs />
        <div className="testbanner"><i />TEST MODE · no real money</div>
        <div className="hero">
          <span className="orb o1" /><span className="orb o2" />
          <div className="hello" style={{ marginTop: 6 }}>{hello}</div>
          <div className="headline">{head}</div>
        </div>
        <div className="sheet">{children}</div>
        <nav className="nav" aria-label="Main">
          {NAV.map((i) => (
            <Link key={i.href} href={i.href} aria-label={i.label} style={{ display: "contents" }}>
              <button className={active === i.href ? "on" : ""} tabIndex={-1} aria-hidden="true"><Icon name={i.icon} /></button>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
