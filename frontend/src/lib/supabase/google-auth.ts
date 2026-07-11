import { publicAppUrl } from "@/lib/site-url";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";

/**
 * Start Google OAuth (PKCE). Redirects the browser to Google, then back to
 * `/auth/callback` for `exchangeCodeForSession`.
 */
export async function signInWithGoogle(): Promise<{ error?: string }> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: publicAppUrl("/auth/callback?next=/chat"),
      queryParams: {
        access_type: "offline",
        prompt: "select_account",
      },
      scopes: "openid email profile",
    },
  });

  if (error) {
    return { error: error.message };
  }

  // Browser client usually navigates automatically when `data.url` is set;
  // ensure redirect if the environment does not.
  if (data.url && typeof window !== "undefined") {
    window.location.assign(data.url);
  }

  return {};
}
