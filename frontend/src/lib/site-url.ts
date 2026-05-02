/**
 * Canonical site origin for redirects (Supabase emailRedirectTo, OAuth, etc.).
 * Set NEXT_PUBLIC_APP_URL in each environment (no trailing slash), e.g.
 *   http://localhost:3000
 *   https://app.example.com
 */
export function getPublicAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw) {
    return raw.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:3000";
}

/** Absolute URL for a path (must start with `/`). Safe for Supabase `redirectTo` / `emailRedirectTo`. */
export function publicAppUrl(path: string): string {
  const base = getPublicAppUrl();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}
