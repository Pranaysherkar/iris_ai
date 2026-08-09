"use client";

import { useEffect } from "react";

import { wakeBackendInBackground } from "@/lib/api/backend-health";

/**
 * Starts a silent Render/API wake on mount. Renders nothing — use on
 * login/register so the form shows immediately while cold-start runs.
 * Blocking warmup card remains on `/chat` via BackendWarmupGate.
 */
export default function WakeBackendOnMount() {
  useEffect(() => {
    wakeBackendInBackground();
  }, []);

  return null;
}
