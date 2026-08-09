"use client";

import { useState, useCallback, useRef, useMemo, useLayoutEffect, useEffect } from "react";

import {
  fetchConversationList,
  fetchConversationHistory,
  selectConversationBranch,
  softDeleteConversation,
  type ConversationListItemDto,
  type HistoryMessageDto,
} from "@/lib/api/conversations";
import { streamChatCompletion, streamChatEdit } from "@/lib/api/chat";
import {
  deleteAttachment,
  getAttachment,
  listAttachments,
  uploadAttachment,
  type AttachmentDto,
} from "@/lib/api/attachments";
import type { PendingAttachment } from "./ChatInput";
import { streamSpeechChat } from "@/lib/api/speech";
import { AudioPlaybackQueue } from "@/lib/voice/audio-playback-queue";
import { LiveSpeechRecognizer } from "@/lib/voice/live-speech-recognition";
import { VoiceRecorder } from "@/lib/voice/voice-recorder";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { useToast } from "@/components/ui/ToastProvider";
import {
  friendlyChatNotice,
  friendlyEditError,
  friendlyUploadError,
} from "@/lib/ui/friendly-messages";

import Sidebar from "./Sidebar";
import ChatArea from "./ChatArea";

/** User-facing copy for API/network/backend failures — raw errors are never shown. */
const CHAT_GENERIC_USER_ERROR =
  "We're having trouble processing your request right now. Please try again in a moment.";

const SERVER_MESSAGE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isServerMessageId(id: string): boolean {
  return SERVER_MESSAGE_ID_RE.test(id.trim());
}

/** Strip leading `400: ` / `413: ` from API client error strings. */
function extractApiDetail(raw: string): string {
  const text = raw.trim();
  const m = text.match(/^\d{3}:\s*([\s\S]*)$/);
  return (m ? m[1] : text).trim();
}

function displayChatFailureMessage(raw: string): string {
  const detail = extractApiDetail(raw);
  const t = detail.toLowerCase();
  if (
    t.includes("not signed in") ||
    t.includes("sign in again") ||
    t.includes("please sign in")
  ) {
    return detail;
  }
  // Groq TPM / request-too-large (often news + history on free tier).
  if (
    t.includes("rate_limit") ||
    t.includes("tokens per minute") ||
    t.includes("request too large") ||
    t.includes("tpm")
  ) {
    return "This request was too large for the AI right now. Try a shorter question, or wait a moment and try again.";
  }
  return CHAT_GENERIC_USER_ERROR;
}

/** Edit / branch failures — clear, distinct from normal chat errors. */
function displayEditFailureMessage(raw: string): string {
  const detail = extractApiDetail(raw);
  const t = detail.toLowerCase();
  if (
    t.includes("not signed in") ||
    t.includes("sign in again") ||
    t.includes("please sign in")
  ) {
    return "You are not signed in. Please sign in again.";
  }
  if (t.includes("maximum") && t.includes("versions allowed")) {
    return "You've reached the limit of 3 versions for this message.";
  }
  if (t.includes("invalid message_id") || t.includes("invalid message id") || t.includes("still saving")) {
    return "This message is still saving. Try Edit again in a moment.";
  }
  if (t.includes("message not found")) {
    return "That message wasn’t found. Refresh the chat and try again.";
  }
  if (t.includes("save a reply") || t.includes("before editing")) {
    return "Send a reply first, then you can edit.";
  }
  if (t.includes("only user messages can be edited") || t.includes("active branch")) {
    return "Couldn’t edit this message. Please try again.";
  }
  return "Couldn’t edit this message. Please try again.";
}

export type MessageAttachment = {
  id: string;
  fileName: string;
  mimeType?: string | null;
  /** Short label e.g. PDF, PNG, DOCX */
  kindLabel: string;
};

export type BranchSibling = {
  id: string;
  branchVersion: number;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  /** How the user message was captured (shown in bubble). */
  inputMode?: "text" | "voice";
  /** Files shown as ChatGPT-style cards on the user turn. */
  attachments?: MessageAttachment[];
  /** ChatGPT-style edit versions for this user turn. */
  branchVersion?: number;
  branchTotal?: number;
  branchSiblings?: BranchSibling[];
};

function historyAttachmentToMessageAttachment(
  a: { id: string; file_name?: string | null; mime_type?: string | null },
): MessageAttachment {
  return {
    id: a.id,
    fileName: a.file_name || "file",
    mimeType: a.mime_type,
    kindLabel: attachmentKindLabel(a.file_name, a.mime_type),
  };
}

function mapHistoryMessages(
  rows: HistoryMessageDto[],
  previousMessages?: Message[],
): Message[] {
  return rows
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      const content = m.content;
      let inputMode: Message["inputMode"] | undefined;
      let attachments: MessageAttachment[] | undefined;

      if (m.role === "user") {
        // Prefer attachments embedded in history (authoritative after reopen).
        if (m.attachments?.length) {
          attachments = m.attachments.map(historyAttachmentToMessageAttachment);
        } else if (previousMessages?.length) {
          // Keep optimistic chips if history has not linked them yet.
          const prevWithFiles =
            previousMessages.find((p) => p.id === m.id && p.attachments?.length) ??
            previousMessages.find(
              (p) =>
                p.role === "user" &&
                !!p.attachments?.length &&
                p.content.trim() === content.trim(),
            );
          if (prevWithFiles?.attachments?.length) {
            attachments = prevWithFiles.attachments;
          }
        }

        if (previousMessages?.length) {
          const prevVoice = previousMessages.find(
            (p) =>
              p.role === "user" &&
              p.inputMode === "voice" &&
              p.content.trim() === content.trim(),
          );
          if (prevVoice) inputMode = "voice";
        }
      }

      return {
        id: m.id,
        role: m.role as "user" | "assistant",
        content,
        timestamp: m.created_at ? new Date(m.created_at) : new Date(),
        inputMode,
        attachments,
        branchVersion: m.branch_version ?? 1,
        branchTotal: m.branch_total ?? 1,
        branchSiblings: (m.branch_siblings ?? []).map((s) => ({
          id: s.id,
          branchVersion: s.branch_version,
        })),
      };
    });
}

