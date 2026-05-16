"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";

type Phase = "loading" | "ready" | "invalid";

export default function ResetPasswordClient() {
  const router = useRouter();
  const recoveryRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    const fallbackTimer = setTimeout(() => {
      if (cancelled || recoveryRef.current) return;
      setPhase((p) => (p === "loading" ? "invalid" : p));
    }, 6000);

    const markReady = (nextEmail: string) => {
      if (cancelled || recoveryRef.current) return;
      recoveryRef.current = true;
      clearTimeout(fallbackTimer);
      setEmail(nextEmail);
      setPhase("ready");
    };

    const onAuth = (event: AuthChangeEvent, session: Session | null) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" && session?.user?.email) {
        markReady(session.user.email);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange(onAuth);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session?.user?.email) return;
      if (typeof window === "undefined") return;
      const search = new URLSearchParams(window.location.search);
      const recoveryParam = search.get("type") === "recovery";
      if (window.location.hash.includes("recovery") || recoveryParam) {
        markReady(session.user.email);
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErrorMessage("Passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      await supabase.auth.signOut();
      router.replace("/auth/signin?password_reset=1");
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setSaving(false);
    }
  };

  if (phase === "loading") {
    return (
      <div className="auth-root">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            width: 36,
            height: 36,
            border: "2px solid rgba(124,106,255,0.2)",
            borderTopColor: "#7c6aff",
            borderRadius: "50%",
            animation: "reset-spin 0.8s linear infinite",
          }}
        />
        <style>{`${authStyles}\n@keyframes reset-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <div className="auth-root">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
        <div className="auth-card">
          <div className="brand">
            <div className="brand-gif-ring">
              <div className="brand-gif-inner">
                <Image
                  src="/iris.gif"
                  alt="Iris"
                  width={84}
                  height={52}
                  className="brand-gif"
                  unoptimized
                  priority
                  style={{ width: "auto", height: "100%", objectFit: "contain" }}
                />
              </div>
            </div>
            <div className="brand-text">
              <span className="brand-name">Iris AI</span>
              <span className="brand-tag">Powered by AI</span>
            </div>
          </div>
          <div className="auth-header">
            <h1 className="auth-title">Link invalid or expired</h1>
            <p className="auth-subtitle">
              Request a new reset link from the sign-in page, or open the latest email from us.
            </p>
          </div>
          <Link href="/auth/signin" className="submit-btn" style={{ textAlign: "center", textDecoration: "none" }}>
            Back to sign in
          </Link>
        </div>
        <style>{authStyles}</style>
      </div>
    );
  }

  return (
    <div className="auth-root">
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />

      <div className="auth-card">
        <div className="brand">
          <div className="brand-gif-ring">
            <div className="brand-gif-inner">
              <Image
                  src="/iris.gif"
                  alt="Iris"
                  width={84}
                  height={52}
                  className="brand-gif"
                  unoptimized
                  priority
                  style={{ width: "auto", height: "100%", objectFit: "contain" }}
                />
            </div>
          </div>
          <div className="brand-text">
            <span className="brand-name">Iris AI</span>
            <span className="brand-tag">Powered by AI</span>
          </div>
        </div>

        <div className="auth-header">
          <h1 className="auth-title">Create new password</h1>
          <p className="auth-subtitle">Choose a strong password for your account.</p>
        </div>

        <form onSubmit={handleSetPassword} className="auth-form" autoComplete="off">
          {errorMessage && (
            <div className="auth-alert auth-alert-error" role="alert">
              {errorMessage}
            </div>
          )}

          <div className="field-group">
            <label htmlFor="reset-email" className="field-label">
              Email
            </label>
            <div className="field-input-wrap">
              <span className="field-icon">
                <EmailIcon />
              </span>
              <input
                id="reset-email"
                type="email"
                readOnly
                tabIndex={-1}
                className="field-input field-input-readonly"
                value={email}
              />
            </div>
          </div>

          <div className="field-group">
            <label htmlFor="reset-password" className="field-label">
              New password
            </label>
            <div className="field-input-wrap">
              <span className="field-icon">
                <LockIcon />
              </span>
              <input
                id="reset-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="Min. 8 characters"
                className="field-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <div className="field-group">
            <label htmlFor="reset-confirm" className="field-label">
              Confirm new password
            </label>
            <div className="field-input-wrap">
              <span className="field-icon">
                <LockIcon />
              </span>
              <input
                id="reset-confirm"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="Repeat password"
                className="field-input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          </div>

          <button type="submit" className={`submit-btn ${saving ? "loading" : ""}`} disabled={saving}>
            {saving ? <span className="spinner" /> : "Change password"}
          </button>
        </form>

        <p className="switch-auth">
          <Link href="/auth/signin" className="switch-link">
            Back to sign in
          </Link>
        </p>
      </div>

      <style>{`${authStyles}\n.field-input-readonly { opacity: 0.85; cursor: not-allowed; }`}</style>
    </div>
  );
}

function EmailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="2" y="4" width="20" height="16" rx="3" />
      <polyline points="2,4 12,13 22,4" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

const authStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');

  .auth-root {
    position: relative;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0d0d10;
    font-family: 'Inter', system-ui, sans-serif;
    overflow: hidden;
    padding: 24px;
  }

  .blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(90px);
    opacity: 0.18;
    pointer-events: none;
    animation: blobDrift 12s ease-in-out infinite alternate;
  }
  .blob-1 {
    width: 520px; height: 520px;
    background: radial-gradient(circle, #7c6aff 0%, transparent 70%);
    top: -120px; left: -100px;
  }
  .blob-2 {
    width: 400px; height: 400px;
    background: radial-gradient(circle, #e8a87c 0%, transparent 70%);
    bottom: -80px; right: -80px;
    animation-delay: -4s;
  }
  .blob-3 {
    width: 280px; height: 280px;
    background: radial-gradient(circle, #5cc4d8 0%, transparent 70%);
    top: 50%; left: 60%;
    animation-delay: -8s;
  }
  @keyframes blobDrift {
    from { transform: translate(0, 0) scale(1); }
    to   { transform: translate(30px, 20px) scale(1.08); }
  }

  .auth-card {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 420px;
    background: rgba(255,255,255,0.035);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 20px;
    padding: 44px 40px;
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    box-shadow: 0 0 0 1px rgba(255,255,255,0.04) inset, 0 32px 80px rgba(0,0,0,0.55);
  }

  .brand { display: flex; align-items: center; gap: 14px; margin-bottom: 36px; }
  .brand-gif-ring {
    width: 84px;
    height: 52px;
    border-radius: 100px;
    background: linear-gradient(135deg, #7c6aff, #c084fc, #38bdf8);
    padding: 2px;
    flex-shrink: 0;
    box-shadow: 0 0 16px rgba(124, 106, 255, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .brand-gif-inner {
    width: 100%;
    height: 100%;
    border-radius: 100px;
    background: #0d0d10;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .brand-gif {
    height: 100%;
    width: auto;
    object-fit: contain;
    display: block;
  }
  .brand-text { display: flex; flex-direction: column; gap: 2px; }
  .brand-name {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.5px;
    background: linear-gradient(90deg, #c4b5fd, #a78bfa, #818cf8);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .brand-tag {
    font-size: 10.5px;
    color: #4a4a66;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .auth-header { margin-bottom: 28px; }
  .auth-title {
    font-size: 24px;
    font-weight: 600;
    color: #f1f1f3;
    margin: 0 0 6px;
    letter-spacing: -0.5px;
  }
  .auth-subtitle { font-size: 14px; color: #7a7a8a; margin: 0; line-height: 1.5; }

  .auth-form { display: flex; flex-direction: column; gap: 18px; }

  .auth-alert {
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 13px;
    line-height: 1.45;
  }
  .auth-alert-error {
    background: rgba(248,113,113,0.08);
    border: 1px solid rgba(248,113,113,0.25);
    color: #fca5a5;
  }

  .field-group { display: flex; flex-direction: column; gap: 7px; }
  .field-label { font-size: 13px; font-weight: 500; color: #b0b0c0; }
  .field-input-wrap { position: relative; display: flex; align-items: center; }
  .field-icon {
    position: absolute;
    left: 14px;
    color: #5a5a70;
    display: flex;
    pointer-events: none;
  }
  .field-input {
    width: 100%;
    padding: 11px 14px 11px 40px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    color: #f1f1f3;
    font-size: 14px;
    font-family: inherit;
    outline: none;
  }
  .field-input:focus {
    border-color: rgba(124, 106, 255, 0.6);
    box-shadow: 0 0 0 3px rgba(124,106,255,0.12);
  }
  .field-input::placeholder { color: #4a4a60; }
  .toggle-password {
    position: absolute;
    right: 12px;
    background: none;
    border: none;
    color: #5a5a70;
    cursor: pointer;
    padding: 4px;
  }

  .submit-btn {
    margin-top: 4px;
    height: 44px;
    width: 100%;
    background: linear-gradient(135deg, #7c6aff 0%, #9d8cff 100%);
    border: none;
    border-radius: 10px;
    color: #fff;
    font-size: 14px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 20px rgba(124,106,255,0.3);
  }
  .submit-btn:hover { opacity: 0.95; }
  .submit-btn:disabled { opacity: 0.65; cursor: not-allowed; }

  .spinner {
    width: 18px; height: 18px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .switch-auth { text-align: center; margin-top: 20px; font-size: 13px; color: #5a5a70; }
  .switch-link { color: #7c6aff; text-decoration: none; font-weight: 500; }
  .switch-link:hover { color: #a78bfa; }

  @media (max-width: 480px) {
    .auth-card { padding: 32px 24px; }
    .auth-title { font-size: 22px; }
  }
`;
