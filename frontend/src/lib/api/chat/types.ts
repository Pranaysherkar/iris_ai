/** Payload aligned with FastAPI `ChatRequest` / `ChatMessage`. */
export type ChatApiMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ChatCompletionRequestBody = {
  messages: ChatApiMessage[];
  conversation_id?: string | null;
};
