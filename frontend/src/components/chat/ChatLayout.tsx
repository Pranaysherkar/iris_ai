"use client";

import { useState, useCallback, useRef, useMemo, useLayoutEffect, useEffect } from "react";

import {
  fetchConversationList,
  fetchConversationHistory,
  softDeleteConversation,
  type ConversationListItemDto,
} from "@/lib/api/conversations";
import { streamChatCompletion } from "@/lib/api/chat";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";

import Sidebar from "./Sidebar";
import ChatArea from "./ChatArea";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

/** Local UI id + optional Supabase conversation UUID returned by the API (`X-Conversation-Id`). */
export type Chat = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  backendConversationId?: string | null;
  /** Row came from `GET /conversations` — sidebar can show before messages load */
  persisted?: boolean;
  /** For `persisted` threads: fetch history once when opened */
  historyLoaded?: boolean;
  historyError?: string | null;
};

type Props = {
  user: { email?: string; id?: string } | null;
};

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function createDraftChat(): Chat {
  return {
    id: makeId(),
    title: "New conversation",
    messages: [],
    createdAt: new Date(),
  };
}

/** Sidebar lists threads with at least one user message, or persisted server threads (history may load on open). */
export function chatHasStarted(chat: Chat): boolean {
  return chat.messages.some((m) => m.role === "user");
}

export function showChatInSidebar(chat: Chat): boolean {
  return chatHasStarted(chat) || Boolean(chat.persisted);
}

function mergeLoadedConversations(prev: Chat[], rows: ConversationListItemDto[]): Chat[] {
  const newDraft =
    prev.find((c) => !c.backendConversationId && !chatHasStarted(c)) ?? createDraftChat();
  const apiIds = new Set(rows.map((r) => r.id));

  const fromApi: Chat[] = rows.map((row) => {
    const existing = prev.find((p) => p.backendConversationId === row.id);
    if (existing) return existing;

    const createdAt = row.created_at ? new Date(row.created_at) : new Date();
    return {
      id: row.id,
      title: row.title?.trim() ? row.title.trim() : "New conversation",
      messages: [],
      createdAt,
      backendConversationId: row.id,
      persisted: true,
      historyLoaded: false,
      historyError: undefined,
    };
  });

  const pendingSync = prev.filter(
    (c) =>
      Boolean(c.backendConversationId) &&
      !apiIds.has(c.backendConversationId!) &&
      chatHasStarted(c),
  );

  return [newDraft, ...pendingSync, ...fromApi];
}

