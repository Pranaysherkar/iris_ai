import type { SupabaseClient, User } from "@supabase/supabase-js";

/** `true` when Supabase has confirmed the user's email (magic link / verification). */
export function isEmailVerified(user: User): boolean {
  return Boolean(user.email_confirmed_at);
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
 * Keeps `profiles` aligned with auth: name/dob from metadata and
 * `onboarding_completed` when the email is verified.
 */
export async function syncProfileFromUser(
  supabase: SupabaseClient,
  user: User,
) {
  const onboarding_completed = isEmailVerified(user);
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const full_name =
    typeof meta?.full_name === "string" ? meta.full_name.trim() || null : null;
  const dobRaw = typeof meta?.dob === "string" ? meta.dob.trim() : "";
  const date_of_birth = dobRaw || null;

  if (full_name || date_of_birth) {
    return upsertProfileRow(
      supabase,
      user.id,
      full_name ?? "",
      date_of_birth ?? "",
      onboarding_completed,
    );
  }

  return supabase
    .from("profiles")
    .update({ onboarding_completed })
    .eq("id", user.id);
}
