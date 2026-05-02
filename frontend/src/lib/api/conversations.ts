import { getPublicApiBaseUrl } from "@/lib/config/public-env";

export type ConversationListItemDto = {
  id: string;
  title: string | null;
  updated_at: string | null;
  last_message_at: string | null;
  created_at: string;
};

export type ConversationListResponse = {
  conversations: ConversationListItemDto[];
};

export type HistoryMessageDto = {
  id: string;
  role: string;
  content: string;
  model_name?: string | null;
  created_at?: string | null;
};

export type ConversationHistoryResponse = {
  conversation_id: string;
  messages: HistoryMessageDto[];
};

async function authJson<T>(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<{ ok: true; data: T } | { ok: false; status: number; detail: string }> {
  const base = getPublicApiBaseUrl();
  if (!base) {
    return { ok: false, status: 0, detail: "Missing NEXT_PUBLIC_API_URL." };
  }
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init?.headers ?? {}),
      },
    });
  } catch (e) {
    return {
      ok: false,
      status: 0,
      detail: e instanceof Error ? e.message : "Network error",
    };
  }

  if (response.status === 204) {
    return { ok: true, data: undefined as T };
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
    return { ok: false, status: response.status, detail };
  }

  try {
    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, status: response.status, detail: "Invalid JSON response" };
  }
}

export async function fetchConversationList(
  accessToken: string,
  limit = 200
): Promise<{ ok: true; conversations: ConversationListItemDto[] } | { ok: false; detail: string }> {
  const path = `/api/v1/conversations?limit=${encodeURIComponent(String(limit))}`;
  const result = await authJson<ConversationListResponse>(accessToken, path);
  if (!result.ok) return { ok: false, detail: result.detail };
  return { ok: true, conversations: result.data.conversations };
}

export async function softDeleteConversation(
  accessToken: string,
  conversationId: string
): Promise<{ ok: true } | { ok: false; detail: string; status: number }> {
  const path = `/api/v1/conversations/${encodeURIComponent(conversationId)}`;
  const result = await authJson<undefined>(accessToken, path, { method: "DELETE" });
  if (!result.ok) return { ok: false, detail: result.detail, status: result.status };
  return { ok: true };
}

export async function fetchConversationHistory(
  accessToken: string,
  conversationId: string
): Promise<
  { ok: true; messages: HistoryMessageDto[] } | { ok: false; detail: string; status: number }
> {
  const path = `/api/v1/chat/history/${encodeURIComponent(conversationId)}`;
  const result = await authJson<ConversationHistoryResponse>(accessToken, path);
  if (!result.ok) return { ok: false, detail: result.detail, status: result.status };
  return { ok: true, messages: result.data.messages };
}
