"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import VerifyEmailModal from "@/components/auth/VerifyEmailModal";
import { publicAppUrl } from "@/lib/site-url";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);

  const strength = getStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: publicAppUrl("/auth/signin?email_confirmed=1"),
        },
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      const session = data.session;
      if (session) {
        router.push("/chat");
        router.refresh();
      } else {
        setVerifyModalOpen(true);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setIsLoading(false);
    }
  };

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
                width={72}
                height={72}
                className="brand-gif"
                unoptimized
                priority
                style={{ width: "100%", height: "auto" }}
              />
            </div>
          </div>
          <div className="brand-text">
            <span className="brand-name">Iris AI</span>
            <span className="brand-tag">Powered by AI</span>
          </div>
        </div>

        <div className="auth-header">
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-subtitle">Start your journey with Iris AI</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form" autoComplete="off">
          {errorMessage && (
            <div className="auth-alert auth-alert-error" role="alert">
              {errorMessage}
            </div>
          )}
          {/* Email */}
          <div className="field-group">
            <label htmlFor="email" className="field-label">Email</label>
            <div className="field-input-wrap">
              <span className="field-icon"><EmailIcon /></span>
              <input
                id="email"
                type="email"
                autoComplete="off"
                required
                placeholder="you@example.com"
                className="field-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          {/* Password */}
          <div className="field-group">
            <label htmlFor="password" className="field-label">Password</label>
            <div className="field-input-wrap">
              <span className="field-icon"><LockIcon /></span>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
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
            {/* Strength meter */}
            {password.length > 0 && (
              <div className="strength-wrap">
                <div className="strength-bars">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`strength-bar ${i < strength.score ? `strength-${strength.level}` : ""}`}
                    />
                  ))}
                </div>
                <span className={`strength-label strength-label-${strength.level}`}>
                  {strength.label}
                </span>
              </div>
            )}
          </div>

          {/* Terms */}
          <label className="terms-row" htmlFor="terms">
            <input
              id="terms"
              type="checkbox"
              className="terms-check"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span className="terms-text">
              I agree to the{" "}
              <Link href="/terms" className="terms-link">Terms of Service</Link>
              {" "}and{" "}
              <Link href="/privacy" className="terms-link">Privacy Policy</Link>
            </span>
          </label>

          <button
            type="submit"
            id="signup-submit"
            className={`submit-btn ${isLoading ? "loading" : ""}`}
            disabled={isLoading || !agreed}
          >
            {isLoading ? <span className="spinner" /> : "Create account"}
          </button>
        </form>

        <div className="divider"><span>or sign up with</span></div>

        <div className="social-row">
          <button className="social-btn" aria-label="Sign up with Google">
            <GoogleIcon />
            Google
          </button>
          <button className="social-btn" aria-label="Sign up with GitHub">
            <GitHubIcon />
            GitHub
          </button>
        </div>

        <p className="switch-auth">
          Already have an account?{" "}
          <Link href="/auth/signin" className="switch-link">Sign in</Link>
        </p>
      </div>

      <VerifyEmailModal
        open={verifyModalOpen}
        email={email}
        onOkay={() => {
          setVerifyModalOpen(false);
          router.push("/auth/signin?check_email=1");
        }}
      />

      <style>{authStyles}</style>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────── */
function getStrength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const levels = ["weak", "fair", "good", "strong"] as const;
  const labels = ["Weak", "Fair", "Good", "Strong"];
  return { score, level: levels[score - 1] ?? "weak", label: labels[score - 1] ?? "Weak" };
}

/* ── Icons ────────────────────────────────────────── */


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

