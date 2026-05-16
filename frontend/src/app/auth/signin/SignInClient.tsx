"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import ForgotPasswordModal from "@/components/auth/ForgotPasswordModal";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";

export default function SignInClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkEmail = searchParams.get("check_email") === "1";
  const emailConfirmedQuery = searchParams.get("email_confirmed") === "1";
  const passwordReset = searchParams.get("password_reset") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [forgotModalOpen, setForgotModalOpen] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    const goToApp = () => {
      router.replace("/chat");
      router.refresh();
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session?.user) {
        goToApp();
        return;
      }
      setAuthChecked(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        goToApp();
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      router.push("/chat");
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setIsLoading(false);
    }
  };

  if (!authChecked) {
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
            animation: "signin-auth-spin 0.8s linear infinite",
          }}
        />
        <style>{`
          ${authStyles}
          @keyframes signin-auth-spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  const showEmailConfirmedBanner = emailConfirmedQuery && !checkEmail;

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
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-subtitle">Sign in to continue to Iris AI</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form" autoComplete="off">
          {errorMessage && (
            <div className="auth-alert auth-alert-error" role="alert">
              {errorMessage}
            </div>
          )}
          {checkEmail && (
            <div className="auth-alert auth-alert-info" role="status">
              Check your inbox for the verification link. After you confirm your email, sign in below.
            </div>
          )}
          {showEmailConfirmedBanner && (
            <div className="auth-alert auth-alert-success" role="status">
              Your email is verified. Sign in with your password below.
            </div>
          )}
          {passwordReset && (
            <div className="auth-alert auth-alert-success" role="status">
              Your password was updated. Sign in with your new password.
            </div>
          )}
          <div className="field-group">
            <label htmlFor="email" className="field-label">
              Email
            </label>
            <div className="field-input-wrap">
              <span className="field-icon">
                <EmailIcon />
              </span>
              <input
                id="email"
                type="email"
                name="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                className="field-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="field-group">
            <div className="field-label-row">
              <label htmlFor="password" className="field-label">
                Password
              </label>
              <button
                type="button"
                className="forgot-link"
                onClick={() => setForgotModalOpen(true)}
              >
                Forgot password?
              </button>
            </div>
            <div className="field-input-wrap">
              <span className="field-icon">
                <LockIcon />
              </span>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
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

          <button
            type="submit"
            className={`submit-btn ${isLoading ? "loading" : ""}`}
            disabled={isLoading}
          >
            {isLoading ? <span className="spinner" /> : "Sign in"}
          </button>
        </form>

        <div className="divider">
          <span>or continue with</span>
        </div>

        <div className="social-row">
          <button type="button" className="social-btn" aria-label="Sign in with Google">
            <GoogleIcon />
            Google
          </button>
          <button type="button" className="social-btn" aria-label="Sign in with GitHub">
            <GitHubIcon />
            GitHub
          </button>
        </div>

        <p className="switch-auth">
          Don&apos;t have an account?{" "}
          <Link href="/auth/signup" className="switch-link">
            Create one
          </Link>
        </p>
      </div>

      <ForgotPasswordModal open={forgotModalOpen} onClose={() => setForgotModalOpen(false)} />

      <style>{authStyles}</style>
    </div>
  );
}

function EmailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="3" />
      <polyline points="2,4 12,13 22,4" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
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
    animation-delay: 0s;
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
    box-shadow:
      0 0 0 1px rgba(255,255,255,0.04) inset,
      0 32px 80px rgba(0,0,0,0.55);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 26px;
  }
  .brand-gif-ring {
    width: 60px;
    height: 38px;
    border-radius: 100px;
    background: linear-gradient(135deg, #7c6aff, #c084fc, #38bdf8);
    padding: 1.5px;
    flex-shrink: 0;
    box-shadow: 0 0 12px rgba(124, 106, 255, 0.4), 0 0 28px rgba(124, 106, 255, 0.1);
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
  .brand-text {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .brand-name {
    font-size: 16.5px;
    font-weight: 700;
    letter-spacing: -0.4px;
    background: linear-gradient(90deg, #c4b5fd, #a78bfa, #818cf8);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    line-height: 1.2;
  }
  .brand-tag {
    font-size: 9px;
    color: #4a4a66;
    font-weight: 400;
    letter-spacing: 0.3px;
    text-transform: uppercase;
  }

  .auth-header { margin-bottom: 24px; }
  .auth-title {
    font-size: 20px;
    font-weight: 600;
    color: #f1f1f3;
    letter-spacing: -0.4px;
    margin: 0 0 4px;
  }
  .auth-subtitle {
    font-size: 12.5px;
    color: #7a7a8a;
    margin: 0;
  }

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
  .auth-alert-success {
    background: rgba(74, 222, 128, 0.09);
    border: 1px solid rgba(74, 222, 128, 0.28);
    color: #86efac;
  }
  .auth-alert-info {
    background: rgba(124,106,255,0.09);
    border: 1px solid rgba(124,106,255,0.25);
    color: #c4b5fd;
  }

  .field-group { display: flex; flex-direction: column; gap: 7px; }

  .field-label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .field-label {
    font-size: 12.5px;
    font-weight: 500;
    color: #b0b0c0;
    letter-spacing: 0.1px;
  }
  .forgot-link {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    cursor: pointer;
    font-size: 12px;
    color: #7c6aff;
    text-decoration: none;
    transition: color 0.2s;
  }
  .forgot-link:hover { color: #a78bfa; }

  .field-input-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }
  .field-icon {
    position: absolute;
    left: 14px;
    color: #5a5a70;
    display: flex;
    pointer-events: none;
  }
  .field-input {
    width: 100%;
    padding: 10px 14px 10px 38px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 9px;
    color: #f1f1f3;
    font-size: 13.5px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
  }
  .field-input::placeholder { color: #4a4a60; }
  .field-input:focus {
    border-color: rgba(124, 106, 255, 0.6);
    background: rgba(255,255,255,0.07);
    box-shadow: 0 0 0 3px rgba(124,106,255,0.12);
  }
  .toggle-password {
    position: absolute;
    right: 12px;
    color: #5a5a70;
    background: none;
    border: none;
    cursor: pointer;
    display: flex;
    padding: 4px;
    border-radius: 6px;
    transition: color 0.2s;
  }
  .toggle-password:hover { color: #b0b0c0; }

  .submit-btn {
    margin-top: 4px;
    height: 40px;
    width: 100%;
    background: linear-gradient(135deg, #7c6aff 0%, #9d8cff 100%);
    border: none;
    border-radius: 9px;
    color: #fff;
    font-size: 13.5px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    letter-spacing: 0.1px;
    transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
    box-shadow: 0 4px 20px rgba(124,106,255,0.3);
  }
  .submit-btn:hover:not(:disabled) {
    opacity: 0.92;
    transform: translateY(-1px);
    box-shadow: 0 6px 24px rgba(124,106,255,0.4);
  }
  .submit-btn:active:not(:disabled) { transform: translateY(0); }
  .submit-btn:disabled { opacity: 0.65; cursor: not-allowed; }

  .spinner {
    width: 18px; height: 18px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 22px 0;
    color: #4a4a60;
    font-size: 12px;
  }
  .divider::before, .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(255,255,255,0.08);
  }

  .social-row {
    display: flex;
    gap: 10px;
    margin-bottom: 24px;
  }
  .social-btn {
    flex: 1;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 9px;
    color: #b0b0c0;
    font-size: 12.5px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s, color 0.2s;
  }
  .social-btn:hover {
    background: rgba(255,255,255,0.09);
    border-color: rgba(255,255,255,0.18);
    color: #f1f1f3;
  }

  .switch-auth {
    text-align: center;
    font-size: 12.5px;
    color: #5a5a70;
    margin: 0;
  }
  .switch-link {
    color: #7c6aff;
    text-decoration: none;
    font-weight: 500;
    transition: color 0.2s;
  }
  .switch-link:hover { color: #a78bfa; }

  @media (max-width: 480px) {
    .auth-card { padding: 32px 24px; }
    .auth-title { font-size: 22px; }
  }
`;
