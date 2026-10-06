"use client";
import { useState } from "react";
import { api } from "./client";
import { Shell } from "./Shell";

// FRONTEND: dev-only sign in. Real accounts (Supabase Auth) come later.
export function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  async function go(e: React.FormEvent) {
    e.preventDefault();
    const r = await api("/api/dev/login", { email, name });
    if (r.ok) onDone(); else setErr(r.status === 404 ? "Dev sign-in is switched off." : "Enter a name and a valid email.");
  }
  return (
    <Shell hello="Welcome" head={<>Show up daily.<br />Your Watch keeps score.</>}>
      <form onSubmit={go} className="rv in">
        <h2>Sign in (dev)</h2>
        <div className="sub" style={{ marginBottom: 14 }}>Test accounts only. No password in this phase.</div>
        <input className="input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
        <input className="input" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {err && <div className="note">{err}</div>}
        <button className="btn" type="submit">Continue</button>
      </form>
    </Shell>
  );
}