/* ── Styles ───────────────────────────────────────── */
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

  .brand {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 36px;
  }
  .brand-gif-ring {
    align-self: stretch;
    width: 72px;
    border-radius: 100px;
    background: linear-gradient(135deg, #7c6aff, #c084fc, #38bdf8);
    padding: 2px;
    flex-shrink: 0;
    box-shadow: 0 0 16px rgba(124, 106, 255, 0.4), 0 0 36px rgba(124, 106, 255, 0.12);
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
    width: 100%;
    height: auto;
    aspect-ratio: 1;
    object-fit: cover;
    display: block;
  }
  .brand-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .brand-name {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.5px;
    background: linear-gradient(90deg, #c4b5fd, #a78bfa, #818cf8);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    line-height: 1.2;
  }
  .brand-tag {
    font-size: 10.5px;
    color: #4a4a66;
    font-weight: 400;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }

  .auth-header { margin-bottom: 28px; }
  .auth-title {
    font-size: 24px;
    font-weight: 600;
    color: #f1f1f3;
    letter-spacing: -0.5px;
    margin: 0 0 6px;
  }
  .auth-subtitle { font-size: 14px; color: #7a7a8a; margin: 0; }

  .auth-form { display: flex; flex-direction: column; gap: 16px; }

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
  .auth-alert-info {
    background: rgba(124,106,255,0.09);
    border: 1px solid rgba(124,106,255,0.25);
    color: #c4b5fd;
  }
  .field-group { display: flex; flex-direction: column; gap: 7px; }
  .field-label { font-size: 13px; font-weight: 500; color: #b0b0c0; }

  .field-input-wrap { position: relative; display: flex; align-items: center; }
  .field-icon { position: absolute; left: 14px; color: #5a5a70; display: flex; pointer-events: none; }
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
    transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
  }
  .field-input::placeholder { color: #4a4a60; }
  .field-input:focus {
    border-color: rgba(124,106,255,0.6);
    background: rgba(255,255,255,0.07);
    box-shadow: 0 0 0 3px rgba(124,106,255,0.12);
  }
  .toggle-password {
    position: absolute; right: 12px; color: #5a5a70;
    background: none; border: none; cursor: pointer;
    display: flex; padding: 4px; border-radius: 6px; transition: color 0.2s;
  }
  .toggle-password:hover { color: #b0b0c0; }

  /* Strength meter */
  .strength-wrap { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
  .strength-bars { display: flex; gap: 4px; flex: 1; }
  .strength-bar {
    flex: 1; height: 3px; border-radius: 2px;
    background: rgba(255,255,255,0.1);
    transition: background 0.3s;
  }
  .strength-bar.strength-weak   { background: #f87171; }
  .strength-bar.strength-fair   { background: #fb923c; }
  .strength-bar.strength-good   { background: #facc15; }
  .strength-bar.strength-strong { background: #4ade80; }
  .strength-label { font-size: 11px; font-weight: 500; }
  .strength-label-weak   { color: #f87171; }
  .strength-label-fair   { color: #fb923c; }
  .strength-label-good   { color: #facc15; }
  .strength-label-strong { color: #4ade80; }

  /* Terms */
  .terms-row {
    display: flex; align-items: flex-start; gap: 10px;
    cursor: pointer; margin-top: 2px;
  }
  .terms-check {
    width: 15px; height: 15px; flex-shrink: 0; margin-top: 1px;
    accent-color: #7c6aff; cursor: pointer;
  }
  .terms-text { font-size: 13px; color: #7a7a8a; line-height: 1.5; }
  .terms-link { color: #7c6aff; text-decoration: none; }
  .terms-link:hover { color: #a78bfa; }

  .submit-btn {
    margin-top: 4px; height: 44px; width: 100%;
    background: linear-gradient(135deg, #7c6aff 0%, #9d8cff 100%);
    border: none; border-radius: 10px;
    color: #fff; font-size: 14px; font-weight: 500; font-family: inherit;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    letter-spacing: 0.1px;
    transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
    box-shadow: 0 4px 20px rgba(124,106,255,0.3);
  }
  .submit-btn:hover:not(:disabled) {
    opacity: 0.92; transform: translateY(-1px);
    box-shadow: 0 6px 24px rgba(124,106,255,0.4);
  }
  .submit-btn:active:not(:disabled) { transform: translateY(0); }
  .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .spinner {
    width: 18px; height: 18px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .divider {
    display: flex; align-items: center; gap: 12px;
    margin: 20px 0; color: #4a4a60; font-size: 12px;
  }
  .divider::before, .divider::after {
    content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.08);
  }

  .social-row { display: flex; gap: 10px; margin-bottom: 24px; }
  .social-btn {
    flex: 1; height: 42px;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    color: #b0b0c0; font-size: 13px; font-weight: 500; font-family: inherit;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s, color 0.2s;
  }
  .social-btn:hover {
    background: rgba(255,255,255,0.09);
    border-color: rgba(255,255,255,0.18);
    color: #f1f1f3;
  }

  .switch-auth { text-align: center; font-size: 13px; color: #5a5a70; margin: 0; }
  .switch-link { color: #7c6aff; text-decoration: none; font-weight: 500; transition: color 0.2s; }
  .switch-link:hover { color: #a78bfa; }

  @media (max-width: 480px) {
    .auth-card { padding: 32px 24px; }
    .auth-title { font-size: 22px; }
  }
`;
