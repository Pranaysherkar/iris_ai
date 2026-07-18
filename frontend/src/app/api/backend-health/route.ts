import { NextResponse } from "next/server";

/**
 * Same-origin proxy for Render `/health`.
 * Browser CORS often blocks direct cross-origin reads even when Render logs 200 —
 * this route fetches from the Next server so warmup can complete reliably.
 */
export async function GET() {
  const base = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, "");
  if (!base) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);

  try {
    const res = await fetch(`${base}/health`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, status: res.status },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "health_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  } finally {
    clearTimeout(timer);
  }
}
