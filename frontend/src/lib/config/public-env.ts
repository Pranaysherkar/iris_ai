/**
 * Browser-safe public configuration (NEXT_PUBLIC_*).
 */

export function getPublicApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!raw) {
    return "";
  }
  return raw.replace(/\/+$/, "");
}