export default function ChatLayout({ user }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chats, setChats] = useState<Chat[]>(() => [createDraftChat()]);
  const [activeChatId, setActiveChatId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [historyRetryTick, setHistoryRetryTick] = useState(0);

  const chatsRef = useRef(chats);
  useLayoutEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  /** Resolves invalid/stale `activeChatId` (e.g. after delete) without setState in an effect. */
  const effectiveActiveId = useMemo(() => {
    if (chats.length === 0) return "";
    if (activeChatId && chats.some((c) => c.id === activeChatId)) return activeChatId;
    return (chats.find(showChatInSidebar) ?? chats[0]).id;
  }, [chats, activeChatId]);

  const activeChat = useMemo(() => {
    if (!effectiveActiveId) return chats[0];
    return chats.find((c) => c.id === effectiveActiveId) ?? chats[0];
  }, [chats, effectiveActiveId]);

  const sidebarChats = useMemo(() => chats.filter(showChatInSidebar), [chats]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token || cancelled) return;
      const res = await fetchConversationList(session.access_token);
      if (cancelled || !res.ok) return;
      setChats((prev) => mergeLoadedConversations(prev, res.conversations));
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !effectiveActiveId) return;
    const chat = chatsRef.current.find((c) => c.id === effectiveActiveId);
    if (!chat?.persisted || !chat.backendConversationId) return;
    if (chat.historyLoaded) return;

    const ac = new AbortController();

    void (async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token || ac.signal.aborted) return;

      setChats((prev) =>
        prev.map((c) => (c.id === chat.id ? { ...c, historyError: null } : c)),
      );

      const res = await fetchConversationHistory(session.access_token, chat.backendConversationId!);
      if (ac.signal.aborted) return;

      if (!res.ok) {
        setChats((prev) =>
          prev.map((c) =>
            c.id === chat.id
              ? { ...c, historyLoaded: true, historyError: res.detail }
              : c,
          ),
        );
        return;
      }

      const mapped: Message[] = res.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          timestamp: m.created_at ? new Date(m.created_at) : new Date(),
        }));

      setChats((prev) =>
        prev.map((c) => {
          if (c.id !== chat.id) return c;
          const firstUser = mapped.find((m) => m.role === "user");
          const titleFromFirst =
            firstUser && c.title === "New conversation"
              ? firstUser.content.length > 42
                ? `${firstUser.content.slice(0, 42)}…`
                : firstUser.content
              : c.title;
          return {
            ...c,
            messages: mapped,
            historyLoaded: true,
            historyError: undefined,
            title: titleFromFirst,
          };
        }),
      );
    })();

    return () => ac.abort();
  }, [effectiveActiveId, user?.id, historyRetryTick]);

  const handleRetryHistory = useCallback(() => {
    const current = chatsRef.current.find((c) => c.id === effectiveActiveId);
    if (!current?.persisted || !current.backendConversationId) return;
    setChats((prev) =>
      prev.map((c) =>
        c.id === current.id
          ? { ...c, historyLoaded: false, historyError: undefined }
          : c,
      ),
    );
    setHistoryRetryTick((n) => n + 1);
  }, [effectiveActiveId]);

  const handleNewChat = useCallback(() => {
    const newDraft = createDraftChat();
    setChats((prev) => {
      const kept = prev.filter(showChatInSidebar);
      return [newDraft, ...kept];
    });
    setActiveChatId(newDraft.id);
    setActionError(null);
  }, []);

  const handleSendMessage = useCallback(async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;

    const list = chatsRef.current;
    const requestChatId =
      activeChatId && list.some((c) => c.id === activeChatId)
        ? activeChatId
        : (list.find(showChatInSidebar) ?? list[0])?.id ?? "";
    if (!requestChatId) return;

    setActionError(null);

    const userMsg: Message = {
      id: makeId(),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };

    const thinkingId = makeId();
    const thinkingMsg: Message = {
      id: thinkingId,
      role: "assistant",
      content: "__thinking__",
      timestamp: new Date(),
    };

    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== requestChatId) return c;
        const isFirstUserMsg = c.messages.filter((m) => m.role === "user").length === 0;
        return {
          ...c,
          historyLoaded: true,
          title: isFirstUserMsg
            ? trimmed.slice(0, 42) + (trimmed.length > 42 ? "…" : "")
            : c.title,
          messages: [...c.messages, userMsg, thinkingMsg],
        };
      }),
    );

    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const fail = (message: string) => {
      setChats((prev) =>
        prev.map((c) => {
          if (c.id !== requestChatId) return c;
          return {
            ...c,
            messages: c.messages.map((m) =>
              m.id === thinkingId
                ? { ...m, content: `**Error:** ${message}`, timestamp: new Date() }
                : m,
            ),
          };
        }),
      );
    };

    if (!session?.access_token) {
      fail("You are not signed in. Please sign in again.");
      return;
    }

    const backendConversationId = chatsRef.current.find((c) => c.id === requestChatId)
      ?.backendConversationId;

    const result = await streamChatCompletion(
      session.access_token,
      {
        messages: [{ role: "user", content: trimmed }],
        conversation_id: backendConversationId ?? undefined,
      },
      {
        onToken: (delta) => {
          setChats((prev) =>
            prev.map((c) => {
              if (c.id !== requestChatId) return c;
              return {
                ...c,
                messages: c.messages.map((m) => {
                  if (m.id !== thinkingId) return m;
                  if (m.content === "__thinking__") {
                    return { ...m, content: delta, timestamp: new Date() };
                  }
                  return { ...m, content: m.content + delta, timestamp: new Date() };
                }),
              };
            }),
          );
        },
        onConversationId: (cid) => {
          setChats((prev) =>
            prev.map((c) =>
              c.id === requestChatId ? { ...c, backendConversationId: cid, historyLoaded: true } : c,
            ),
          );
        },
      },
    );

    if (result.error) {
      fail(result.error);
      return;
    }

    if (result.conversationId) {
      setChats((prev) =>
        prev.map((c) =>
          c.id === requestChatId
            ? {
                ...c,
                backendConversationId: result.conversationId ?? c.backendConversationId,
                historyLoaded: true,
              }
            : c,
        ),
      );
    }

    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== requestChatId) return c;
        const thinking = c.messages.find((m) => m.id === thinkingId);
        if (thinking?.content === "__thinking__") {
          return {
            ...c,
            messages: c.messages.map((m) =>
              m.id === thinkingId
                ? {
                    ...m,
                    content:
                      "**No response received.** Check that the backend is running and `GROQ_API_KEY` is set.",
                    timestamp: new Date(),
                  }
                : m,
            ),
          };
        }
        return c;
      }),
    );
  }, [activeChatId]);

  const handleDeleteChat = useCallback(async (chatId: string) => {
    const target = chatsRef.current.find((c) => c.id === chatId);
    if (target?.backendConversationId) {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        const res = await softDeleteConversation(session.access_token, target.backendConversationId);
        if (!res.ok) {
          setActionError(res.detail);
          return;
        }
      }
    }
    setActionError(null);
    setChats((prev) => {
      const next = prev.filter((c) => c.id !== chatId);
      if (next.length === 0) {
        return [createDraftChat()];
      }
      return next;
    });
  }, []);

  const historyLoading = Boolean(
    activeChat?.persisted && activeChat.historyLoaded === false && !activeChat.historyError,
  );

  return (
    <div className="chat-root">
      {actionError ? (
        <div className="chat-banner-error" role="alert">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="chat-banner-dismiss">
            Dismiss
          </button>
        </div>
      ) : null}
      <div className="chat-main-row">
        <Sidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((v) => !v)}
          chats={sidebarChats}
          activeChatId={effectiveActiveId}
          onSelectChat={setActiveChatId}
          onNewChat={handleNewChat}
          onDeleteChat={handleDeleteChat}
          user={user}
        />
        {activeChat ? (
          <ChatArea
            chat={activeChat}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            onSendMessage={handleSendMessage}
            historyLoading={historyLoading}
            historyError={activeChat.historyError ?? null}
            onRetryHistory={handleRetryHistory}
          />
        ) : null}
      </div>
      <style>{layoutStyles}</style>
    </div>
  );
}

const layoutStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .chat-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    background: #0d0d10;
    font-family: 'Inter', system-ui, sans-serif;
    overflow: hidden;
    position: relative;
  }

  .chat-main-row {
    flex: 1;
    display: flex;
    flex-direction: row;
    min-height: 0;
    min-width: 0;
  }

  .chat-banner-error {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 10px 16px;
    font-size: 13px;
    color: #fecaca;
    background: rgba(127, 29, 29, 0.35);
    border-bottom: 1px solid rgba(248, 113, 113, 0.25);
  }
  .chat-banner-dismiss {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
    color: #fecaca;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 6px;
    cursor: pointer;
  }
  .chat-banner-dismiss:hover {
    background: rgba(255,255,255,0.12);
  }

  [data-theme="light"] .chat-root {
    background: #f8f9fa;
  }
  [data-theme="light"] .chat-banner-error {
    color: #991b1b;
    background: rgba(254, 226, 226, 0.95);
    border-bottom: 1px solid rgba(248, 113, 113, 0.35);
  }
  [data-theme="light"] .chat-banner-dismiss {
    color: #991b1b;
    border-color: rgba(0,0,0,0.1);
  }
`;
