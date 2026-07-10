import { getPublicApiBaseUrl } from "@/lib/config/public-env";

export type AttachmentStatus = "pending" | "processing" | "ready" | "failed";

export type AttachmentDto = {
  id: string;
  file_name?: string | null;
  mime_type?: string | null;
  type?: string | null;
  file_size_bytes?: number | null;
  ingestion_status: AttachmentStatus | string;
  conversation_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

const ALLOWED_EXT = /\.(pdf|png|jpe?g|webp|docx|txt)$/i;

export function isAllowedAttachmentFile(file: File): boolean {
  if (ALLOWED_EXT.test(file.name)) return true;
  const t = (file.type || "").toLowerCase();
  return (
    t === "application/pdf" ||
    t === "image/png" ||
    t === "image/jpeg" ||
    t === "image/webp" ||
    t === "text/plain" ||
    t === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

export async function uploadAttachment(
  accessToken: string,
  file: File,
  conversationId?: string | null,
): Promise<{ data?: AttachmentDto; error?: string }> {
  const base = getPublicApiBaseUrl();
  if (!base) {
    return { error: "Missing NEXT_PUBLIC_API_URL." };
  }

  const form = new FormData();
  form.append("file", file);
  if (conversationId) {
    form.append("conversation_id", conversationId);
  }

  try {
    const res = await fetch(`${base}/api/v1/attachments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        if (typeof body?.detail === "string") detail = body.detail;
      } catch {
        /* ignore */
      }
      return { error: `${res.status}: ${detail}` };
    }
    const data = (await res.json()) as AttachmentDto;
    return { data };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed" };
  }
}

export async function getAttachment(
  accessToken: string,
  attachmentId: string,
): Promise<{ data?: AttachmentDto; error?: string }> {
  const base = getPublicApiBaseUrl();
  if (!base) return { error: "Missing NEXT_PUBLIC_API_URL." };
  try {
    const res = await fetch(`${base}/api/v1/attachments/${attachmentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      return { error: `${res.status}: ${res.statusText}` };
    }
    return { data: (await res.json()) as AttachmentDto };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Fetch failed" };
  }
}

export async function deleteAttachment(
  accessToken: string,
  attachmentId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const base = getPublicApiBaseUrl();
  if (!base) return { error: "Missing NEXT_PUBLIC_API_URL." };
  try {
    const res = await fetch(`${base}/api/v1/attachments/${attachmentId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      return { error: `${res.status}: ${res.statusText}` };
    }
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Delete failed" };
  }
}
