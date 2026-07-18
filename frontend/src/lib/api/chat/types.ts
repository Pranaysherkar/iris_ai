/** Payload aligned with FastAPI `ChatRequest` / `ChatMessage`. */
export type ChatApiMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ChatCompletionRequestBody = {
  messages: ChatApiMessage[];
  conversation_id?: string | null;
  attachment_ids?: string[] | null;
};

export type ChatEditRequestBody = {
  conversation_id: string;
  message_id: string;
  content: string;
  attachment_ids?: string[] | null;
};

export type BranchSelectRequestBody = {
  conversation_id: string;
  message_id: string;
};
