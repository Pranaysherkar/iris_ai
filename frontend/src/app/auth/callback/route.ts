import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server-client";

/**
 * OAuth / PKCE callback — exchanges `?code=` for a session cookie, then redirects.
 * @see https://supabase.com/docs/guides/auth/social-login/auth-google
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  let next = searchParams.get("next") ?? "/chat";
  if (!next.startsWith("/")) {
    next = "/chat";
  }

  if (errorParam) {
    const msg = encodeURIComponent(errorDescription || errorParam);
    return NextResponse.redirect(
      `${origin}/auth/signin?oauth_error=${msg}`,
    );
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      }
      if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
    const msg = encodeURIComponent(error.message);
    return NextResponse.redirect(
      `${origin}/auth/signin?oauth_error=${msg}`,
    );
  }

  return NextResponse.redirect(
    `${origin}/auth/signin?oauth_error=${encodeURIComponent("Missing OAuth code")}`,
  );
}
