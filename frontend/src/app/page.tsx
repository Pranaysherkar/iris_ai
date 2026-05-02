"use client";

import Image from "next/image";
import Link from "next/link";
import { useSyncExternalStore } from "react";

export default function Home() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!mounted) return null;

  return (
    <div className="landing-root">
      {/* Ambient background blobs (same as auth pages) */}
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />

      {/* Main Glassmorphism Card */}
      <div className="landing-card text-center">
        {/* Animated Brand Logo */}
        <div className="brand-center">
          <div className="brand-gif-ring">
            <div className="brand-gif-inner">
              <Image 
                src="/iris.gif" 
                alt="Iris" 
                width={84} 
                height={84} 
                className="brand-gif"
                unoptimized 
                priority
              />
            </div>
          </div>
        </div>

        {/* Hero Content */}
        <div className="landing-header">
          <div className="landing-badge">
            <span className="pulse-dot"></span>
            Iris Intelligence v1.0
          </div>
          <h1 className="landing-title">
            Your personal, <br />
            <span className="gradient-text">intelligent companion</span>
          </h1>
          <p className="landing-subtitle">
            Experience seamless conversations, deep insights, and unparalleled assistance in a minimal, distraction-free environment.
          </p>
        </div>

        {/* Call to Actions */}
        <div className="landing-actions">
          <Link href="/auth/signin" className="btn-primary">
            Get Started
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="arrow-icon">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </Link>
          <Link href="/auth/signin" className="btn-secondary">
            Sign In
          </Link>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');

        .landing-root {
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

        /* Ambient blobs */
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

        /* Glassmorphism Card */
        .landing-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 520px;
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 24px;
          padding: 56px 48px;
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.03) inset,
            0 40px 100px rgba(0,0,0,0.6);
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        /* Brand Logo */
        .brand-center {
          margin-bottom: 32px;
          display: flex;
          justify-content: center;
        }
        .brand-gif-ring {
          width: 84px;
          border-radius: 100px;
          background: linear-gradient(135deg, #7c6aff, #c084fc, #38bdf8);
          padding: 2px;
          box-shadow: 0 0 20px rgba(124, 106, 255, 0.4), 0 0 40px rgba(124, 106, 255, 0.15);
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
          height: 100%;
          object-fit: cover;
          display: block;
        }

        /* Typography & Content */
        .landing-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          background: rgba(124, 106, 255, 0.1);
          border: 1px solid rgba(124, 106, 255, 0.2);
          border-radius: 100px;
          color: #b0a3ff;
          font-size: 12px;
          font-weight: 500;
          margin-bottom: 24px;
          letter-spacing: 0.2px;
        }
        .pulse-dot {
          width: 6px;
          height: 6px;
          background: #7c6aff;
          border-radius: 50%;
          box-shadow: 0 0 8px #7c6aff;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
          100% { opacity: 1; transform: scale(1); }
        }

        .landing-title {
          font-size: 36px;
          font-weight: 600;
          color: #f1f1f3;
          letter-spacing: -1px;
          line-height: 1.15;
          margin: 0 0 16px;
        }
        .gradient-text {
          background: linear-gradient(90deg, #c4b5fd, #a78bfa, #818cf8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .landing-subtitle {
          font-size: 15px;
          color: #7a7a8a;
          margin: 0 0 40px;
          line-height: 1.6;
          max-width: 380px;
        }

        /* Buttons */
        .landing-actions {
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 100%;
          max-width: 320px;
        }
        
        .btn-primary {
          height: 48px;
          width: 100%;
          background: linear-gradient(135deg, #7c6aff 0%, #9d8cff 100%);
          border: none;
          border-radius: 12px;
          color: #fff;
          font-size: 15px;
          font-weight: 500;
          text-decoration: none;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          letter-spacing: 0.1px;
          transition: all 0.2s ease;
          box-shadow: 0 4px 24px rgba(124,106,255,0.35);
        }
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(124,106,255,0.45);
        }
        .arrow-icon {
          transition: transform 0.2s ease;
        }
        .btn-primary:hover .arrow-icon {
          transform: translateX(4px);
        }

        .btn-secondary {
          height: 48px;
          width: 100%;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          color: #b0b0c0;
          font-size: 15px;
          font-weight: 500;
          text-decoration: none;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }
        .btn-secondary:hover {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.18);
          color: #f1f1f3;
        }

        /* Responsive */
        @media (max-width: 480px) {
          .landing-card { 
            padding: 40px 24px; 
            border-radius: 20px;
          }
          .landing-title { font-size: 28px; }
          .landing-subtitle { font-size: 14px; }
        }
      `}</style>
    </div>
  );
}
