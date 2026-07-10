import { getPublicApiBaseUrl } from "@/lib/config/public-env";

export type SpeechStreamHandlers = {
  onTranscript: (text: string) => void;
  onConversationId?: (id: string) => void;
  onToken: (delta: string) => void;
  onAudio: (chunk: { index: number; mime: string; data: string; phrase?: string }) => void;
  onDone?: (fullText: string) => void;
  onError?: (message: string) => void;
};

export type SpeechStreamResult = {
  conversationId: string | null;
  transcript: string | null;
  fullReply: string | null;
  error?: string;
};

type SpeechSsePayload =
  | { type: "transcript"; text: string; final?: boolean }
  | { type: "conversation_id"; id: string }
  | { type: "text"; delta: string }
  | { type: "audio"; index: number; phrase?: string; mime: string; data: string }
  | { type: "done"; text: string }
  | { type: "error"; message: string };

/**
 * POST /api/v1/speech/chat — SSE voice turn (STT → Groq → TTS).
 */
export async function streamSpeechChat(
  accessToken: string,
  audioBlob: Blob,
  handlers: SpeechStreamHandlers,
  conversationId?: string,
  clientTranscript?: string,
): Promise<SpeechStreamResult> {
  const base = getPublicApiBaseUrl();
  if (!base) {
    return {
      conversationId: null,
      transcript: null,
      fullReply: null,
      error: "Missing NEXT_PUBLIC_API_URL.",
    };
  }

  const form = new FormData();
  form.append("audio", audioBlob, "recording.webm");
  if (conversationId) {
    form.append("conversation_id", conversationId);
  }
  const trimmedClient = clientTranscript?.trim();
  if (trimmedClient) {
    form.append("client_transcript", trimmedClient);
  }

  let response: Response;
  try {
    response = await fetch(`${base}/api/v1/speech/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "text/event-stream",
      },
      body: form,
    });
  } catch (e) {
    return {
      conversationId: null,
      transcript: null,
      fullReply: null,
      error: e instanceof Error ? e.message : "Network error",
    };
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const errBody = await response.json();
      if (typeof errBody?.detail === "string") detail = errBody.detail;
    } catch {
      /* ignore */
    }
    return {
      conversationId: null,
      transcript: null,
      fullReply: null,
      error: `${response.status}: ${detail}`,
    };
  }

  if (!response.body) {
    return {
      conversationId: null,
      transcript: null,
      fullReply: null,
      error: "Empty response body",
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let resolvedConversationId: string | null = null;
  let transcript: string | null = null;
  let fullReply: string | null = null;

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
            const obj = JSON.parse(raw) as SpeechSsePayload;
            if (obj.type === "error") {
              handlers.onError?.(obj.message);
              return {
                conversationId: resolvedConversationId,
                transcript,
                fullReply,
                error: obj.message,
              };
            }
            if (obj.type === "conversation_id") {
              resolvedConversationId = obj.id;
              handlers.onConversationId?.(obj.id);
            } else if (obj.type === "transcript") {
              transcript = obj.text;
              handlers.onTranscript(obj.text);
            } else if (obj.type === "text") {
              handlers.onToken(obj.delta);
            } else if (obj.type === "audio") {
              handlers.onAudio({
                index: obj.index,
                phrase: obj.phrase,
                mime: obj.mime,
                data: obj.data,
              });
            } else if (obj.type === "done") {
              fullReply = obj.text;
              handlers.onDone?.(obj.text);
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

  return { conversationId: resolvedConversationId, transcript, fullReply };
}
