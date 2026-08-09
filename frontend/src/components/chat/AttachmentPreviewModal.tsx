"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { getAttachmentPreview, type AttachmentPreviewDto } from "@/lib/api/attachments";

export type PreviewTarget = {
  id: string;
  fileName: string;
  mimeType?: string | null;
  kindLabel?: string;
};

type Props = {
  target: PreviewTarget | null;
  onClose: () => void;
};

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
}

export default function AttachmentPreviewModal({ target, onClose }: Props) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AttachmentPreviewDto | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!target) {
      setPreview(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const run = async () => {
      if (!isUuid(target.id)) {
        setError("This file isn’t ready to preview yet.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      setPreview(null);

      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        if (!cancelled) {
          setError("You are not signed in. Please sign in again.");
          setLoading(false);
        }
        return;
      }

      const res = await getAttachmentPreview(session.access_token, target.id);
      if (cancelled) return;
      if (res.error || !res.data) {
        setError("Couldn’t open preview. Please try again.");
        setLoading(false);
        return;
      }
      setPreview(res.data);
      setLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [target, onClose]);

  if (!mounted || !target) return null;

  const fileName = preview?.file_name || target.fileName || "Attachment";
  const kind = preview?.preview_kind || "";

  const body = (() => {
    if (loading) {
      return <p className="att-preview-status">Loading preview…</p>;
    }
    if (error) {
      return <p className="att-preview-status att-preview-error">{error}</p>;
    }
    if (!preview?.url) {
      return <p className="att-preview-status">No preview available.</p>;
    }

    if (kind === "image") {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="att-preview-image"
          src={preview.url}
          alt={fileName}
        />
      );
    }

    if (kind === "pdf" || kind === "text") {
      return (
        <iframe
          className="att-preview-frame"
          src={preview.url}
          title={fileName}
        />
      );
    }

    if (kind === "docx") {
      const officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(preview.url)}`;
      return (
        <div className="att-preview-docx">
          <iframe className="att-preview-frame" src={officeUrl} title={fileName} />
          <p className="att-preview-hint">
            If the document doesn’t load,{" "}
            <a href={preview.url} download={fileName}>
              download it
            </a>
            .
          </p>
        </div>
      );
    }

    return (
      <div className="att-preview-fallback">
        <p>Preview isn’t available for this file type.</p>
        <a className="att-preview-download" href={preview.url} download={fileName}>
          Download {fileName}
        </a>
      </div>
    );
  })();

  return createPortal(
    <div
      className="att-preview-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="att-preview-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="att-preview-header">
          <div className="att-preview-title-wrap">
            <h2 id={titleId} className="att-preview-title" title={fileName}>
              {fileName}
            </h2>
            {target.kindLabel ? (
              <span className="att-preview-badge">{target.kindLabel}</span>
            ) : null}
          </div>
          <button
            type="button"
            className="att-preview-close"
            onClick={onClose}
            aria-label="Close preview"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className="att-preview-body">{body}</div>
      </div>
      <style jsx global>{`
        .att-preview-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1200;
          background: rgba(6, 6, 12, 0.72);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: attPreviewIn 140ms ease-out;
        }
        @keyframes attPreviewIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .att-preview-panel {
          width: min(920px, 100%);
          height: min(84vh, 860px);
          display: flex;
          flex-direction: column;
          border-radius: 16px;
          background: #14141c;
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
          overflow: hidden;
        }
        .att-preview-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px 12px 18px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.02);
          flex-shrink: 0;
        }
        .att-preview-title-wrap {
          min-width: 0;
          flex: 1;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .att-preview-title {
          margin: 0;
          font-size: 14.5px;
          font-weight: 600;
          color: #f2f2f7;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .att-preview-badge {
          flex-shrink: 0;
          font-size: 11px;
          letter-spacing: 0.04em;
          color: #a5a5b8;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 999px;
          padding: 2px 8px;
        }
        .att-preview-close {
          flex-shrink: 0;
          width: 36px;
          height: 36px;
          border: none;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.06);
          color: #e8e8f0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .att-preview-close:hover {
          background: rgba(255, 255, 255, 0.12);
        }
        .att-preview-body {
          flex: 1;
          min-height: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0c0c12;
          padding: 12px;
        }
        .att-preview-image {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          border-radius: 8px;
        }
        .att-preview-frame {
          width: 100%;
          height: 100%;
          border: 0;
          border-radius: 8px;
          background: #fff;
        }
        .att-preview-docx {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-height: 0;
        }
        .att-preview-docx .att-preview-frame {
          flex: 1;
          min-height: 0;
        }
        .att-preview-hint {
          margin: 0;
          font-size: 12px;
          color: #9a9ab0;
          text-align: center;
        }
        .att-preview-hint a {
          color: #c4b5fd;
        }
        .att-preview-status {
          margin: 0;
          color: #c8c8d8;
          font-size: 14px;
        }
        .att-preview-error {
          color: #fca5a5;
        }
        .att-preview-fallback {
          text-align: center;
          color: #c8c8d8;
          display: flex;
          flex-direction: column;
          gap: 14px;
          align-items: center;
        }
        .att-preview-download {
          display: inline-flex;
          padding: 10px 16px;
          border-radius: 10px;
          background: #6d5efc;
          color: #fff;
          text-decoration: none;
          font-size: 13.5px;
          font-weight: 600;
        }
        [data-theme="light"] .att-preview-panel {
          background: #fff;
          border-color: rgba(0, 0, 0, 0.08);
        }
        [data-theme="light"] .att-preview-header {
          background: #f7f7fa;
          border-bottom-color: rgba(0, 0, 0, 0.06);
        }
        [data-theme="light"] .att-preview-title {
          color: #1a1a22;
        }
        [data-theme="light"] .att-preview-close {
          background: rgba(0, 0, 0, 0.05);
          color: #222;
        }
        [data-theme="light"] .att-preview-body {
          background: #f0f0f4;
        }
        @media (max-width: 640px) {
          .att-preview-backdrop {
            padding: 0;
          }
          .att-preview-panel {
            width: 100%;
            height: 100%;
            border-radius: 0;
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
