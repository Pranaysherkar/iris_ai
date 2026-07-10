"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { irisLogoSrc, useUiTheme } from "@/lib/use-ui-theme";
import type { Chat } from "./ChatLayout";
import MessageBubble from "./MessageBubble";
import ChatInput, { type PendingAttachment } from "./ChatInput";

type Props = {
  chat: Chat;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onSendMessage: (content: string, attachmentIds?: string[]) => Promise<void>;
  onVoiceToggle?: () => Promise<void>;
  onUploadFiles?: (files: File[]) => Promise<void>;
  onRemoveAttachment?: (id: string) => void;
  pendingAttachments?: PendingAttachment[];
  voiceRecording?: boolean;
  voiceBusy?: boolean;
  userFirstName?: string;
  historyLoading?: boolean;
  historyError?: string | null;
  onRetryHistory?: () => void;
};

const SUGGESTIONS = [
  {
    text: "Explain quantum computing simply",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 8v4l3 3"/>
        <path d="M5.5 5.5A9.96 9.96 0 0 1 12 2"/>
      </svg>
    ),
  },
  {
    text: "Write a Python web scraper",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"/>
        <polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
  },
  {
    text: "Give me a 7-day meal plan",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11l19-9-9 19-2-8-8-2z"/>
      </svg>
    ),
  },
  {
    text: "Summarize the latest AI trends",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
  },
  {
    text: "Help me write a cover letter",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
  },
  {
    text: "Solve this math problem step by step",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    ),
  },
];

export default function ChatArea({
  chat,
  sidebarOpen,
  onToggleSidebar,
  onSendMessage,
  onVoiceToggle,
  onUploadFiles,
  onRemoveAttachment,
  pendingAttachments = [],
  voiceRecording = false,
  voiceBusy = false,
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
            <SidebarIcon />
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
            <div className="history-error-icon">⚠️</div>
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
                  width={54}
                  height={54}
                  unoptimized
                  priority
                  className="empty-logo"
                  style={{ width: "auto", height: "100%", objectFit: "contain" }}
                />
              </div>
            </div>
            <h1 className="empty-title">
              Hello,{" "}
              <span className="empty-name-gradient">{userFirstName?.trim() || "there"}</span>
              {" — "}how can I help?
            </h1>
            <p className="empty-subtitle">Ask me anything — I&apos;m here to help.</p>
            <div className="suggestions-grid">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  className="suggestion-chip"
                  onClick={() => onSendMessage(s.text)}
                >
                  <span className="suggestion-icon">{s.icon}</span>
                  <span className="suggestion-text">{s.text}</span>
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
      <ChatInput
        onSend={(content, attachmentIds) => onSendMessage(content, attachmentIds)}
        onVoiceToggle={onVoiceToggle}
        onUploadFiles={onUploadFiles}
        onRemoveAttachment={onRemoveAttachment}
        pendingAttachments={pendingAttachments}
        voiceRecording={voiceRecording}
        voiceBusy={voiceBusy}
        disabled={voiceBusy}
      />

      <style>{chatAreaStyles}</style>
    </main>
  );
}