function attachmentDtoToMessageAttachment(a: AttachmentDto): MessageAttachment {
  return historyAttachmentToMessageAttachment(a);
}

/** Overlay list-API files onto user bubbles (fallback when history has none). */
function mergeConversationAttachments(
  messages: Message[],
  rows: AttachmentDto[],
): Message[] {
  const activeIds = new Set(messages.map((m) => m.id));
  const byMessageId = new Map<string, MessageAttachment[]>();
  const orphans: AttachmentDto[] = [];

  for (const row of rows) {
    if (row.message_id && activeIds.has(row.message_id)) {
      const list = byMessageId.get(row.message_id) ?? [];
      list.push(attachmentDtoToMessageAttachment(row));
      byMessageId.set(row.message_id, list);
    } else {
      // null message_id, or linked to an inactive edit sibling
      orphans.push(row);
    }
  }

  let next = messages;
  if (byMessageId.size) {
    next = messages.map((m) => {
      if (m.role !== "user") return m;
      const linked = byMessageId.get(m.id);
      if (!linked?.length) return m;
      // History attachments win when already present; otherwise fill from list.
      if (m.attachments?.length) {
        const seen = new Set(m.attachments.map((a) => a.id));
        const extra = linked.filter((a) => !seen.has(a.id));
        return extra.length ? { ...m, attachments: [...m.attachments, ...extra] } : m;
      }
      return { ...m, attachments: linked };
    });
  }

  if (!orphans.length) return next;
  const userMsgs = next
    .filter((m) => m.role === "user")
    .slice()
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  if (!userMsgs.length) return next;

  const orphanByMsg = new Map<string, MessageAttachment[]>();
  for (const row of orphans) {
    const t = row.created_at ? new Date(row.created_at).getTime() : 0;
    const target =
      userMsgs.find((m) => m.timestamp.getTime() >= t) ?? userMsgs[userMsgs.length - 1];
    const list = orphanByMsg.get(target.id) ?? [];
    list.push(attachmentDtoToMessageAttachment(row));
    orphanByMsg.set(target.id, list);
  }

  return next.map((m) => {
    const extra = orphanByMsg.get(m.id);
    if (!extra?.length) return m;
    const existing = m.attachments ?? [];
    const seen = new Set(existing.map((a) => a.id));
    return {
      ...m,
      attachments: [...existing, ...extra.filter((a) => !seen.has(a.id))],
    };
  });
}

async function messagesFromHistory(
  accessToken: string,
  conversationId: string,
  rows: HistoryMessageDto[],
  previousMessages?: Message[],
): Promise<Message[]> {
  const mapped = mapHistoryMessages(rows, previousMessages);
  const historyHasFiles = rows.some(
    (r) => r.role === "user" && (r.attachments?.length ?? 0) > 0,
  );
  if (historyHasFiles) return mapped;

  // Fallback when history returned empty chips (legacy API / enrich failure).
  const atts = await listAttachments(accessToken, conversationId);
  if (!atts.data?.length) return mapped;
  return mergeConversationAttachments(mapped, atts.data);
}

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

/** Matches backend `DEFAULT_CONVERSATION_TITLE` and legacy UI copy. */
const DEFAULT_CHAT_TITLE = "New Chat";
const PLACEHOLDER_TITLES = new Set(["New Chat", "New conversation"]);

function isPlaceholderTitle(title: string | null | undefined): boolean {
  const t = title?.trim() ?? "";
  return t === "" || PLACEHOLDER_TITLES.has(t);
}

/** Same rules as backend `conversation_title_from_first_message` (60 chars). */
const MAX_SIDEBAR_TITLE_LEN = 60;

