"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  isBackendRecentlyWarm,
  pingBackendHealth,
} from "@/lib/api/backend-health";
import ServerWarmupScreen from "@/components/warmup/ServerWarmupScreen";

type GateState = "checking" | "warming" | "ready";

type BackendWarmupGateProps = {
  children: ReactNode;
};

/**
 * Blocking gate for post-auth surfaces (e.g. `/chat`).
 * Auth pages should use WakeBackendOnMount instead so forms are not blocked.
 * Fast path: recent warm cache or quick health OK → children immediately.
 * Slow path: show ServerWarmupScreen until `/health` succeeds (cold start).
 */
export default function BackendWarmupGate({ children }: BackendWarmupGateProps) {
  const [state, setState] = useState<GateState>("checking");
  const [serverReady, setServerReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    const run = async () => {
      if (isBackendRecentlyWarm()) {
        if (!cancelled) setState("ready");
        return;
      }

      const quickOk = await pingBackendHealth({
        timeoutMs: 2_500,
        signal: ac.signal,
      });
      if (cancelled) return;
      if (quickOk) {
        setState("ready");
        return;
      }

      setState("warming");

      while (!cancelled) {
        const ok = await pingBackendHealth({
          timeoutMs: 90_000,
          signal: ac.signal,
        });
        if (cancelled) return;
        if (ok) {
          setServerReady(true);
          return;
        }
        await new Promise((r) => window.setTimeout(r, 1_500));
      }
    };

    void run();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

  if (state === "ready") {
    return <>{children}</>;
  }

  if (state === "warming") {
    return (
      <ServerWarmupScreen
        ready={serverReady}
        onComplete={() => setState("ready")}
      />
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#060608",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          border: "2px solid rgba(124,106,255,0.2)",
          borderTopColor: "#7c6aff",
          borderRadius: "50%",
          animation: "wu-gate-spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes wu-gate-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
