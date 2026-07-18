"use client";

import { useEffect, useState } from "react";

import ServerWarmupScreen from "@/components/warmup/ServerWarmupScreen";

/**
 * Local UI preview: http://localhost:3000/dev/warmup
 * Simulates a health OK after ~8s so you can see progress complete.
 */
export default function WarmupPreviewPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 8_000);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <ServerWarmupScreen
      ready={ready}
      onComplete={() => {
        // Stay on preview; refresh to replay.
      }}
    />
  );
}
