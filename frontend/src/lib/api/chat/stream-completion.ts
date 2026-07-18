import { getPublicApiBaseUrl } from "@/lib/config/public-env";

import type { ChatCompletionRequestBody, ChatEditRequestBody } from "./types";

export type StreamCompletionHandlers = {
  onToken: (delta: string) => void;
  onConversationId?: (conversationId: string) => void;
  onUserMessageId?: (messageId: string) => void;
};

export type StreamCompletionResult = {
  conversationId: string | null;
  userMessageId?: string | null;
  error?: string;
};

async function consumeChatSse(
  response: Response,
  handlers: StreamCompletionHandlers,
  conversationId: string | null
): Promise<StreamCompletionResult> {
  if (!response.body) {
    return { conversationId, error: "Empty response body" };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const segments = buffer.split("\n\n");
      buffer = segments.pop() ?? "";

      for (const segment of segments) {
        const lines = segment.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === "[DONE]") continue;

          try {
            const obj = JSON.parse(raw) as { text?: string; error?: string };
            if (typeof obj.error === "string") {
              return { conversationId, error: obj.error };
            }
            if (typeof obj.text === "string" && obj.text.length > 0) {
              handlers.onToken(obj.text);
            }
          } catch {
            /* skip malformed chunk */
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { conversationId };
}

async function postChatStream(
  accessToken: string,
  path: string,
  payload: Record<string, unknown>,
  handlers: StreamCompletionHandlers
): Promise<StreamCompletionResult> {
  const base = getPublicApiBaseUrl();
  if (!base) {
    return {
      conversationId: null,
      error:
        "Missing NEXT_PUBLIC_API_URL. Add it to .env.local (e.g. http://localhost:8000).",
    };
  }

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return {
      conversationId: null,
      error: e instanceof Error ? e.message : "Network error",
    };
  }

  const conversationId = response.headers.get("x-conversation-id");
  const userMessageId = response.headers.get("x-user-message-id");
  if (conversationId) {
    handlers.onConversationId?.(conversationId);
  }
  if (userMessageId) {
    handlers.onUserMessageId?.(userMessageId);
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const errBody = await response.json();
      if (typeof errBody?.detail === "string") detail = errBody.detail;
      else if (Array.isArray(errBody?.detail)) detail = JSON.stringify(errBody.detail);
    } catch {
      /* ignore */
    }
    return {
      conversationId: conversationId,
      userMessageId,
      error: `${response.status}: ${detail}`,
    };
  }

  const result = await consumeChatSse(response, handlers, conversationId);
  return { ...result, userMessageId };
}

/**
 * POST /api/v1/chat — SSE (`data: {"text":"..."}` … `data: [DONE]`).
 * Requires Supabase access_token (Bearer). Reads `X-Conversation-Id` when exposed via CORS.
 */
export async function streamChatCompletion(
  accessToken: string,
  body: ChatCompletionRequestBody,
  handlers: StreamCompletionHandlers
): Promise<StreamCompletionResult> {
  const payload: Record<string, unknown> = {
    messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
  };
  if (body.conversation_id) {
    payload.conversation_id = body.conversation_id;
  }
  if (body.attachment_ids && body.attachment_ids.length > 0) {
    payload.attachment_ids = body.attachment_ids;
  }
  return postChatStream(accessToken, "/api/v1/chat", payload, handlers);
}

/**
 * POST /api/v1/chat/edit — fork sibling branch + stream new assistant reply.
 */
export async function streamChatEdit(
  accessToken: string,
  body: ChatEditRequestBody,
  handlers: StreamCompletionHandlers
): Promise<StreamCompletionResult> {
  const payload: Record<string, unknown> = {
    conversation_id: body.conversation_id,
    message_id: body.message_id,
    content: body.content,
  };
  if (body.attachment_ids && body.attachment_ids.length > 0) {
    payload.attachment_ids = body.attachment_ids;
  }
  return postChatStream(accessToken, "/api/v1/chat/edit", payload, handlers);
}
