"use client";

import Image from "next/image";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { irisLogoSrc, useUiTheme } from "@/lib/use-ui-theme";
import type { Chat } from "./ChatLayout";

type Props = {
  open: boolean;
  onToggle: () => void;
  chats: Chat[];
  activeChatId: string;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  user: { email?: string; id?: string } | null;
};

function groupChatsByDate(chats: Chat[]) {
  const now = new Date();
  const today: Chat[] = [];
  const yesterday: Chat[] = [];
  const week: Chat[] = [];
  const older: Chat[] = [];

  chats.forEach((c) => {
    const diff = Math.floor((now.getTime() - c.createdAt.getTime()) / 86400000);
    if (diff === 0) today.push(c);
    else if (diff === 1) yesterday.push(c);
    else if (diff <= 7) week.push(c);
    else older.push(c);
  });

  return { today, yesterday, week, older };
}

export default function Sidebar({
  open,
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  user,
}: Props) {
  const [signingOut, setSigningOut] = useState(false);
  const [hoveredChat, setHoveredChat] = useState<string | null>(null);

  const { today, yesterday, week, older } = groupChatsByDate(chats);
  const uiTheme = useUiTheme();
  const logoSrc = irisLogoSrc(uiTheme);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);

    // Timeout fallback — if signOut hangs for >4s, hard-redirect anyway
    const fallback = setTimeout(() => {
      window.location.href = "/auth/signin";
    }, 4000);

    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } finally {
      clearTimeout(fallback);
      // Hard redirect: forces a full page reload so server clears session
      window.location.href = "/auth/signin";
    }
  };

  const userInitial = user?.email ? user.email[0].toUpperCase() : "U";
  const userEmail = user?.email ?? "";

  const ChatItem = ({ chat }: { chat: Chat }) => (
    <div
      className={`sidebar-chat-item ${chat.id === activeChatId ? "active" : ""}`}
      onClick={() => onSelectChat(chat.id)}
      onMouseEnter={() => setHoveredChat(chat.id)}
      onMouseLeave={() => setHoveredChat(null)}
    >
      <ChatBubbleIcon />
      <span className="sidebar-chat-title">{chat.title}</span>
      {hoveredChat === chat.id && (
        <button
          className="sidebar-chat-delete"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteChat(chat.id);
          }}
          aria-label="Delete chat"
        >
          <TrashIcon />
        </button>
      )}
    </div>
  );

  const ChatGroup = ({ label, items }: { label: string; items: Chat[] }) =>
    items.length > 0 ? (
      <div className="chat-group">
        <span className="chat-group-label">{label}</span>
        {items.map((c) => <ChatItem key={c.id} chat={c} />)}
      </div>
    ) : null;

  return (
    <>
      <aside className={`sidebar ${open ? "sidebar-open" : "sidebar-closed"}`}>
        {/* Top: Logo + New Chat */}
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <div className="sidebar-logo-ring">
              <div className="sidebar-logo-inner">
                <Image
                  src={logoSrc}
                  alt="Iris"
                  width={28}
                  height={28}
                  unoptimized
                  priority
                  className="sidebar-logo-gif"
                  style={{ width: "auto", height: "auto" }}
                />
              </div>
            </div>
            <span className="sidebar-brand-name">Iris AI</span>
          </div>
          <button className="new-chat-btn" onClick={onNewChat} title="New chat">
            <PenIcon />
          </button>
        </div>

        {/* Chat list */}
        <nav className="sidebar-nav" aria-label="Conversations">
          {chats.length === 0 && (
            <div className="sidebar-empty-state">
              <p className="sidebar-empty-hint">Start a new conversation to get going.</p>
            </div>
          )}
          <ChatGroup label="Today" items={today} />
          <ChatGroup label="Yesterday" items={yesterday} />
          <ChatGroup label="This Week" items={week} />
          <ChatGroup label="Older" items={older} />
        </nav>

        {/* Bottom: User profile */}
        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">{userInitial}</div>
            <div className="user-info">
              <span className="user-email">{userEmail}</span>
              <span className="user-plan">Free plan</span>
            </div>
          </div>
          <button
            className="signout-btn"
            onClick={handleSignOut}
            disabled={signingOut}
            title="Sign out"
          >
            {signingOut ? <SpinnerIcon /> : <SignOutIcon />}
          </button>
        </div>
      </aside>

      <style>{sidebarStyles}</style>
    </>
  );
}