/* ── Icons ── */
function SidebarIcon() {
  return (
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    height: 100dvh;
    min-width: 0;
    background: #0d0d10;
    position: relative;
    overflow: hidden;
  }

  /* Header */
  .chat-header {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 0 16px;
    height: 56px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    flex-shrink: 0;
    background: rgba(13,13,16,0.85);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .chat-header-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
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
  }
  .toggle-sidebar-btn {
    width: 34px; height: 34px;
    border-radius: 8px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    color: #5a5a70;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
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
    overflow: hidden;
  }
  .chat-header-logo-ring {
    width: 38px; height: 22px;
    border-radius: 100px;
    background: linear-gradient(135deg, #7c6aff, #c084fc, #38bdf8);
    padding: 1.5px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
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
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
    white-space: nowrap;
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
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    scroll-behavior: smooth;
    min-width: 0;
    width: 100%;
  }

  /* History states */
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
    width: 36px; height: 36px;
    border: 2px solid rgba(255,255,255,0.1);
    border-top-color: rgba(167, 139, 250, 0.85);
    border-radius: 50%;
    animation: history-spin 0.85s linear infinite;
  }
  @keyframes history-spin { to { transform: rotate(360deg); } }
  .history-state-text { font-size: 14px; color: #6a6a82; }
  .history-error-wrap { text-align: center; gap: 12px; }
  .history-error-icon { font-size: 32px; }
  .history-error-text {
    font-size: 14px;
    color: #f87171;
    max-width: 360px;
    line-height: 1.55;
  }
  .history-retry-btn {
    margin-top: 4px;
    padding: 9px 20px;
    border-radius: 10px;
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

  /* Empty state */
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 20px 32px;
    text-align: center;
    animation: fadeInUp 0.45s ease;
    max-width: 100%;
  }
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .empty-logo-ring {
    width: 90px; height: 54px;
    border-radius: 100px;
    background: linear-gradient(135deg, #7c6aff, #c084fc, #38bdf8);
    padding: 2.5px;
    margin-bottom: 20px;
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
    font-size: clamp(20px, 4vw, 28px);
    font-weight: 600;
    color: #e8e8f0;
    letter-spacing: -0.5px;
    margin-bottom: 8px;
    line-height: 1.3;
  }
  .empty-name-gradient {
    background: linear-gradient(90deg, #c4b5fd, #a78bfa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .empty-subtitle {
    font-size: clamp(13px, 2vw, 15px);
    color: #5a5a72;
    margin-bottom: 32px;
  }

  /* Suggestions grid — responsive */
  .suggestions-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    width: 100%;
    max-width: 680px;
  }
  .suggestion-chip {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    color: #8888a8;
    font-size: 13px;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s, color 0.2s, transform 0.15s;
    line-height: 1.45;
  }
  .suggestion-chip:hover {
    background: rgba(124,106,255,0.08);
    border-color: rgba(124,106,255,0.25);
    color: #c4b5fd;
    transform: translateY(-2px);
  }
  .suggestion-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: rgba(124,106,255,0.1);
    color: #9d8cff;
    margin-top: 1px;
  }
  .suggestion-icon svg {
    flex-shrink: 0;
  }
  .suggestion-text {
    flex: 1;
  }

  /* Messages list */
  .messages-list {
    padding: 16px 0 12px;
    display: flex;
    flex-direction: column;
    width: 100%;
    overflow-x: hidden;
    min-width: 0;
  }

  /* --- Responsive Breakpoints --- */

  /* Large tablet / small laptop */
  @media (max-width: 1024px) {
    .suggestions-grid {
      grid-template-columns: repeat(2, 1fr);
      max-width: 560px;
    }
  }

  /* Mobile */
  @media (max-width: 640px) {
    .chat-header { padding: 0 12px; height: 52px; }
    .chat-model-badge { display: none; }
    .suggestions-grid {
      grid-template-columns: 1fr;
      max-width: 100%;
    }
    .empty-state { padding: 32px 16px 24px; }
    .empty-logo-ring { width: 72px; height: 44px; }
  }

  /* Very small mobile */
  @media (max-width: 380px) {
    .chat-header-brand-name { display: none; }
    .empty-logo-ring { width: 60px; height: 36px; }
  }

  /* Large screens (projector / ultra-wide) */
  @media (min-width: 1440px) {
    .suggestions-grid {
      grid-template-columns: repeat(3, 1fr);
      max-width: 800px;
    }
    .empty-title { font-size: 32px; }
  }

  /* --- Light Theme Overrides --- */
  [data-theme="light"] .chat-area { background: #ffffff; }
  [data-theme="light"] .chat-header {
    background: rgba(255,255,255,0.9);
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
  [data-theme="light"] .chat-header-brand-name { color: #111118; }
  [data-theme="light"] .chat-header-logo-inner {
    background: #f2f0ff;
    border: 1px solid rgba(124, 106, 255, 0.35);
  }
  [data-theme="light"] .chat-model-badge {
    background: rgba(124,106,255,0.1);
    border-color: rgba(124,106,255,0.25);
    color: #6a5acd;
  }
  [data-theme="light"] .empty-logo-ring {
    padding: 2px;
    box-shadow: 0 10px 40px rgba(124, 106, 255, 0.18), 0 2px 12px rgba(0, 0, 0, 0.05);
    background: linear-gradient(135deg, rgba(124, 106, 255, 0.9), rgba(192, 132, 252, 0.88), rgba(56, 189, 248, 0.88));
  }
  [data-theme="light"] .empty-logo-inner {
    background: #f2f0ff;
    border: 1px solid rgba(124, 106, 255, 0.38);
  }
  [data-theme="light"] .empty-title { color: #111118; }
  [data-theme="light"] .empty-subtitle { color: #66667a; }
  [data-theme="light"] .suggestion-chip {
    background: #f8f9fa;
    border-color: #e5e7eb;
    color: #4b5563;
  }
  [data-theme="light"] .suggestion-chip:hover {
    background: rgba(124,106,255,0.06);
    border-color: rgba(124,106,255,0.25);
    color: #6a5acd;
  }
  [data-theme="light"] .suggestion-icon {
    background: rgba(124,106,255,0.08);
    color: #6a5acd;
  }
  [data-theme="light"] .messages-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); }
  [data-theme="light"] .history-spinner {
    border-color: rgba(0,0,0,0.08);
    border-top-color: rgba(106, 90, 205, 0.75);
  }
  [data-theme="light"] .history-state-text { color: #66667a; }
  [data-theme="light"] .history-error-text { color: #b91c1c; }
  [data-theme="light"] .history-retry-btn {
    background: rgba(124,106,255,0.1);
    border-color: rgba(124,106,255,0.3);
    color: #6a5acd;
  }
`;
