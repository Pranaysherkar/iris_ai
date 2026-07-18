const WARM_CACHE_KEY = "iris_backend_warm_at";
/** Skip re-warmup if we confirmed the API recently (under Render's ~15m idle sleep). */
const WARM_CACHE_TTL_MS = 10 * 60 * 1000;

/** Same-origin Next proxy — avoids browser CORS blocking Render `/health`. */
const HEALTH_PROXY_PATH = "/api/backend-health";

export function isBackendRecentlyWarm(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(WARM_CACHE_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < WARM_CACHE_TTL_MS;
  } catch {
    return false;
  }
}

export function markBackendWarm(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(WARM_CACHE_KEY, String(Date.now()));
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Ping backend health via Next.js proxy.
 * Resolves true when the upstream API responds OK (or API URL is unset).
 */
export async function pingBackendHealth(options?: {
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<boolean> {
  const timeoutMs = options?.timeoutMs ?? 90_000;
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort();
  options?.signal?.addEventListener("abort", onOuterAbort);

  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(HEALTH_PROXY_PATH, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
    } | null;
    if (data?.ok === false) return false;
    markBackendWarm();
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
    options?.signal?.removeEventListener("abort", onOuterAbort);
  }
}