/* ── Icons ── */
function PenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}
function ChatBubbleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.5 }}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}
function SignOutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
function SpinnerIcon() {
  return <span style={{ width: 15, height: 15, border: "1.5px solid rgba(255,255,255,0.2)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />;
}

/* ── Styles ── */
const sidebarStyles = `
  .sidebar {
    position: relative;
    z-index: 20;
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    background: #111116;
    border-right: 1px solid rgba(255,255,255,0.06);
    transition: width 0.28s cubic-bezier(0.4,0,0.2,1), transform 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.2s;
    overflow: hidden;
    flex-shrink: 0;
  }
  .sidebar-open  { width: 260px; opacity: 1; }
  .sidebar-closed { width: 0; opacity: 0; pointer-events: none; }

  /* On mobile: sidebar overlays the chat area */
  @media (max-width: 767px) {
    .sidebar {
      position: fixed;
      top: 0;
      left: 0;
      height: 100vh;
      height: 100dvh;
      width: 280px !important;
      transform: translateX(-100%);
      box-shadow: 4px 0 24px rgba(0, 0, 0, 0.5);
    }
    .sidebar-open {
      transform: translateX(0);
      opacity: 1;
    }
    .sidebar-closed {
      transform: translateX(-100%);
      opacity: 0;
      pointer-events: none;
    }
  }

  /* Top */
  .sidebar-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 14px 12px;
    flex-shrink: 0;
  }
  .sidebar-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    overflow: hidden;
    white-space: nowrap;
  }
  .sidebar-logo-ring {
    width: 40px; height: 24px;
    border-radius: 100px;
    background: linear-gradient(135deg, #7c6aff, #c084fc, #38bdf8);
    padding: 1.5px;
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 10px rgba(124, 106, 255, 0.2);
  }
  .sidebar-logo-inner {
    width: 100%;
    height: 100%;
    border-radius: 100px;
    background: #000;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .sidebar-logo-gif {
    height: 100%;
    width: auto;
    object-fit: contain;
  }
  .sidebar-brand-name {
    font-size: 15px;
    font-weight: 600;
    color: #e8e8f0;
    letter-spacing: -0.3px;
    white-space: nowrap;
  }
  .new-chat-btn {
    width: 32px; height: 32px;
    border-radius: 8px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    color: #8888a8;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.2s, color 0.2s, border-color 0.2s;
  }
  .new-chat-btn:hover {
    background: rgba(124,106,255,0.15);
    border-color: rgba(124,106,255,0.3);
    color: #a78bfa;
  }

  /* Nav */
  .sidebar-nav {
    flex: 1;
    overflow-y: auto;
    padding: 4px 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .sidebar-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 32px 16px;
    text-align: center;
    gap: 8px;
  }
  .sidebar-empty-hint {
    font-size: 12px;
    color: #4a4a60;
    line-height: 1.5;
  }
  .sidebar-nav::-webkit-scrollbar { width: 4px; }
  .sidebar-nav::-webkit-scrollbar-track { background: transparent; }
  .sidebar-nav::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }

  .chat-group { margin-bottom: 8px; }
  .chat-group-label {
    display: block;
    font-size: 10.5px;
    font-weight: 600;
    color: #44445a;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    padding: 8px 8px 4px;
  }

  .sidebar-chat-item {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 8px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s;
    position: relative;
    overflow: hidden;
  }
  .sidebar-chat-item:hover { background: rgba(255,255,255,0.05); }
  .sidebar-chat-item.active {
    background: rgba(124,106,255,0.12);
  }
  .sidebar-chat-item.active .sidebar-chat-title { color: #c4b5fd; }

  .sidebar-chat-title {
    font-size: 13px;
    color: #7a7a90;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    transition: color 0.15s;
    line-height: 1.4;
  }
  .sidebar-chat-item:hover .sidebar-chat-title { color: #b0b0c8; }

  .sidebar-chat-delete {
    background: none;
    border: none;
    cursor: pointer;
    color: #55556a;
    display: flex;
    align-items: center;
    padding: 3px;
    border-radius: 5px;
    flex-shrink: 0;
    transition: color 0.15s, background 0.15s;
  }
  .sidebar-chat-delete:hover { color: #f87171; background: rgba(248,113,113,0.1); }

  /* Footer */
  .sidebar-footer {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    border-top: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
  }
  .user-profile {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    overflow: hidden;
    min-width: 0;
  }
  .user-avatar {
    width: 30px; height: 30px;
    border-radius: 50%;
    background: linear-gradient(135deg, #7c6aff, #c084fc);
    display: flex; align-items: center; justify-content: center;
    font-size: 12px;
    font-weight: 600;
    color: #fff;
    flex-shrink: 0;
  }
  .user-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    overflow: hidden;
    min-width: 0;
  }
  .user-email {
    font-size: 12px;
    color: #9090a8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .user-plan {
    font-size: 10px;
    color: #55556a;
  }
  .signout-btn {
    width: 30px; height: 30px;
    border-radius: 8px;
    background: none;
    border: 1px solid rgba(255,255,255,0.07);
    color: #55556a;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: color 0.2s, background 0.2s, border-color 0.2s;
  }
  .signout-btn:hover {
    background: rgba(248,113,113,0.08);
    border-color: rgba(248,113,113,0.2);
    color: #f87171;
  }
  .signout-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* --- Light Theme Overrides --- */
  [data-theme="light"] .sidebar {
    background: #f8f9fa;
    border-right: 1px solid rgba(0,0,0,0.08);
  }
  [data-theme="light"] .sidebar-brand-name { color: #111118; }
  [data-theme="light"] .sidebar-logo-ring {
    padding: 1.5px;
    box-shadow: 0 1px 5px rgba(124, 106, 255, 0.22);
    background: linear-gradient(135deg, rgba(124, 106, 255, 0.88), rgba(192, 132, 252, 0.85), rgba(56, 189, 248, 0.85));
  }
  [data-theme="light"] .sidebar-logo-inner {
    background: #f2f0ff;
    border: 1px solid rgba(124, 106, 255, 0.35);
  }
  [data-theme="light"] .new-chat-btn {
    background: #ffffff;
    border-color: rgba(0,0,0,0.1);
    color: #66667a;
  }
  [data-theme="light"] .new-chat-btn:hover {
    background: rgba(124,106,255,0.08);
    border-color: rgba(124,106,255,0.25);
    color: #6a5acd;
  }
  [data-theme="light"] .chat-group-label { color: #8888a8; }
  [data-theme="light"] .sidebar-chat-item:hover { background: rgba(0,0,0,0.04); }
  [data-theme="light"] .sidebar-chat-item.active { background: rgba(124,106,255,0.1); }
  [data-theme="light"] .sidebar-chat-item.active .sidebar-chat-title { color: #6a5acd; }
  [data-theme="light"] .sidebar-chat-title { color: #55556a; }
  [data-theme="light"] .sidebar-chat-item:hover .sidebar-chat-title { color: #111118; }
  [data-theme="light"] .sidebar-footer { border-top: 1px solid rgba(0,0,0,0.08); }
  [data-theme="light"] .user-email { color: #55556a; }
  [data-theme="light"] .user-plan { color: #8888a8; }
  [data-theme="light"] .signout-btn { border-color: rgba(0,0,0,0.1); color: #66667a; }
  [data-theme="light"] .signout-btn:hover {
    background: rgba(248,113,113,0.1);
    border-color: rgba(248,113,113,0.3);
  }
  [data-theme="light"] .sidebar-empty-hint { color: #8888a8; }
`;
