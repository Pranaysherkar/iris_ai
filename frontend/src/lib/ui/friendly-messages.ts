/** Map technical API / Supabase / OAuth errors to short user-facing copy. */

export function friendlyAuthError(raw: string | null | undefined): string {
  const text = (raw || "").trim();
  const t = text.toLowerCase();

  if (!text) return "Something went wrong. Please try again.";

  if (
    t.includes("pkce") ||
    t.includes("code verifier") ||
    (t.includes("oauth") && t.includes("storage"))
  ) {
    return "Google sign-in didn’t finish. Please try Google again.";
  }
  if (t.includes("missing oauth code")) {
    return "Google sign-in didn’t finish. Please try Google again.";
  }
  if (
    t.includes("invalid login") ||
    t.includes("invalid credentials") ||
    t.includes("email not confirmed") ||
    t.includes("invalid email or password")
  ) {
    if (t.includes("email not confirmed")) {
      return "Please verify your email before signing in. Check your inbox for the link.";
    }
    return "Email or password is incorrect. Please try again.";
  }
  if (t.includes("user already registered") || t.includes("already been registered")) {
    return "An account with this email already exists. Please sign in instead.";
  }
  if (t.includes("password") && (t.includes("weak") || t.includes("least") || t.includes("short"))) {
    return "Please choose a stronger password (at least 8 characters).";
  }
  if (t.includes("rate limit") || t.includes("too many requests")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (t.includes("network") || t.includes("fetch failed")) {
    return "Network issue. Check your connection and try again.";
  }

  // Avoid dumping long technical strings
  if (
    t.includes("jwt") ||
    t.includes("pkce") ||
    t.includes("supabase") ||
    t.includes("stack") ||
    text.length > 160
  ) {
    return "Something went wrong. Please try again.";
  }

  return text;
}

export function friendlyUploadError(raw: string | null | undefined): string {
  const text = (raw || "").trim();
  const t = text.toLowerCase();
  if (!text) return "Upload failed. Please try again.";
  if (t.includes("unsupported") || t.includes("file type") || t.includes("use pdf")) {
    return text; // already user-facing from ChatInput
  }
  if (t.includes("too large") || t.includes("413") || t.includes("payload")) {
    return "That file is too large. Try a smaller file.";
  }
  if (text.length > 120 || t.includes("exception") || t.includes("traceback")) {
    return "Upload failed. Please try again.";
  }
  return text;
}

export function friendlyChatNotice(raw: string): { message: string; kind: "error" | "warning" | "success" } {
  const t = raw.toLowerCase();
  if (t.includes("reached the limit")) {
    return { message: raw, kind: "warning" };
  }
  return { message: raw, kind: "error" };
}

/** Soften edit/branch messages that still say "Edit failed:". */
export function friendlyEditError(raw: string): string {
  const t = raw.toLowerCase();
  if (t.includes("reached the limit") || t.includes("3 versions")) {
    return "You've reached the limit of 3 versions for this message.";
  }
  if (t.includes("still saving")) {
    return "This message is still saving. Try Edit again in a moment.";
  }
  if (t.includes("save a reply") || t.includes("before editing")) {
    return "Send a reply first, then you can edit.";
  }
  if (t.includes("not found")) {
    return "That message wasn’t found. Refresh the chat and try again.";
  }
  if (t.includes("not signed in") || t.includes("sign in again")) {
    return "You are not signed in. Please sign in again.";
  }
  if (t.includes("switch version") || t.includes("couldn’t switch") || t.includes("couldn't switch")) {
    return "Couldn’t switch versions. Please try again.";
  }
  if (t.startsWith("edit failed:")) {
    return "Couldn’t edit this message. Please try again.";
  }
  return raw;
}
