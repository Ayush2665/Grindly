"use client";
import { useCallback, useEffect, useState } from "react";
import { api, type Me } from "./client";

// FRONTEND: loads who is signed in, the Watch status and today's verdict. Refreshes on demand.
export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<"loading" | "signedOut" | "ready">("loading");
  const refresh = useCallback(async () => {
    const r = await api<Me>("/api/v1/me");
    if (r.status === 401) { setMe(null); setState("signedOut"); return; }
    setMe(r.data); setState("ready");
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { me, state, refresh };
}