function titleFromFirstUserMessage(text: string): string {
  const collapsed = text.trim().replace(/\s+/g, " ");
  if (!collapsed) return DEFAULT_CHAT_TITLE;
  if (collapsed.length <= MAX_SIDEBAR_TITLE_LEN) return collapsed;
  return `${collapsed.slice(0, MAX_SIDEBAR_TITLE_LEN - 1)}…`;
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function attachmentKindLabel(fileName?: string | null, mimeType?: string | null): string {
  const name = (fileName || "").toLowerCase();
  const mime = (mimeType || "").toLowerCase();
  if (name.endsWith(".pdf") || mime === "application/pdf") return "PDF";
  if (name.endsWith(".png") || mime === "image/png") return "PNG";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg") || mime === "image/jpeg") return "JPEG";
  if (name.endsWith(".webp") || mime === "image/webp") return "WEBP";
  if (name.endsWith(".docx") || mime.includes("wordprocessingml")) return "DOCX";
  if (name.endsWith(".txt") || mime === "text/plain") return "TXT";
  if (mime.startsWith("image/")) return "Image";
  return "File";
}

function isPlaceholderVoiceContent(content: string): boolean {
  const t = content.trim();
  return t === "" || t === "Listening…" || t === "Transcribing…";
}

function assistantHasPartialReply(content: string): boolean {
  return content !== "__thinking__" && content.trim().length > 0;
}

function createDraftChat(): Chat {
  return {
    id: makeId(),
    title: DEFAULT_CHAT_TITLE,
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
    const apiTitleRaw = row.title?.trim() ?? "";

    if (existing) {
      const nextTitle =
        apiTitleRaw && !isPlaceholderTitle(apiTitleRaw) ? apiTitleRaw : existing.title;
      return { ...existing, title: nextTitle };
    }

    const createdAt = row.created_at ? new Date(row.created_at) : new Date();
    return {
      id: row.id,
      title: apiTitleRaw && !isPlaceholderTitle(apiTitleRaw) ? apiTitleRaw : DEFAULT_CHAT_TITLE,
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
  const { showToast } = useToast();
  // On mobile, sidebar is closed by default; on desktop it's open
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chats, setChats] = useState<Chat[]>(() => [createDraftChat()]);
  const [activeChatId, setActiveChatId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [historyRetryTick, setHistoryRetryTick] = useState(0);

  // Route chat notices through global toasts (auto-dismiss 5s).
  useEffect(() => {
    if (!actionError) return;
    const softened = friendlyEditError(friendlyUploadError(actionError));
    const { message, kind } = friendlyChatNotice(softened);
    showToast(message, kind);
    setActionError(null);
  }, [actionError, showToast]);

  const chatsRef = useRef(chats);
  /** Supabase conversation UUID per local chat id (synced before fetch — avoids race on 2nd message). */
  const backendIdByChatRef = useRef<Map<string, string>>(new Map());
  const voiceRecorderRef = useRef<VoiceRecorder | null>(null);
  const liveSpeechRef = useRef<LiveSpeechRecognizer | null>(null);
  const voiceLiveUserMsgIdRef = useRef<string | null>(null);
  const voiceLiveChatIdRef = useRef<string | null>(null);
  const audioQueueRef = useRef<AudioPlaybackQueue | null>(null);
  /** Prevents double-submit from mic tap + 2.5s silence VAD. */
  const voiceToggleLockRef = useRef(false);
  const handleVoiceToggleRef = useRef<(() => Promise<void>) | null>(null);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  /** True while TTS may play; false after user taps Stop (text stream continues). */
  const [voiceTtsActive, setVoiceTtsActive] = useState(false);
  /** True only while real TTS audio is playing (not merely while tokens stream). */
  const [voiceSpeaking, setVoiceSpeaking] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const attachPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  if (!voiceRecorderRef.current) voiceRecorderRef.current = new VoiceRecorder();
  if (!liveSpeechRef.current) liveSpeechRef.current = new LiveSpeechRecognizer();
  if (!audioQueueRef.current) audioQueueRef.current = new AudioPlaybackQueue();

  useEffect(() => {
    const queue = audioQueueRef.current;
    if (!queue) return;
    queue.setPlayingChangeListener((playing) => setVoiceSpeaking(playing));
    return () => queue.setPlayingChangeListener(null);
  }, []);

  useLayoutEffect(() => {
    chatsRef.current = chats;
    for (const c of chats) {
      if (c.backendConversationId) {
        backendIdByChatRef.current.set(c.id, c.backendConversationId);
      }
    }
  }, [chats]);

  // Initialize sidebar open state based on screen size
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setSidebarOpen(mq.matches);
    const handler = (e: MediaQueryListEvent) => setSidebarOpen(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

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
        if (process.env.NODE_ENV === "development") {
          console.warn("[chat history]", res.detail);
        }
        setChats((prev) =>
          prev.map((c) =>
            c.id === chat.id
              ? { ...c, historyLoaded: true, historyError: CHAT_GENERIC_USER_ERROR }
              : c,
          ),
        );
        return;
      }

      const previous = chatsRef.current.find((c) => c.id === chat.id)?.messages;
      const mapped = await messagesFromHistory(
        session.access_token,
        chat.backendConversationId!,
        res.messages,
        previous,
      );
      if (ac.signal.aborted) return;

      setChats((prev) =>
        prev.map((c) => {
          if (c.id !== chat.id) return c;
          const firstUser = mapped.find((m) => m.role === "user");
          const titleFromFirst =
            firstUser && isPlaceholderTitle(c.title)
              ? titleFromFirstUserMessage(firstUser.content)
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
    setPendingAttachments([]);
    // Close sidebar on mobile after selecting
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, []);

  const handleSelectChat = useCallback((id: string) => {
    setActiveChatId(id);
    // Close sidebar on mobile after selecting a chat
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, []);

  const handleSendMessage = useCallback(async (content: string, attachmentIds: string[] = []) => {
    const trimmed = content.trim();
    if (!trimmed) return;

    const list = chatsRef.current;
    const requestChatId =
      activeChatId && list.some((c) => c.id === activeChatId)
        ? activeChatId
        : (list.find(showChatInSidebar) ?? list[0])?.id ?? "";
    if (!requestChatId) return;

    setActionError(null);

    const idSet = new Set(attachmentIds);
    const messageAttachments: MessageAttachment[] = pendingAttachments
      .filter((a) => idSet.has(a.id) && a.ingestion_status === "ready" && !a.localError)
      .map((a) => ({
        id: a.id,
        fileName: a.file_name || "file",
        mimeType: a.mime_type,
        kindLabel: attachmentKindLabel(a.file_name, a.mime_type),
      }));

    const localUserMsgId = makeId();
    const userMsg: Message = {
      id: localUserMsgId,
      role: "user",
      content: trimmed,
      timestamp: new Date(),
      attachments: messageAttachments.length ? messageAttachments : undefined,
    };

    const thinkingId = makeId();
    const thinkingMsg: Message = {
      id: thinkingId,
      role: "assistant",
      content: "__thinking__",
      timestamp: new Date(),
    };

    // Move ready files from input chips into the message (ChatGPT-style)
    if (messageAttachments.length) {
      const sentIds = new Set(messageAttachments.map((a) => a.id));
      setPendingAttachments((prev) => prev.filter((a) => !sentIds.has(a.id)));
    }

    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== requestChatId) return c;
        const isFirstUserMsg = c.messages.filter((m) => m.role === "user").length === 0;
        return {
          ...c,
          historyLoaded: true,
          title: isFirstUserMsg ? DEFAULT_CHAT_TITLE : c.title,
          messages: [...c.messages, userMsg, thinkingMsg],
        };
      }),
    );

    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const fail = (message: string) => {
      const display = displayChatFailureMessage(message);
      if (
        display === CHAT_GENERIC_USER_ERROR &&
        message.trim() !== display &&
        process.env.NODE_ENV === "development"
      ) {
        console.warn("[chat]", message);
      }
      setActionError(display);
      setChats((prev) =>
        prev.map((c) => {
          if (c.id !== requestChatId) return c;
          return {
            ...c,
            messages: c.messages.map((m) => {
              if (m.id !== thinkingId) return m;
              if (assistantHasPartialReply(m.content)) return m;
              return { ...m, content: display, timestamp: new Date() };
            }),
          };
        }),
      );
    };

    if (!session?.access_token) {
      fail("You are not signed in. Please sign in again.");
      return;
    }

    const backendConversationId =
      backendIdByChatRef.current.get(requestChatId) ??
      chatsRef.current.find((c) => c.id === requestChatId)?.backendConversationId ??
      undefined;

    const result = await streamChatCompletion(
      session.access_token,
      {
        messages: [{ role: "user", content: trimmed }],
        conversation_id: backendConversationId ?? undefined,
        attachment_ids: attachmentIds.length ? attachmentIds : undefined,
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
          backendIdByChatRef.current.set(requestChatId, cid);
          setChats((prev) =>
            prev.map((c) =>
              c.id === requestChatId ? { ...c, backendConversationId: cid, historyLoaded: true } : c,
            ),
          );
        },
        onUserMessageId: (serverMsgId) => {
          if (!isServerMessageId(serverMsgId)) return;
          setChats((prev) =>
            prev.map((c) => {
              if (c.id !== requestChatId) return c;
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === localUserMsgId ? { ...m, id: serverMsgId } : m,
                ),
              };
            }),
          );
        },
      },
    );

    if (result.error) {
      fail(result.error);
      return;
    }

    const resolvedConversationId =
      result.conversationId ??
      backendIdByChatRef.current.get(requestChatId) ??
      chatsRef.current.find((c) => c.id === requestChatId)?.backendConversationId;

    if (result.conversationId) {
      backendIdByChatRef.current.set(requestChatId, result.conversationId);
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

    // Sync server UUIDs + branch metadata so Edit works immediately after send.
    if (resolvedConversationId) {
      const hist = await fetchConversationHistory(session.access_token, resolvedConversationId);
      if (hist.ok) {
        const previous = chatsRef.current.find((c) => c.id === requestChatId)?.messages;
        const mapped = await messagesFromHistory(
          session.access_token,
          resolvedConversationId,
          hist.messages,
          previous,
        );
        setChats((prev) =>
          prev.map((c) =>
            c.id === requestChatId
              ? {
                  ...c,
                  messages: mapped,
                  historyLoaded: true,
                }
              : c,
          ),
        );
      }
    }

    const listRes = await fetchConversationList(session.access_token);
    if (listRes.ok) {
      setChats((prev) => mergeLoadedConversations(prev, listRes.conversations));
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
                    content: CHAT_GENERIC_USER_ERROR,
                    timestamp: new Date(),
                  }
                : m,
            ),
          };
        }
        return c;
      }),
    );
  }, [activeChatId, pendingAttachments]);

  const handleEditMessage = useCallback(async (messageId: string, content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;

    if (!isServerMessageId(messageId)) {
      setActionError(
        "This message is still saving. Try Edit again in a moment.",
      );
      return;
    }

    const list = chatsRef.current;
    const requestChatId =
      activeChatId && list.some((c) => c.id === activeChatId)
        ? activeChatId
        : (list.find(showChatInSidebar) ?? list[0])?.id ?? "";
    if (!requestChatId) return;

    const chat = list.find((c) => c.id === requestChatId);
    const backendConversationId =
      backendIdByChatRef.current.get(requestChatId) ?? chat?.backendConversationId ?? undefined;
    if (!backendConversationId) {
      setActionError("Send a reply first, then you can edit.");
      return;
    }

    const msgIndex = chat?.messages.findIndex((m) => m.id === messageId) ?? -1;
    if (msgIndex < 0) return;

    // Snapshot for rollback — never leave a fake Iris “error reply” in the thread.
    const previousMessages = chat?.messages ?? [];

    setActionError(null);
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
        const kept = c.messages.slice(0, msgIndex).concat({
          ...c.messages[msgIndex],
          content: trimmed,
          timestamp: new Date(),
        });
        return { ...c, messages: [...kept, thinkingMsg] };
      }),
    );

    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const failEdit = (message: string) => {
      setActionError(displayEditFailureMessage(message));
      setChats((prev) =>
        prev.map((c) =>
          c.id === requestChatId ? { ...c, messages: previousMessages } : c,
        ),
      );
    };

    if (!session?.access_token) {
      failEdit("You are not signed in. Please sign in again.");
      return;
    }

    const result = await streamChatEdit(
      session.access_token,
      {
        conversation_id: backendConversationId,
        message_id: messageId,
        content: trimmed,
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
      },
    );

    if (result.error) {
      failEdit(result.error);
      return;
    }

    const hist = await fetchConversationHistory(session.access_token, backendConversationId);
    if (hist.ok) {
      const previous = chatsRef.current.find((c) => c.id === requestChatId)?.messages;
      const mapped = await messagesFromHistory(
        session.access_token,
        backendConversationId,
        hist.messages,
        previous,
      );
      setChats((prev) =>
        prev.map((c) =>
          c.id === requestChatId
            ? {
                ...c,
                messages: mapped,
                historyLoaded: true,
              }
            : c,
        ),
      );
    }

    const listRes = await fetchConversationList(session.access_token);
    if (listRes.ok) {
      setChats((prev) => mergeLoadedConversations(prev, listRes.conversations));
    }
  }, [activeChatId]);

  const handleSelectBranch = useCallback(async (targetMessageId: string) => {
    const list = chatsRef.current;
    const requestChatId =
      activeChatId && list.some((c) => c.id === activeChatId)
        ? activeChatId
        : (list.find(showChatInSidebar) ?? list[0])?.id ?? "";
    if (!requestChatId) return;

    const chat = list.find((c) => c.id === requestChatId);
    const backendConversationId =
      backendIdByChatRef.current.get(requestChatId) ?? chat?.backendConversationId ?? undefined;
    if (!backendConversationId) return;

    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setActionError("You are not signed in. Please sign in again.");
      return;
    }

    setActionError(null);
    const res = await selectConversationBranch(
      session.access_token,
      backendConversationId,
      targetMessageId,
    );
    if (!res.ok) {
      setActionError("Couldn’t switch versions. Please try again.");
      return;
    }
    const previous = chatsRef.current.find((c) => c.id === requestChatId)?.messages;
    const mapped = await messagesFromHistory(
      session.access_token,
      backendConversationId,
      res.messages,
      previous,
    );
    setChats((prev) =>
      prev.map((c) =>
        c.id === requestChatId
          ? {
              ...c,
              messages: mapped,
              historyLoaded: true,
            }
          : c,
      ),
    );
  }, [activeChatId]);

  const handleUploadFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;

    // Show chips immediately so the user always gets feedback
    const entries = files.map((file) => ({
      tempId: `local-${crypto.randomUUID()}`,
      file,
    }));
    setActionError(null);
    setPendingAttachments((prev) => [
      ...prev,
      ...entries.map(({ tempId, file }) => ({
        id: tempId,
        file_name: file.name,
        mime_type: file.type || null,
        file_size_bytes: file.size,
        ingestion_status: "pending",
        uploading: true,
      })),
    ]);

    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      const msg = "You are not signed in. Please sign in again.";
      setActionError(msg);
      setPendingAttachments((prev) =>
        prev.map((a) =>
          entries.some((e) => e.tempId === a.id)
            ? { ...a, uploading: false, localError: msg, ingestion_status: "failed" }
            : a,
        ),
      );
      return;
    }

    const list = chatsRef.current;
    const requestChatId =
      activeChatId && list.some((c) => c.id === activeChatId)
        ? activeChatId
        : (list.find(showChatInSidebar) ?? list[0])?.id ?? "";
    const backendConversationId =
      (requestChatId && backendIdByChatRef.current.get(requestChatId)) ||
      list.find((c) => c.id === requestChatId)?.backendConversationId ||
      undefined;

    for (const { tempId, file } of entries) {
      const { data, error } = await uploadAttachment(
        session.access_token,
        file,
        backendConversationId,
      );
      if (error || !data) {
        const msg = friendlyUploadError(error || "Upload failed");
        setPendingAttachments((prev) =>
          prev.map((a) =>
            a.id === tempId
              ? { ...a, uploading: false, localError: msg, ingestion_status: "failed" }
              : a,
          ),
        );
        setActionError(msg);
        continue;
      }
      setPendingAttachments((prev) =>
        prev.map((a) => (a.id === tempId ? { ...data, uploading: false } : a)),
      );
    }
  }, [activeChatId]);

  const handleRemoveAttachment = useCallback(async (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
    if (id.startsWith("local-")) return;
    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await deleteAttachment(session.access_token, id);
  }, []);

  // Poll ingestion status for pending/processing attachments
  useEffect(() => {
    const pollIds = pendingAttachments
      .filter(
        (a) =>
          !a.localError &&
          !a.uploading &&
          !a.id.startsWith("local-") &&
          (a.ingestion_status === "pending" || a.ingestion_status === "processing"),
      )
      .map((a) => a.id)
      .sort()
      .join(",");

    if (!pollIds) {
      if (attachPollRef.current) {
        clearInterval(attachPollRef.current);
        attachPollRef.current = null;
      }
      return;
    }

    const tick = async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const ids = pollIds.split(",");
      for (const id of ids) {
        const { data } = await getAttachment(session.access_token, id);
        if (data) {
          setPendingAttachments((prev) =>
            prev.map((x) => (x.id === id ? { ...x, ...data } : x)),
          );
        }
      }
    };

    void tick();
    attachPollRef.current = setInterval(() => void tick(), 2000);
    return () => {
      if (attachPollRef.current) {
        clearInterval(attachPollRef.current);
        attachPollRef.current = null;
      }
    };
    // Only re-subscribe when the set of in-flight IDs changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pendingAttachments
      .filter(
        (a) =>
          !a.localError &&
          !a.uploading &&
          !a.id.startsWith("local-") &&
          (a.ingestion_status === "pending" || a.ingestion_status === "processing"),
      )
      .map((a) => a.id)
      .sort()
      .join(","),
  ]);

  const updateLiveVoiceUserMessage = useCallback((chatId: string, msgId: string, text: string) => {
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        const isFirstUserMsg = c.messages.filter((m) => m.role === "user").length <= 1;
        return {
          ...c,
          historyLoaded: true,
          title: isFirstUserMsg && text.trim() ? titleFromFirstUserMessage(text) : c.title,
          messages: c.messages.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  content: text.trim() || "Listening…",
                  inputMode: "voice",
                  timestamp: new Date(),
                }
              : m,
          ),
        };
      }),
    );
  }, []);

  const removeLiveVoiceUserMessage = useCallback((chatId: string, msgId: string) => {
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        return {
          ...c,
          messages: c.messages.filter((m) => m.id !== msgId),
        };
      }),
    );
  }, []);

  const finishVoiceTurn = useCallback(async () => {
    await audioQueueRef.current?.whenIdle();
    setVoiceBusy(false);
    setVoiceTtsActive(false);
    setVoiceSpeaking(false);
    audioQueueRef.current?.setMuted(false);
  }, []);

  /** Stop speaking only — LLM/text SSE keeps running until the reply is complete. */
  const handleStopVoiceTts = useCallback(() => {
    audioQueueRef.current?.setMuted(true);
    setVoiceTtsActive(false);
    setVoiceSpeaking(false);
  }, []);

  const handleVoiceToggle = useCallback(async () => {
    if (voiceBusy || voiceToggleLockRef.current) return;

    const recorder = voiceRecorderRef.current!;
    const liveSpeech = liveSpeechRef.current!;
    const audioQueue = audioQueueRef.current!;
    audioQueue.setMuted(false);
    setVoiceTtsActive(false);
    setVoiceSpeaking(false);

    const list = chatsRef.current;
    const requestChatId =
      activeChatId && list.some((c) => c.id === activeChatId)
        ? activeChatId
        : (list.find(showChatInSidebar) ?? list[0])?.id ?? "";

    if (!voiceRecording) {
      setActionError(null);
      if (!requestChatId) return;

      const userMsgId = makeId();
      voiceLiveUserMsgIdRef.current = userMsgId;
      voiceLiveChatIdRef.current = requestChatId;

      setChats((prev) =>
        prev.map((c) => {
          if (c.id !== requestChatId) return c;
          return {
            ...c,
            historyLoaded: true,
            messages: [
              ...c.messages,
              {
                id: userMsgId,
                role: "user" as const,
                content: "Listening…",
                timestamp: new Date(),
                inputMode: "voice" as const,
              },
            ],
          };
        }),
      );

      try {
        await recorder.start({
          silenceMs: 2500,
          onSilence: () => {
            // End-of-speech VAD — same path as tapping mic again.
            void handleVoiceToggleRef.current?.();
          },
        });
        if (LiveSpeechRecognizer.supported()) {
          liveSpeech.start({
            onInterim: (text) => updateLiveVoiceUserMessage(requestChatId, userMsgId, text),
            onFinal: (text) => updateLiveVoiceUserMessage(requestChatId, userMsgId, text),
          });
        }
        setVoiceRecording(true);
      } catch {
        liveSpeech.cancel();
        removeLiveVoiceUserMessage(requestChatId, userMsgId);
        voiceLiveUserMsgIdRef.current = null;
        voiceLiveChatIdRef.current = null;
        setActionError("Microphone access was denied. Allow mic permission and try again.");
      }
      return;
    }

    voiceToggleLockRef.current = true;
    setVoiceRecording(false);
    setVoiceBusy(true);
    setVoiceTtsActive(true);
    audioQueue.setMuted(false);

    const userMsgId = voiceLiveUserMsgIdRef.current;
    const liveChatId = voiceLiveChatIdRef.current ?? requestChatId;
    voiceLiveUserMsgIdRef.current = null;
    voiceLiveChatIdRef.current = null;

    const clientTranscript = liveSpeech.stop();

    if (!liveChatId || !userMsgId) {
      recorder.cancel();
      setVoiceBusy(false);
      setVoiceTtsActive(false);
      voiceToggleLockRef.current = false;
      return;
    }

    let audioBlob: Blob;
    try {
      const recorded = await recorder.stop();
      audioBlob = recorded.blob;
    } catch {
      removeLiveVoiceUserMessage(liveChatId, userMsgId);
      setActionError("Could not capture audio. Please try again.");
      setVoiceBusy(false);
      setVoiceTtsActive(false);
      voiceToggleLockRef.current = false;
      return;
    }

    if (audioBlob.size < 800 && !clientTranscript.trim()) {
      removeLiveVoiceUserMessage(liveChatId, userMsgId);
      setActionError("Recording too short. Hold the mic a little longer.");
      setVoiceBusy(false);
      setVoiceTtsActive(false);
      voiceToggleLockRef.current = false;
      return;
    }

    if (clientTranscript.trim()) {
      updateLiveVoiceUserMessage(liveChatId, userMsgId, clientTranscript);
    }

    const thinkingId = makeId();
    const thinkingMsg: Message = {
      id: thinkingId,
      role: "assistant",
      content: "__thinking__",
      timestamp: new Date(),
    };

    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== liveChatId) return c;
        const isFirstUserMsg = c.messages.filter((m) => m.role === "user").length <= 1;
        const userMsg = c.messages.find((m) => m.id === userMsgId);
        const userText = userMsg?.content ?? clientTranscript;
        return {
          ...c,
          historyLoaded: true,
          title:
            isFirstUserMsg && userText && !isPlaceholderVoiceContent(userText)
              ? titleFromFirstUserMessage(userText)
              : c.title,
          messages: [...c.messages, thinkingMsg],
        };
      }),
    );

    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const fail = (message: string) => {
      const display = displayChatFailureMessage(message);
      if (
        display === CHAT_GENERIC_USER_ERROR &&
        message.trim() !== display &&
        process.env.NODE_ENV === "development"
      ) {
        console.warn("[voice chat]", message);
      }
      audioQueue.stop();
      setVoiceTtsActive(false);
      audioQueue.setMuted(false);
      setActionError(display);
      setChats((prev) =>
        prev.map((c) => {
          if (c.id !== liveChatId) return c;
          return {
            ...c,
            messages: c.messages
              .map((m) => {
                if (m.id === thinkingId) {
                  if (assistantHasPartialReply(m.content)) return m;
                  return { ...m, content: display, timestamp: new Date() };
                }
                if (m.id === userMsgId && isPlaceholderVoiceContent(m.content)) {
                  return null;
                }
                return m;
              })
              .filter((m): m is Message => m !== null),
          };
        }),
      );
    };

    if (!session?.access_token) {
      fail("You are not signed in. Please sign in again.");
      setVoiceBusy(false);
      setVoiceTtsActive(false);
      audioQueue.setMuted(false);
      voiceToggleLockRef.current = false;
      return;
    }

    const backendConversationId =
      backendIdByChatRef.current.get(liveChatId) ??
      chatsRef.current.find((c) => c.id === liveChatId)?.backendConversationId ??
      undefined;

    audioQueue.stop();

    const setVoiceAssistantFullReply = (fullText: string) => {
      if (!fullText.trim()) return;
      setChats((prev) =>
        prev.map((c) => {
          if (c.id !== liveChatId) return c;
          return {
            ...c,
            messages: c.messages.map((m) =>
              m.id === thinkingId
                ? { ...m, content: fullText, timestamp: new Date() }
                : m,
            ),
          };
        }),
      );
    };

    let pendingFullReply: string | null = null;

    const result = await streamSpeechChat(
      session.access_token,
      audioBlob,
      {
        onTranscript: (text) => {
          // Sarvam final STT replaces browser live preview in the user bubble.
          updateLiveVoiceUserMessage(liveChatId, userMsgId, text);
        },
        onConversationId: (cid) => {
          backendIdByChatRef.current.set(liveChatId, cid);
          setChats((prev) =>
            prev.map((c) =>
              c.id === liveChatId
                ? { ...c, backendConversationId: cid, historyLoaded: true }
                : c,
            ),
          );
        },
        // Full reply text (incl. code) streams here; TTS separately speaks prose only.
        onToken: (delta) => {
          setChats((prev) =>
            prev.map((c) => {
              if (c.id !== liveChatId) return c;
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
        onAudio: (chunk) => {
          // Dropped when user stops voice; text stream above keeps going.
          audioQueue.enqueueBase64(chunk.data, chunk.mime);
        },
        onDone: (fullText) => {
          pendingFullReply = fullText;
        },
        onError: (message) => {
          if (process.env.NODE_ENV === "development") {
            console.warn("[voice chat stream]", message);
          }
        },
      },
      backendConversationId ?? undefined,
      clientTranscript.trim() || undefined,
    );

    if (result.error) {
      fail(result.error);
      setVoiceBusy(false);
      setVoiceTtsActive(false);
      audioQueue.setMuted(false);
      voiceToggleLockRef.current = false;
      return;
    }

    if (result.fullReply) {
      pendingFullReply = result.fullReply;
    }

    const resolvedConversationId =
      result.conversationId ??
      backendIdByChatRef.current.get(liveChatId) ??
      chatsRef.current.find((c) => c.id === liveChatId)?.backendConversationId;

    if (result.conversationId) {
      backendIdByChatRef.current.set(liveChatId, result.conversationId);
      setChats((prev) =>
        prev.map((c) =>
          c.id === liveChatId
            ? {
                ...c,
                backendConversationId: result.conversationId ?? c.backendConversationId,
                historyLoaded: true,
              }
            : c,
        ),
      );
    }

    // Sync server UUIDs so voice bubbles get Edit / branch controls like text chat.
    if (resolvedConversationId) {
      const prevMessages =
        chatsRef.current.find((c) => c.id === liveChatId)?.messages ?? [];
      const hist = await fetchConversationHistory(session.access_token, resolvedConversationId);
      if (hist.ok) {
        const mapped = await messagesFromHistory(
          session.access_token,
          resolvedConversationId,
          hist.messages,
          prevMessages,
        );
        setChats((prev) =>
          prev.map((c) =>
            c.id === liveChatId
              ? {
                  ...c,
                  messages: mapped,
                  historyLoaded: true,
                }
              : c,
          ),
        );
      }
    }

    const listRes = await fetchConversationList(session.access_token);
    if (listRes.ok) {
      setChats((prev) => mergeLoadedConversations(prev, listRes.conversations));
    }

    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== liveChatId) return c;
        const thinking = c.messages.find((m) => m.id === thinkingId);
        if (thinking?.content === "__thinking__") {
          return {
            ...c,
            messages: c.messages.map((m) =>
              m.id === thinkingId
                ? { ...m, content: CHAT_GENERIC_USER_ERROR, timestamp: new Date() }
                : m,
            ),
          };
        }
        return c;
      }),
    );

    await finishVoiceTurn();
    voiceToggleLockRef.current = false;

    if (pendingFullReply) {
      // Only apply streamed reply if history sync did not already replace the thread.
      const stillHasThinking = chatsRef.current
        .find((c) => c.id === liveChatId)
        ?.messages.some((m) => m.id === thinkingId);
      if (stillHasThinking) {
        setVoiceAssistantFullReply(pendingFullReply);
      }
    }
  }, [
    activeChatId,
    voiceBusy,
    voiceRecording,
    finishVoiceTurn,
    updateLiveVoiceUserMessage,
    removeLiveVoiceUserMessage,
  ]);

  handleVoiceToggleRef.current = handleVoiceToggle;

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
          if (process.env.NODE_ENV === "development") {
            console.warn("[delete conversation]", res.detail);
          }
          setActionError(CHAT_GENERIC_USER_ERROR);
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
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="chat-main-row">
        <Sidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((v) => !v)}
          chats={sidebarChats}
          activeChatId={effectiveActiveId}
          onSelectChat={handleSelectChat}
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
            onEditMessage={handleEditMessage}
            onSelectBranch={handleSelectBranch}
            onVoiceToggle={handleVoiceToggle}
            onStopVoiceTts={handleStopVoiceTts}
            onUploadFiles={handleUploadFiles}
            onRemoveAttachment={handleRemoveAttachment}
            pendingAttachments={pendingAttachments}
            voiceRecording={voiceRecording}
            voiceBusy={voiceBusy}
            voiceTtsActive={voiceTtsActive}
            voiceSpeaking={voiceSpeaking}
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

  /* ── Custom Global Scrollbar ── */
  * {
    scrollbar-width: thin;
    scrollbar-color: rgba(124, 106, 255, 0.2) transparent;
  }

  /* Chrome, Edge, Safari */
  *::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  *::-webkit-scrollbar-track {
    background: transparent;
  }
  *::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    border: 2px solid transparent;
    background-clip: content-box;
    transition: background 0.2s;
  }
  *::-webkit-scrollbar-thumb:hover {
    background: rgba(124, 106, 255, 0.4);
    border: 2px solid transparent;
    background-clip: content-box;
  }

  [data-theme="light"] {
    scrollbar-color: rgba(124, 106, 255, 0.3) transparent;
  }
  [data-theme="light"] *::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.15);
    border: 2px solid transparent;
    background-clip: content-box;
  }
  [data-theme="light"] *::-webkit-scrollbar-thumb:hover {
    background: rgba(124, 106, 255, 0.5);
    border: 2px solid transparent;
    background-clip: content-box;
  }

  .chat-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    width: 100vw;
    max-width: 100vw;
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
    overflow: hidden;
    position: relative;
  }

  /* Mobile overlay backdrop */
  .sidebar-backdrop {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 15;
    backdrop-filter: blur(2px);
    animation: backdropFadeIn 0.2s ease;
  }
  @keyframes backdropFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .chat-banner-error,
  .chat-banner-warning {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 20px;
    font-size: 13px;
    backdrop-filter: blur(8px);
  }
  .chat-banner-error {
    color: #fecaca;
    background: rgba(127, 29, 29, 0.4);
    border-bottom: 1px solid rgba(248, 113, 113, 0.2);
  }
  .chat-banner-warning {
    color: #fde68a;
    background: rgba(120, 53, 15, 0.45);
    border-bottom: 1px solid rgba(251, 191, 36, 0.28);
  }
  .chat-banner-dismiss {
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.15);
    color: inherit;
    font-size: 12px;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.2s;
  }
  .chat-banner-dismiss:hover {
    background: rgba(255,255,255,0.18);
  }

  /* On mobile: sidebar floats over content */
  @media (max-width: 767px) {
    .sidebar-backdrop { display: block; }
  }

  [data-theme="light"] .chat-root {
    background: #f8f9fa;
  }
  [data-theme="light"] .chat-banner-error {
    color: #991b1b;
    background: rgba(254, 226, 226, 0.95);
    border-bottom: 1px solid rgba(248, 113, 113, 0.35);
  }
  [data-theme="light"] .chat-banner-warning {
    color: #92400e;
    background: rgba(254, 243, 199, 0.95);
    border-bottom: 1px solid rgba(251, 191, 36, 0.45);
  }
  [data-theme="light"] .chat-banner-dismiss {
    color: inherit;
    border-color: rgba(0,0,0,0.1);
    background: rgba(0,0,0,0.05);
  }
  [data-theme="light"] .sidebar-backdrop {
    background: rgba(0, 0, 0, 0.3);
  }
`;
