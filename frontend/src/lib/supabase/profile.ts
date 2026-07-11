import type { SupabaseClient, User } from "@supabase/supabase-js";

/** `true` when Supabase has confirmed the user's email (magic link / verification). */
export function isEmailVerified(user: User): boolean {
  return Boolean(user.email_confirmed_at);
}

function metaString(
  meta: Record<string, unknown> | undefined,
  ...keys: string[]
): string | null {
  if (!meta) return null;
  for (const key of keys) {
    const v = meta[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Display name from email/password signup or Google OAuth metadata. */
export function displayNameFromUser(user: User): string | null {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const fromMeta = metaString(meta, "full_name", "name", "preferred_username");
  if (fromMeta) return fromMeta;

  // Fallback: identity_data from Google provider
  const identities = user.identities ?? [];
  for (const identity of identities) {
    const data = identity.identity_data as Record<string, unknown> | undefined;
    const name = metaString(data, "full_name", "name");
    if (name) return name;
  }

  if (user.email) {
    const local = user.email.split("@")[0]?.trim();
    if (local) return local;
  }
  return null;
}

function hasGoogleIdentity(user: User): boolean {
  if (user.app_metadata?.provider === "google") return true;
  return (user.identities ?? []).some((i) => i.provider === "google");
}

/** Maps signup metadata keys (`full_name`, `dob`) to `public.profiles` columns. */
export async function upsertProfileRow(
  supabase: SupabaseClient,
  userId: string,
  fullName: string,
  dobIso: string,
  onboardingCompleted: boolean,
) {
  const full_name = fullName.trim() || null;
  const date_of_birth = dobIso.trim() || null;

  return supabase.from("profiles").upsert(
    {
      id: userId,
      full_name,
      date_of_birth,
      onboarding_completed: onboardingCompleted,
    },
    { onConflict: "id" },
  );
}

/**
 * Keeps `profiles` aligned with auth: name/dob from metadata (email signup or Google)
 * and `onboarding_completed` when the email is verified / Google provider.
 */
export async function syncProfileFromUser(
  supabase: SupabaseClient,
  user: User,
) {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const full_name = displayNameFromUser(user) ?? "";
  const dobRaw = metaString(meta, "dob") ?? "";
  const onboarding_completed =
    isEmailVerified(user) || hasGoogleIdentity(user);

  // Always upsert so Google-first users get a profiles row even without DOB.
  return upsertProfileRow(
    supabase,
    user.id,
    full_name,
    dobRaw,
    onboarding_completed,
  );
}
