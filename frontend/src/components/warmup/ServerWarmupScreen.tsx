"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const DEFAULT_PHRASES = [
  "Connecting secure services…",
  "Loading your workspace…",
  "Syncing intelligence…",
  "Almost there…",
  "Preparing your experience…",
];

export type ServerWarmupScreenProps = {
  /**
   * When true, progress finishes to 100% and `onComplete` fires.
   * Used when the backend health ping succeeds.
   */
  ready?: boolean;
  /** Soft ceiling while waiting for `ready` (default ~88%). */
  waitCapPercent?: number;
  /** Max time to crawl toward the wait cap (visual only). */
  durationMs?: number;
  phrases?: string[];
  onComplete?: () => void;
};

export default function ServerWarmupScreen({
  ready = false,
  waitCapPercent = 88,
  durationMs = 75_000,
  phrases = DEFAULT_PHRASES,
  onComplete,
}: ServerWarmupScreenProps) {
  const [progress, setProgress] = useState(0);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [phraseVisible, setPhraseVisible] = useState(true);
  const [dots, setDots] = useState(0);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Crawl progress toward waitCap while waiting; jump to 100 when ready.
  useEffect(() => {
    if (ready) {
      setProgress(100);
      if (!completedRef.current) {
        completedRef.current = true;
        const t = window.setTimeout(() => onCompleteRef.current?.(), 420);
        return () => window.clearTimeout(t);
      }
      return;
    }

    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / durationMs);
      const eased = 1 - (1 - t) ** 1.45;
      setProgress(Math.round(eased * waitCapPercent));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ready, durationMs, waitCapPercent]);

  useEffect(() => {
    if (phrases.length <= 1) return;
    const id = window.setInterval(() => {
      setPhraseVisible(false);
      window.setTimeout(() => {
        setPhraseIndex((i) => (i + 1) % phrases.length);
        setPhraseVisible(true);
      }, 350);
    }, 3500);
    return () => window.clearInterval(id);
  }, [phrases]);

  useEffect(() => {
    const id = window.setInterval(() => setDots((d) => (d + 1) % 4), 480);
    return () => window.clearInterval(id);
  }, []);

  const phrase = phrases[phraseIndex] ?? DEFAULT_PHRASES[0];
  const dotStr = ".".repeat(dots);

  return (
    <div className="wu-root" role="status" aria-live="polite" aria-busy="true">
      <div className="wu-ambient wu-ambient-1" />
      <div className="wu-ambient wu-ambient-2" />
      <div className="wu-ambient wu-ambient-3" />
      <div className="wu-grid" />

      <div className="wu-orbit-wrap">
        <div className="wu-orbit wu-orbit-1" />
        <div className="wu-orbit wu-orbit-2" />
      </div>

      <div className="wu-card">
        <div className="wu-card-glow" />

        <div className="wu-logo-wrap">
          <div className="wu-logo-pulse" />
          <div className="wu-logo-ring">
            <div className="wu-logo-inner">
              <Image
                src="/iris.gif"
                alt="Iris"
                width={110}
                height={66}
                unoptimized
                priority
                style={{ width: "auto", height: "100%", objectFit: "contain" }}
              />
            </div>
          </div>
        </div>

        <div className="wu-brand">
          <span className="wu-brand-name">Iris AI</span>
        </div>

        <div className="wu-divider" />

        <div className="wu-copy">
          <h1 className="wu-title">
            Getting things ready
            <span className="wu-dots" aria-hidden="true">{dotStr}</span>
          </h1>
          <p className={`wu-phrase ${phraseVisible ? "wu-phrase-in" : "wu-phrase-out"}`}>
            {phrase}
          </p>
        </div>

        <div className="wu-progress-wrap">
          <div
            className="wu-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div className="wu-fill" style={{ width: `${progress}%` }}>
              <div className="wu-fill-glow" />
            </div>
          </div>
          <div className="wu-meta">
            <span className="wu-meta-label">Initializing</span>
            <span className="wu-meta-pct">{progress}%</span>
          </div>
        </div>

        <div className="wu-steps" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`wu-step ${progress >= (i + 1) * 25 ? "wu-step-done" : progress >= i * 25 ? "wu-step-active" : ""}`}
            />
          ))}
        </div>
      </div>

      <style>{styles}</style>
    </div>
  );
}

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

  .wu-root {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    font-family: 'Inter', system-ui, sans-serif;
    background: #060608;
    color: #f1f1f3;
    overflow: hidden;
  }

  .wu-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(124,106,255,0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(124,106,255,0.025) 1px, transparent 1px);
    background-size: 48px 48px;
    pointer-events: none;
    mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, black 30%, transparent 100%);
    -webkit-mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, black 30%, transparent 100%);
  }

  .wu-ambient {
    position: absolute;
    border-radius: 50%;
    filter: blur(90px);
    pointer-events: none;
  }
  .wu-ambient-1 {
    width: 480px; height: 480px;
    background: radial-gradient(circle, rgba(124,106,255,0.22) 0%, transparent 70%);
    top: -120px; left: -100px;
    animation: wu-drift 16s ease-in-out infinite;
  }
  .wu-ambient-2 {
    width: 380px; height: 380px;
    background: radial-gradient(circle, rgba(99,102,241,0.16) 0%, transparent 70%);
    bottom: -80px; right: -60px;
    animation: wu-drift 20s ease-in-out infinite reverse;
  }
  .wu-ambient-3 {
    width: 260px; height: 260px;
    background: radial-gradient(circle, rgba(167,139,250,0.12) 0%, transparent 70%);
    top: 40%; left: 58%;
    animation: wu-drift 13s ease-in-out infinite 3s;
  }

  .wu-orbit-wrap {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
  .wu-orbit {
    position: absolute;
    border-radius: 50%;
    border: 1px solid rgba(124,106,255,0.07);
  }
  .wu-orbit-1 {
    width: 520px; height: 520px;
    animation: wu-spin 28s linear infinite;
    border-top-color: rgba(124,106,255,0.18);
  }
  .wu-orbit-2 {
    width: 720px; height: 720px;
    animation: wu-spin 44s linear infinite reverse;
    border-right-color: rgba(167,139,250,0.12);
  }

  .wu-card {
    position: relative;
    z-index: 1;
    width: min(100%, 400px);
    padding: 40px 32px 32px;
    border-radius: 28px;
    background: linear-gradient(160deg,
      rgba(22,22,32,0.82) 0%,
      rgba(14,14,22,0.90) 100%
    );
    border: 1px solid rgba(255,255,255,0.07);
    box-shadow:
      0 0 0 1px rgba(124,106,255,0.08) inset,
      0 32px 80px rgba(0,0,0,0.55),
      0 0 60px rgba(124,106,255,0.04);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    text-align: center;
    overflow: hidden;
  }

  .wu-card-glow {
    position: absolute;
    top: -60px; left: 50%;
    transform: translateX(-50%);
    width: 280px; height: 120px;
    background: radial-gradient(ellipse, rgba(124,106,255,0.22) 0%, transparent 70%);
    pointer-events: none;
    filter: blur(20px);
  }

  .wu-logo-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
  }
  .wu-logo-pulse {
    position: absolute;
    width: 110px; height: 70px;
    border-radius: 120px;
    background: rgba(124,106,255,0.18);
    filter: blur(14px);
    animation: wu-pulse 2.8s ease-in-out infinite;
  }
  .wu-logo-ring {
    position: relative;
    width: 100px; height: 62px;
    border-radius: 120px;
    padding: 2px;
    background: linear-gradient(135deg, #7c6aff 0%, #a78bfa 50%, #6366f1 100%);
    box-shadow:
      0 0 20px rgba(124,106,255,0.5),
      0 0 40px rgba(124,106,255,0.15),
      0 0 1px rgba(255,255,255,0.15) inset;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .wu-logo-inner {
    width: 100%;
    height: 100%;
    border-radius: 120px;
    background: #0a0a0f;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .wu-brand {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 6px;
    margin-bottom: 20px;
  }
  .wu-brand-name {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.4px;
    background: linear-gradient(90deg, #c4b5fd 0%, #a78bfa 50%, #818cf8 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .wu-brand-version {
    font-size: 10px;
    font-weight: 500;
    color: #4a4a66;
    letter-spacing: 0.04em;
    padding: 2px 7px;
    border: 1px solid rgba(124,106,255,0.2);
    border-radius: 999px;
    background: rgba(124,106,255,0.06);
  }

  .wu-divider {
    height: 1px;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(124,106,255,0.2) 30%,
      rgba(167,139,250,0.25) 50%,
      rgba(124,106,255,0.2) 70%,
      transparent 100%
    );
    margin: 0 0 24px;
  }

  .wu-copy {
    margin-bottom: 28px;
    min-height: 76px;
  }
  .wu-title {
    margin: 0 0 10px;
    font-size: clamp(18px, 4vw, 22px);
    font-weight: 600;
    letter-spacing: -0.4px;
    color: #f1f1f3;
  }
  .wu-dots {
    display: inline-block;
    width: 18px;
    text-align: left;
    color: #7c6aff;
  }
  .wu-phrase {
    margin: 0;
    font-size: 13.5px;
    color: #7a7a90;
    line-height: 1.5;
    transition: opacity 0.35s ease, transform 0.35s ease;
    letter-spacing: 0.01em;
  }
  .wu-phrase-in  { opacity: 1; transform: translateY(0); }
  .wu-phrase-out { opacity: 0; transform: translateY(8px); }

  .wu-progress-wrap { margin-bottom: 18px; }
  .wu-track {
    height: 5px;
    border-radius: 999px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.04);
    overflow: visible;
    position: relative;
  }
  .wu-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #6d58ff 0%, #a78bfa 60%, #818cf8 100%);
    transition: width 0.35s ease-out;
    position: relative;
  }
  .wu-fill-glow {
    position: absolute;
    right: -4px; top: 50%;
    transform: translateY(-50%);
    width: 12px; height: 12px;
    border-radius: 50%;
    background: #a78bfa;
    box-shadow: 0 0 8px 3px rgba(167,139,250,0.55);
    animation: wu-blink 1.2s ease-in-out infinite;
  }
  .wu-meta {
    display: flex;
    justify-content: space-between;
    margin-top: 9px;
    font-size: 11px;
    letter-spacing: 0.03em;
  }
  .wu-meta-label { color: #4a4a60; }
  .wu-meta-pct {
    color: #7c6aff;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .wu-steps {
    display: flex;
    justify-content: center;
    gap: 7px;
  }
  .wu-step {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.06);
    transition: background 0.4s ease, box-shadow 0.4s ease, transform 0.3s ease;
  }
  .wu-step-active {
    background: rgba(124,106,255,0.5);
    box-shadow: 0 0 6px rgba(124,106,255,0.4);
    transform: scale(1.25);
  }
  .wu-step-done {
    background: #7c6aff;
    box-shadow: 0 0 8px rgba(124,106,255,0.55);
  }

  @keyframes wu-drift {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33%       { transform: translate(20px, -16px) scale(1.04); }
    66%       { transform: translate(-12px, 10px) scale(0.97); }
  }
  @keyframes wu-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes wu-pulse {
    0%, 100% { opacity: 0.6; transform: scale(1); }
    50%       { opacity: 1;   transform: scale(1.12); }
  }
  @keyframes wu-blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.3; }
  }

  @media (max-width: 480px) {
    .wu-root { padding: 16px; }
    .wu-card { padding: 32px 22px 26px; border-radius: 22px; }
    .wu-logo-ring { width: 88px; height: 54px; }
    .wu-logo-pulse { width: 96px; height: 60px; }
    .wu-orbit-1 { width: 380px; height: 380px; }
    .wu-orbit-2 { width: 540px; height: 540px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .wu-ambient, .wu-orbit, .wu-logo-pulse, .wu-fill-glow { animation: none; }
    .wu-phrase { transition: none; }
    .wu-fill { transition: none; }
    .wu-step { transition: none; }
  }
`;
