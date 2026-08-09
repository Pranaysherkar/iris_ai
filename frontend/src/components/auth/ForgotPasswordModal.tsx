"use client";

import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/ui/ToastProvider";
import { publicAppUrl } from "@/lib/site-url";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { friendlyAuthError } from "@/lib/ui/friendly-messages";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function ForgotPasswordModal({ open, onClose }: Props) {
  const { showToast } = useToast();
  const [step, setStep] = useState<"form" | "sent">("form");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDismiss = useCallback(() => {
    setStep("form");
    setEmail("");
    setLoading(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleDismiss]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: publicAppUrl("/auth/reset-password"),
      });
      if (resetError) {
        showToast(
          friendlyAuthError(resetError.message) ||
            "Couldn’t send the reset link. Check your email and try again.",
          "error",
        );
        return;
      }
      setStep("sent");
      showToast("If an account exists for that email, we’ve sent a reset link.", "success");
    } catch (err) {
      showToast(
        friendlyAuthError(err instanceof Error ? err.message : "Something went wrong"),
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="forgot-modal-root" role="presentation">
      <button
        type="button"
        className="forgot-modal-backdrop"
        aria-label="Close"
        onClick={handleDismiss}
      />
      <div
        className="forgot-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="forgot-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "form" ? (
          <>
            <h2 id="forgot-modal-title" className="forgot-modal-title">
              Reset your password
            </h2>
            <p className="forgot-modal-desc">
              Enter the email for your account. We&apos;ll send a link to create a new password.
            </p>
            <form onSubmit={handleSubmit} className="forgot-modal-form">
              <label className="forgot-modal-label" htmlFor="forgot-email">
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                required
                className="forgot-modal-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button type="submit" className="forgot-modal-primary" disabled={loading}>
                {loading ? <span className="forgot-modal-spinner" /> : "Send reset link"}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="forgot-modal-sent-icon" aria-hidden>
              <SentIcon />
            </div>
            <h2 id="forgot-modal-title" className="forgot-modal-title">
              Check your email
            </h2>
            <p className="forgot-modal-desc">
              If an account exists for <strong>{email.trim()}</strong>, we sent a password reset
              link. Open the email and follow the link to choose a new password.
            </p>
            <button type="button" className="forgot-modal-primary" onClick={handleDismiss}>
              Okay
            </button>
          </>
        )}
      </div>
      <style>{modalStyles}</style>
    </div>
  );
}

function SentIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M22 12h-6l-2 3h-4l-2-3H2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const modalStyles = `
  .forgot-modal-root {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .forgot-modal-backdrop {
    position: absolute;
    inset: 0;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
    background: rgba(5, 5, 8, 0.72);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  .forgot-modal-dialog {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 400px;
    padding: 28px 28px 24px;
    border-radius: 18px;
    background: rgba(22, 22, 28, 0.98);
    border: 1px solid rgba(255,255,255,0.1);
    box-shadow: 0 24px 80px rgba(0,0,0,0.65);
  }
  .forgot-modal-title {
    margin: 0 0 10px;
    font-size: 20px;
    font-weight: 600;
    color: #f1f1f3;
    letter-spacing: -0.3px;
  }
  .forgot-modal-desc {
    margin: 0 0 20px;
    font-size: 14px;
    line-height: 1.55;
    color: #9a9aae;
  }
  .forgot-modal-desc strong {
    color: #d4d4e8;
    font-weight: 600;
  }
  .forgot-modal-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .forgot-modal-label {
    font-size: 13px;
    font-weight: 500;
    color: #b0b0c0;
  }
  .forgot-modal-input {
    width: 100%;
    box-sizing: border-box;
    padding: 11px 14px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    color: #f1f1f3;
    font-size: 14px;
    font-family: inherit;
    outline: none;
    margin-bottom: 8px;
  }
  .forgot-modal-input:focus {
    border-color: rgba(124,106,255,0.6);
    box-shadow: 0 0 0 3px rgba(124,106,255,0.12);
  }
  .forgot-modal-input::placeholder { color: #4a4a60; }
  .forgot-modal-error {
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 13px;
    line-height: 1.45;
    background: rgba(248,113,113,0.08);
    border: 1px solid rgba(248,113,113,0.25);
    color: #fca5a5;
    margin-bottom: 4px;
  }
  .forgot-modal-primary {
    width: 100%;
    height: 44px;
    border: none;
    border-radius: 10px;
    background: linear-gradient(135deg, #7c6aff 0%, #9d8cff 100%);
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 4px;
    box-shadow: 0 4px 20px rgba(124,106,255,0.35);
  }
  .forgot-modal-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .forgot-modal-spinner {
    width: 18px; height: 18px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: forgot-spin 0.7s linear infinite;
  }
  @keyframes forgot-spin { to { transform: rotate(360deg); } }
  .forgot-modal-sent-icon {
    display: flex;
    justify-content: center;
    margin-bottom: 14px;
    color: #a78bfa;
  }
`;
