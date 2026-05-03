"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { irisLogoSrc, useUiTheme } from "@/lib/use-ui-theme";
import type { Chat } from "./ChatLayout";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";

type Props = {
  chat: Chat;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onSendMessage: (content: string) => Promise<void>;
  /** First name for personalized empty state (e.g. "Ram"). */
  userFirstName?: string;
  historyLoading?: boolean;
  historyError?: string | null;
  onRetryHistory?: () => void;
};

const SUGGESTIONS = [
  "Explain quantum computing simply",
  "Write a Python web scraper",
  "Give me a 7-day meal plan",
  "Summarize the latest AI trends",
];

export default function ChatArea({
  chat,
  sidebarOpen,
  onToggleSidebar,
  onSendMessage,
  userFirstName,
  historyLoading = false,
  historyError = null,
  onRetryHistory,
}: Props) {
  const uiTheme = useUiTheme();
  const logoSrc = irisLogoSrc(uiTheme);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasUserMessages = chat.messages.some((m) => m.role === "user");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages]);

  const showEmptySuggestions =
    !historyLoading && !historyError && !hasUserMessages;

  return (
    <main className="chat-area">
      {/* Header */}
      <header className="chat-header">
        <div className="chat-header-left">
          <button
            className="toggle-sidebar-btn"
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            <SidebarIcon open={sidebarOpen} />
          </button>
          {!sidebarOpen && (
            <div className="chat-header-brand">
              <div className="chat-header-logo-ring">
                <div className="chat-header-logo-inner">
                  <Image
                  src={logoSrc}
                  alt="Iris"
                  width={22}
                  height={22}
                  unoptimized
                  priority
                  className="chat-header-logo"
                  style={{ width: "auto", height: "auto" }}
                />
                </div>
              </div>
              <span className="chat-header-brand-name">Iris AI</span>
            </div>
          )}
        </div>
        <div className="chat-header-center">
          <span className="chat-model-badge">
            <SparkleIcon />
            Iris 1.0
          </span>
        </div>
        <div className="chat-header-right">
          <ThemeToggle />
        </div>
      </header>

      {/* Messages or Empty state */}
      <div className="messages-scroll">
        {historyLoading ? (
          <div className="history-state-wrap">
            <div className="history-spinner" aria-busy="true" aria-label="Loading conversation" />
            <p className="history-state-text">Loading conversation…</p>
          </div>
        ) : historyError ? (
          <div className="history-state-wrap history-error-wrap">
            <p className="history-error-text">{historyError}</p>
            {onRetryHistory ? (
              <button type="button" className="history-retry-btn" onClick={onRetryHistory}>
                Try again
              </button>
            ) : null}
          </div>
        ) : showEmptySuggestions ? (
          <div className="empty-state">
            <div className="empty-logo-ring">
              <div className="empty-logo-inner">
                <Image
                  src={logoSrc}
                  alt="Iris"
                  width={64}
                  height={64}
                  unoptimized
                  priority
                  className="empty-logo"
                  style={{ width: "auto", height: "auto" }}
                />
              </div>
            </div>
            <h1 className="empty-title">
              Hello,{" "}
              <span className="empty-name-gradient">{userFirstName?.trim() || "there"}</span>
              {" — "}how can I help you?
            </h1>
            <p className="empty-subtitle">Ask me anything — I&apos;m here to help.</p>
            <div className="suggestions-grid">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="suggestion-chip"
                  onClick={() => onSendMessage(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="messages-list">
            {chat.messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput onSend={onSendMessage} />

      <style>{chatAreaStyles}</style>
    </main>
  );
}

/* ── Icons ── */
function SidebarIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}
function SparkleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  );
}
function ThemeToggle() {
  const [theme, setTheme] = useState("dark");
  useEffect(() => {
    const saved = localStorage.getItem("theme") || "dark";
    document.documentElement.setAttribute("data-theme", saved);
    // One-time hydration from localStorage after SSR (external store).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror DOM theme into React state for the toggle control
    setTheme(saved);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  return (
    <button className="header-action-btn" onClick={toggle} title="Toggle theme">
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

/* ── Styles ── */
const chatAreaStyles = `
  .chat-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100vh;
    min-width: 0;
    background: #0d0d10;
    position: relative;
  }

  /* Header */
  .chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    height: 58px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    flex-shrink: 0;
    background: rgba(13,13,16,0.8);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .chat-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 80px;
  }
  .chat-header-center {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .chat-header-right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    min-width: 80px;
  }
  .toggle-sidebar-btn {
    width: 34px; height: 34px;
    border-radius: 8px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    color: #5a5a70;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
  }
  .toggle-sidebar-btn:hover {
    background: rgba(255,255,255,0.08);
    color: #a0a0c0;
  }
  .chat-header-brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .chat-header-logo-ring {
    width: 38px; height: 22px;
    border-radius: 100px;
    background: linear-gradient(135deg, #7c6aff, #c084fc, #38bdf8);
    padding: 1.5px;
    display: flex; align-items: center; justify-content: center;
  }
  .chat-header-logo-inner {
    width: 100%; height: 100%;
    border-radius: 100px;
    background: #000;
    overflow: hidden;
    display: flex; align-items: center; justify-content: center;
  }
  .chat-header-logo { height: 100%; width: auto; object-fit: contain; }
  .chat-header-brand-name {
    font-size: 14px;
    font-weight: 600;
    color: #c4b5fd;
    letter-spacing: -0.2px;
  }
  .chat-model-badge {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px;
    border-radius: 20px;
    background: rgba(124,106,255,0.08);
    border: 1px solid rgba(124,106,255,0.2);
    color: #9d8cff;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.1px;
  }
  .header-action-btn {
    width: 34px; height: 34px;
    border-radius: 8px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    color: #5a5a70;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
  }
  .header-action-btn:hover {
    background: rgba(255,255,255,0.08);
    color: #a0a0c0;
  }

  /* Scroll area */
  .messages-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .history-state-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 48px 24px;
    min-height: 200px;
  }
  .history-spinner {
    width: 36px;
    height: 36px;
    border: 2px solid rgba(255,255,255,0.1);
    border-top-color: rgba(167, 139, 250, 0.85);
    border-radius: 50%;
    animation: history-spin 0.85s linear infinite;
  }
  @keyframes history-spin {
    to { transform: rotate(360deg); }
  }
  .history-state-text {
    font-size: 14px;
    color: #6a6a82;
  }
  .history-error-wrap {
    text-align: center;
  }
  .history-error-text {
    font-size: 14px;
    color: #f87171;
    max-width: 360px;
    line-height: 1.45;
  }
  .history-retry-btn {
    margin-top: 8px;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
    background: rgba(124,106,255,0.15);
    border: 1px solid rgba(124,106,255,0.35);
    color: #c4b5fd;
    transition: background 0.2s, border-color 0.2s;
  }
  .history-retry-btn:hover {
    background: rgba(124,106,255,0.22);
    border-color: rgba(124,106,255,0.5);
  }
  .messages-scroll::-webkit-scrollbar { width: 4px; }
  .messages-scroll::-webkit-scrollbar-track { background: transparent; }
  .messages-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }

  /* Empty state */
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 24px 40px;
    text-align: center;
    animation: fadeInUp 0.5s ease;
  }
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .empty-logo-ring {
    width: 110px; height: 64px;
    border-radius: 100px;
    background: linear-gradient(135deg, #7c6aff, #c084fc, #38bdf8);
    padding: 2.5px;
    margin-bottom: 24px;
    box-shadow: 0 0 40px rgba(124,106,255,0.25), 0 0 80px rgba(124,106,255,0.08);
    display: flex; align-items: center; justify-content: center;
  }
  .empty-logo-inner {
    width: 100%; height: 100%;
    border-radius: 100px;
    background: #000;
    overflow: hidden;
    display: flex; align-items: center; justify-content: center;
  }
  .empty-logo { height: 100%; width: auto; object-fit: contain; }
  .empty-title {
    font-size: 28px;
    font-weight: 600;
    color: #e8e8f0;
    letter-spacing: -0.6px;
    margin-bottom: 8px;
  }
  .empty-subtitle {
    font-size: 15px;
    color: #5a5a72;
    margin-bottom: 36px;
  }
  .suggestions-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    max-width: 520px;
    width: 100%;
  }
  .suggestion-chip {
    padding: 12px 16px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    color: #8888a8;
    font-size: 13px;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s, color 0.2s, transform 0.15s;
    line-height: 1.4;
  }
  .suggestion-chip:hover {
    background: rgba(124,106,255,0.08);
    border-color: rgba(124,106,255,0.25);
    color: #b0a8d8;
    transform: translateY(-1px);
  }

  /* Messages list */
  .messages-list {
    padding: 24px 0 12px;
    display: flex;
    flex-direction: column;
  }

  @media (max-width: 640px) {
    .suggestions-grid { grid-template-columns: 1fr; }
    .empty-title { font-size: 22px; }
    .chat-model-badge { display: none; }
  }

  /* --- Light Theme Overrides --- */
  [data-theme="light"] .chat-area {
    background: #ffffff;
  }
  [data-theme="light"] .chat-header {
    background: rgba(255,255,255,0.85);
    border-bottom: 1px solid rgba(0,0,0,0.06);
  }
  [data-theme="light"] .toggle-sidebar-btn,
  [data-theme="light"] .header-action-btn {
    background: rgba(0,0,0,0.03);
    border-color: rgba(0,0,0,0.06);
    color: #55556a;
  }
  [data-theme="light"] .toggle-sidebar-btn:hover,
  [data-theme="light"] .header-action-btn:hover {
    background: rgba(0,0,0,0.06);
    color: #333344;
  }
  [data-theme="light"] .chat-header-brand-name {
    color: #111118;
  }
  [data-theme="light"] .chat-header-logo-inner {
    background: #f2f0ff;
    border: 1px solid rgba(124, 106, 255, 0.35);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 1px 4px rgba(0, 0, 0, 0.07);
  }
  /* Hero empty state: slightly richer depth than sidebar / header chip */
  [data-theme="light"] .empty-logo-ring {
    padding: 2px;
    box-shadow:
      0 10px 40px rgba(124, 106, 255, 0.18),
      0 2px 12px rgba(0, 0, 0, 0.05);
    background: linear-gradient(
      135deg,
      rgba(124, 106, 255, 0.9),
      rgba(192, 132, 252, 0.88),
      rgba(56, 189, 248, 0.88)
    );
  }
  [data-theme="light"] .empty-logo-inner {
    background: #f2f0ff;
    border: 1px solid rgba(124, 106, 255, 0.38);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.4),
      0 6px 20px rgba(124, 106, 255, 0.2),
      0 2px 6px rgba(0, 0, 0, 0.06);
  }
  [data-theme="light"] .chat-model-badge {
    background: rgba(124,106,255,0.1);
    border-color: rgba(124,106,255,0.25);
    color: #6a5acd;
  }
  [data-theme="light"] .empty-title {
    color: #111118;
  }
  [data-theme="light"] .empty-subtitle {
    color: #66667a;
  }
  [data-theme="light"] .suggestion-chip {
    background: #f8f9fa;
    border-color: #e5e7eb;
    color: #4b5563;
  }
  [data-theme="light"] .suggestion-chip:hover {
    background: #f3f4f6;
    border-color: #d1d5db;
    color: #1f2937;
  }
  [data-theme="light"] .messages-scroll::-webkit-scrollbar-thumb {
    background: rgba(0,0,0,0.1);
  }
  [data-theme="light"] .history-spinner {
    border-color: rgba(0,0,0,0.08);
    border-top-color: rgba(106, 90, 205, 0.75);
  }
  [data-theme="light"] .history-state-text {
    color: #66667a;
  }
  [data-theme="light"] .history-error-text {
    color: #b91c1c;
  }
  [data-theme="light"] .history-retry-btn {
    background: rgba(124,106,255,0.1);
    border-color: rgba(124,106,255,0.3);
    color: #6a5acd;
  }
`;

