"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { Message } from "./ChatLayout";

type Props = {
  message: Message;
  onEditMessage?: (messageId: string, content: string) => Promise<void>;
  onSelectBranch?: (targetMessageId: string) => Promise<void>;
  actionsDisabled?: boolean;
};

/** Map fence labels to Prism languages (subset). */
function prismLanguage(classLang: string): string {
  const m: Record<string, string> = {
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    py: "python",
    sh: "bash",
    shell: "bash",
    yml: "yaml",
    md: "markdown",
    rs: "rust",
    go: "go",
    rb: "ruby",
    cpp: "cpp",
    c: "c",
    cs: "csharp",
    java: "java",
    swift: "swift",
    kt: "kotlin",
    sql: "sql",
    json: "json",
    html: "html",
    css: "css",
  };
  const low = classLang.toLowerCase();
  return m[low] ?? low;
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy!", err);
    }
  };

  return (
    <button className="md-code-copy-btn" onClick={handleCopy} title={copied ? "Copied!" : "Copy code"}>
      {copied ? <CheckIcon /> : <CopyIcon />}
      <span>{copied ? "Copied!" : "Copy"}</span>
    </button>
  );
}

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#4ade80" }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function MicBadgeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function FileDocIcon({ kind }: { kind: string }) {
  const isPdf = kind === "PDF";
  return (
    <span className={`msg-file-icon ${isPdf ? "msg-file-icon-pdf" : "msg-file-icon-generic"}`} aria-hidden>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    </span>
  );
}

export default function MessageBubble({
  message,
  onEditMessage,
  onSelectBranch,
  actionsDisabled = false,
}: Props) {
  const isUser = message.role === "user";
  const isThinking = message.content === "__thinking__";
  const attachments = message.attachments ?? [];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [busy, setBusy] = useState(false);
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const branchTotal = message.branchTotal ?? 1;
  const branchVersion = message.branchVersion ?? 1;
  const siblings = message.branchSiblings ?? [];
  const showBranchPager = branchTotal > 1 && siblings.length > 1;
  const hasServerId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      message.id,
    );
  const canEdit =
    Boolean(onEditMessage) && !actionsDisabled && !isThinking && hasServerId;

  useLayoutEffect(() => {
    if (!editing) return;
    const el = editTextareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(Math.max(el.scrollHeight, 88), 280);
    el.style.height = `${next}px`;
  }, [draft, editing]);

  const switchBranch = async (delta: -1 | 1) => {
    if (!onSelectBranch || busy || actionsDisabled) return;
    const ordered = [...siblings].sort((a, b) => a.branchVersion - b.branchVersion);
    const idx = ordered.findIndex((s) => s.id === message.id);
    const next = ordered[idx + delta];
    if (!next) return;
    setBusy(true);
    try {
      await onSelectBranch(next.id);
    } finally {
      setBusy(false);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(message.content);
  };

  const submitEdit = async () => {
    if (!onEditMessage || busy) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    // Close editor immediately so the chat can show the new branch + thinking reply.
    // Same text is allowed — ChatGPT-style regenerate / new sibling version.
    setBusy(true);
    setEditing(false);
    try {
      await onEditMessage(message.id, trimmed);
    } catch {
      // Parent surfaces errors; reopen editor with the draft if the call throws.
      setDraft(trimmed);
      setEditing(true);
    } finally {
      setBusy(false);
    }
  };

  if (isUser) {
    return (
      <div className="msg-row msg-row-user">
        <div className={`msg-user-stack${editing ? " msg-user-stack-editing" : ""}`}>
          {attachments.length > 0 ? (
            <div className="msg-file-list" aria-label="Attached files">
              {attachments.map((file) => (
                <div key={file.id} className="msg-file-card">
                  <FileDocIcon kind={file.kindLabel} />
                  <div className="msg-file-meta">
                    <span className="msg-file-name" title={file.fileName}>
                      {file.fileName}
                    </span>
                    <span className="msg-file-kind">{file.kindLabel}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {editing ? (
            <div className="msg-edit-panel">
              <textarea
                ref={editTextareaRef}
                className="msg-edit-textarea"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={busy}
                autoFocus
                spellCheck
                aria-label="Edit message"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cancelEdit();
                    return;
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submitEdit();
                  }
                }}
              />
              <div className="msg-edit-actions">
                <button
                  type="button"
                  className="msg-edit-btn msg-edit-cancel"
                  disabled={busy}
                  onClick={cancelEdit}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="msg-edit-btn msg-edit-save"
                  disabled={busy || !draft.trim()}
                  onClick={() => void submitEdit()}
                >
                  {busy ? "Sending…" : "Send"}
                </button>
              </div>
              <p className="msg-edit-hint">Enter to send · Shift+Enter for new line · Esc to cancel</p>
            </div>
          ) : (
            <div className="msg-bubble msg-bubble-user">
              {message.inputMode === "voice" ? (
                <span className="msg-voice-badge" title="Voice message">
                  <MicBadgeIcon />
                </span>
              ) : null}
              <p className="msg-text">{message.content}</p>
            </div>
          )}
          {!editing ? (
            <div className="msg-user-actions">
              {canEdit ? (
                <button
                  type="button"
                  className="msg-action-btn"
                  title="Edit message"
                  disabled={busy || actionsDisabled}
                  onClick={() => {
                    setDraft(message.content);
                    setEditing(true);
                  }}
                >
                  <PencilIcon />
                  <span>Edit</span>
                </button>
              ) : null}
              {showBranchPager ? (
                <div className="msg-branch-pager" aria-label="Message versions">
                  <button
                    type="button"
                    className="msg-branch-nav"
                    aria-label="Previous version"
                    disabled={busy || actionsDisabled || branchVersion <= 1}
                    onClick={() => void switchBranch(-1)}
                  >
                    ‹
                  </button>
                  <span className="msg-branch-label">
                    {branchVersion}/{branchTotal}
                  </span>
                  <button
                    type="button"
                    className="msg-branch-nav"
                    aria-label="Next version"
                    disabled={busy || actionsDisabled || branchVersion >= branchTotal}
                    onClick={() => void switchBranch(1)}
                  >
                    ›
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <style>{bubbleStyles}</style>
      </div>
    );
  }

  return (
    <div className="msg-row msg-row-assistant">
      <div className="msg-avatar-wrap">
        <div className="msg-avatar-ring">
          <Image
            src="/iris.gif"
            alt="Iris"
            width={34}
            height={20}
            unoptimized
            priority
            className="msg-avatar-img"
            style={{ width: "auto", height: "100%", objectFit: "contain" }}
          />
        </div>
      </div>
      <div className="msg-bubble msg-bubble-assistant">
        {isThinking ? (
          <div className="thinking-dots">
            <span />
            <span />
            <span />
          </div>
        ) : (
          <div className="msg-markdown msg-text">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code(props) {
                  const { children, className } = props;
                  const match = /language-(\w+)/.exec(className || "");
                  const raw = String(children).replace(/\n$/, "");
                  if (match) {
                    const lang = prismLanguage(match[1]);
                    return (
                      <div className="md-code-frame">
                        <div className="md-code-frame-head">
                          <div className="md-code-head-left">
                            <span className="md-code-dot" />
                            <span className="md-code-dot" />
                            <span className="md-code-dot" />
                            <span className="md-code-lang">{match[1]}</span>
                          </div>
                          <CopyButton code={raw} />
                        </div>
                        <SyntaxHighlighter
                          language={lang}
                          style={oneDark}
                          PreTag="div"
                          customStyle={{
                            margin: 0,
                            padding: "16px 18px",
                            borderRadius: "0 0 12px 12px",
                            fontSize: "13px",
                            lineHeight: 1.6,
                            background: "#1a1a2e",
                          }}
                          codeTagProps={{
                            style: {
                              fontFamily:
                                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                            },
                          }}
                        >
                          {raw}
                        </SyntaxHighlighter>
                      </div>
                    );
                  }
                  if (raw.includes("\n")) {
                    return (
                      <div className="md-code-frame md-code-plain">
                        <div className="md-code-frame-head">
                          <div className="md-code-head-left">
                            <span className="md-code-dot" />
                            <span className="md-code-dot" />
                            <span className="md-code-dot" />
                            <span className="md-code-lang">text</span>
                          </div>
                          <CopyButton code={raw} />
                        </div>
                        <pre className="md-plain-pre">
                          <code>{raw}</code>
                        </pre>
                      </div>
                    );
                  }
                  return <code className="inline-code">{children}</code>;
                },
                // Better table rendering
                table({ children }) {
                  return (
                    <div className="md-table-wrap">
                      <table className="md-table">{children}</table>
                    </div>
                  );
                },
                // Better heading rendering
                h1({ children }) { return <h2 className="md-h1">{children}</h2>; },
                h2({ children }) { return <h3 className="md-h2">{children}</h3>; },
                h3({ children }) { return <h4 className="md-h3">{children}</h4>; },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
      <style>{bubbleStyles}</style>
    </div>
  );
}

const bubbleStyles = `
  .msg-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 8px clamp(10px, 3vw, 24px);
    width: 100%;
    max-width: 860px;
    margin: 0 auto;
    animation: msgFadeIn 0.3s ease;
    box-sizing: border-box;
    min-width: 0;
  }
  @keyframes msgFadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .msg-row-user {
    flex-direction: row-reverse;
    justify-content: flex-start;
  }
  .msg-user-stack {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    max-width: min(85%, 520px);
    min-width: 0;
    width: 100%;
  }
  .msg-user-stack-editing {
    max-width: min(94%, 640px);
    align-items: stretch;
  }
  .msg-user-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
    min-height: 22px;
  }
  .msg-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: none;
    background: transparent;
    color: #8b8ba0;
    font-size: 12px;
    font-weight: 500;
    padding: 2px 4px;
    border-radius: 6px;
    cursor: pointer;
  }
  .msg-action-btn:hover:not(:disabled) {
    color: #d4d4e0;
    background: rgba(255, 255, 255, 0.06);
  }
  .msg-action-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .msg-branch-pager {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: #8b8ba0;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .msg-branch-nav {
    border: none;
    background: transparent;
    color: inherit;
    font-size: 16px;
    line-height: 1;
    padding: 0 4px;
    cursor: pointer;
    border-radius: 4px;
  }
  .msg-branch-nav:hover:not(:disabled) {
    color: #e8e8f0;
    background: rgba(255, 255, 255, 0.06);
  }
  .msg-branch-nav:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .msg-branch-label {
    min-width: 2.4em;
    text-align: center;
  }
  .msg-edit-panel {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 14px 12px;
    border-radius: 18px;
    background: rgba(28, 28, 36, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
    box-sizing: border-box;
  }
  .msg-edit-textarea {
    width: 100%;
    resize: none;
    overflow-y: auto;
    min-height: 88px;
    max-height: 280px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: #f3f3f8;
    padding: 14px 16px;
    font: inherit;
    font-size: 15px;
    line-height: 1.55;
    letter-spacing: 0.01em;
    box-sizing: border-box;
    outline: none;
    caret-color: #b8aeff;
  }
  .msg-edit-textarea:focus {
    border-color: rgba(124, 106, 255, 0.55);
    box-shadow: 0 0 0 3px rgba(124, 106, 255, 0.16);
    background: rgba(255, 255, 255, 0.055);
  }
  .msg-edit-textarea:disabled {
    opacity: 0.7;
  }
  .msg-edit-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 10px;
  }
  .msg-edit-btn {
    border: none;
    border-radius: 999px;
    min-height: 36px;
    padding: 0 16px;
    font-size: 13px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease, color 0.15s ease, opacity 0.15s ease;
  }
  .msg-edit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .msg-edit-cancel {
    background: rgba(255, 255, 255, 0.06);
    color: #d0d0dc;
  }
  .msg-edit-cancel:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
  .msg-edit-save {
    background: linear-gradient(135deg, #7c6aff 0%, #8f7dff 100%);
    color: #fff;
    min-width: 84px;
    box-shadow: 0 4px 14px rgba(124, 106, 255, 0.28);
  }
  .msg-edit-save:hover:not(:disabled) {
    background: linear-gradient(135deg, #6b59f0 0%, #7c6aff 100%);
  }
  .msg-edit-hint {
    margin: 0;
    font-size: 11px;
    color: #7a7a90;
    text-align: right;
    letter-spacing: 0.01em;
  }
  .msg-file-list {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    width: 100%;
  }
  .msg-file-card {
    display: flex;
    align-items: center;
    gap: 12px;
    width: min(100%, 280px);
    padding: 10px 12px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
  }
  .msg-file-icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: #fff;
  }
  .msg-file-icon-pdf {
    background: linear-gradient(145deg, #ef4444, #b91c1c);
  }
  .msg-file-icon-generic {
    background: linear-gradient(145deg, #6366f1, #4338ca);
  }
  .msg-file-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .msg-file-name {
    font-size: 13.5px;
    font-weight: 600;
    color: #f3f3f8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .msg-file-kind {
    font-size: 11.5px;
    color: #9a9ab0;
    letter-spacing: 0.02em;
  }
  .msg-row-assistant {
    flex-direction: row;
  }

  /* Avatar */
  .msg-avatar-wrap { flex-shrink: 0; padding-top: 3px; }
  .msg-avatar-ring {
    width: 30px; height: 30px;
    border-radius: 100px;
    background: linear-gradient(135deg, #7c6aff, #c084fc);
    padding: 1.5px;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 10px rgba(124,106,255,0.2);
    flex-shrink: 0;
    overflow: hidden;
  }
  .msg-avatar-img {
    height: 100%;
    width: auto;
    object-fit: contain;
  }

  /* Bubbles */
  .msg-bubble {
    padding: 12px 16px;
    border-radius: 18px;
    line-height: 1.65;
    min-width: 0;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  .msg-bubble-user {
    background: linear-gradient(135deg, #7c6aff 0%, #9d8cff 100%);
    border-bottom-right-radius: 5px;
    box-shadow: 0 4px 20px rgba(124,106,255,0.25);
    max-width: 100%;
    flex-shrink: 0;
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .msg-voice-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    background: rgba(255,255,255,0.18);
    color: rgba(255,255,255,0.95);
    flex-shrink: 0;
    margin-top: 1px;
  }
  .msg-bubble-assistant {
    background: transparent;
    border: none;
    padding: 4px 0;
    flex: 1;
    min-width: 0;
    max-width: 100%;
  }

  /* Text */
  .msg-text {
    font-size: clamp(13.5px, 2vw, 15px);
    color: #e8e8f0;
    margin: 0;
    word-break: break-word;
  }
  .msg-bubble-user .msg-text { color: #fff; font-size: clamp(13.5px, 2vw, 15px); }

  /* Markdown elements */
  .msg-markdown p { margin: 0 0 0.85em 0; word-break: break-word; overflow-wrap: anywhere; }
  .msg-markdown p:last-child { margin-bottom: 0; }
  .msg-markdown ul, .msg-markdown ol {
    margin: 0.5em 0 0.85em 0;
    padding-left: 1.4em;
  }
  .msg-markdown li { margin: 0.3em 0; }
  .msg-markdown li::marker { color: #a89fff; }
  .msg-markdown strong { color: #f0eeff; font-weight: 600; }
  .msg-markdown em { color: #c8c8dc; }
  .msg-markdown a { color: #a89fff; text-decoration: underline; text-underline-offset: 3px; }
  .msg-markdown a:hover { color: #c4b5fd; }
  .msg-markdown hr { border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 1em 0; }
  .msg-markdown blockquote {
    margin: 0.75em 0;
    padding: 8px 12px;
    border-left: 3px solid rgba(124,106,255,0.45);
    background: rgba(124,106,255,0.05);
    border-radius: 0 8px 8px 0;
    color: #c8c8dc;
  }

  /* Headings */
  .md-h1 { font-size: 1.2em; font-weight: 600; color: #f0eeff; margin: 0.8em 0 0.4em; }
  .md-h2 { font-size: 1.1em; font-weight: 600; color: #f0eeff; margin: 0.7em 0 0.35em; }
  .md-h3 { font-size: 1em; font-weight: 600; color: #f0eeff; margin: 0.6em 0 0.3em; }

  /* Code frame */
  .msg-markdown .md-code-frame {
    margin: 14px 0;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.08);
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  }
  .msg-markdown .md-code-frame-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: rgba(0,0,0,0.4);
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .md-code-head-left {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .md-code-dot {
    width: 10px; height: 10px;
    border-radius: 50%;
    background: rgba(255,255,255,0.15);
    flex-shrink: 0;
  }
  .md-code-dot:nth-child(1) { background: #ff6058; }
  .md-code-dot:nth-child(2) { background: #ffbe2e; }
  .md-code-dot:nth-child(3) { background: #2ac940; }
  .msg-markdown .md-code-lang {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #8888a8;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    margin-left: 6px;
  }
  .md-code-copy-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    cursor: pointer;
    padding: 4px 10px;
    border-radius: 6px;
    color: #8888a8;
    font-size: 11px;
    font-weight: 500;
    transition: all 0.2s;
  }
  .md-code-copy-btn:hover {
    background: rgba(124,106,255,0.12);
    border-color: rgba(124,106,255,0.3);
    color: #c4b5fd;
  }
  .md-code-copy-btn span { line-height: 1; }

  .msg-markdown .md-plain-pre {
    margin: 0;
    padding: 16px 18px;
    background: #1a1a2e;
    border-radius: 0 0 12px 12px;
    overflow-x: auto;
    font-size: 13px;
    line-height: 1.6;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    color: #e8e8f0;
  }

  /* Tables */
  .md-table-wrap {
    overflow-x: auto;
    margin: 12px 0;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.08);
  }
  .md-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13.5px;
  }
  .md-table th, .md-table td {
    padding: 10px 14px;
    text-align: left;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    color: #e8e8f0;
    white-space: nowrap;
  }
  .md-table th {
    background: rgba(255,255,255,0.05);
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #a89fff;
  }
  .md-table tr:last-child td { border-bottom: none; }
  .md-table tr:hover td { background: rgba(255,255,255,0.02); }

  /* Inline code */
  .inline-code {
    background: rgba(124,106,255,0.12);
    border: 1px solid rgba(124,106,255,0.2);
    padding: 2px 6px;
    border-radius: 5px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.875em;
    color: #c4b5fd;
  }
  .msg-bubble-user .inline-code {
    background: rgba(255,255,255,0.2);
    border-color: rgba(255,255,255,0.3);
    color: #fff;
  }

  /* Thinking dots */
  .thinking-dots {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 0;
    height: 24px;
  }
  .thinking-dots span {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: #7c6aff;
    opacity: 0.6;
    animation: dotPulse 1.2s ease-in-out infinite;
  }
  .thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
  .thinking-dots span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes dotPulse {
    0%, 100% { transform: scale(0.8); opacity: 0.4; }
    50%       { transform: scale(1.2); opacity: 1; }
  }

  /* Responsive */
  @media (max-width: 768px) {
    .msg-row { padding: 6px 14px; gap: 8px; }
    .msg-user-stack { max-width: min(85%, 520px); }
    .msg-bubble-user { max-width: 100%; }
    .msg-bubble { padding: 10px 14px; }
  }
  @media (max-width: 480px) {
    .msg-row { padding: 5px 10px; gap: 6px; }
    .msg-avatar-ring { width: 26px; height: 26px; }
    .msg-user-stack { max-width: 90%; }
    .msg-bubble-user { max-width: 100%; }
    .md-code-dot { display: none; }
  }

  /* --- Light Theme Overrides --- */
  [data-theme="light"] .msg-bubble-assistant { background: transparent; border: none; }
  [data-theme="light"] .msg-bubble-assistant .msg-text,
  [data-theme="light"] .msg-markdown p,
  [data-theme="light"] .msg-markdown li { color: #111118; }
  [data-theme="light"] .msg-markdown strong { color: #000; }
  [data-theme="light"] .msg-markdown em { color: #44445a; }
  [data-theme="light"] .msg-markdown a { color: #6a5acd; }
  [data-theme="light"] .msg-markdown blockquote {
    border-left-color: rgba(124,106,255,0.4);
    background: rgba(124,106,255,0.05);
    color: #44445a;
  }
  [data-theme="light"] .md-h1,
  [data-theme="light"] .md-h2,
  [data-theme="light"] .md-h3 { color: #111118; }
  [data-theme="light"] .msg-markdown .md-code-frame { border-color: rgba(0,0,0,0.1); }
  [data-theme="light"] .msg-markdown .md-code-frame-head {
    background: #eceef2;
    border-bottom-color: rgba(0,0,0,0.08);
  }
  [data-theme="light"] .msg-markdown .md-code-lang { color: #66667a; }
  [data-theme="light"] .md-code-copy-btn {
    background: rgba(0,0,0,0.04);
    border-color: rgba(0,0,0,0.1);
    color: #66667a;
  }
  [data-theme="light"] .md-code-copy-btn:hover {
    background: rgba(124,106,255,0.08);
    border-color: rgba(124,106,255,0.25);
    color: #6a5acd;
  }
  [data-theme="light"] .md-table-wrap { border-color: rgba(0,0,0,0.1); }
  [data-theme="light"] .md-table th {
    background: rgba(0,0,0,0.03);
    color: #6a5acd;
  }
  [data-theme="light"] .md-table th, [data-theme="light"] .md-table td {
    border-color: rgba(0,0,0,0.06);
    color: #111118;
  }
  [data-theme="light"] .inline-code {
    background: rgba(124,106,255,0.08);
    border-color: rgba(124,106,255,0.2);
    color: #6a5acd;
  }
  [data-theme="light"] .msg-file-card {
    background: #ffffff;
    border-color: rgba(0, 0, 0, 0.1);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
  }
  [data-theme="light"] .msg-file-name { color: #111118; }
  [data-theme="light"] .msg-file-kind { color: #6b6b80; }
  [data-theme="light"] .msg-action-btn { color: #6b6b80; }
  [data-theme="light"] .msg-action-btn:hover:not(:disabled) {
    color: #22222e;
    background: rgba(0, 0, 0, 0.05);
  }
  [data-theme="light"] .msg-branch-pager { color: #6b6b80; }
  [data-theme="light"] .msg-branch-nav:hover:not(:disabled) {
    color: #22222e;
    background: rgba(0, 0, 0, 0.05);
  }
  [data-theme="light"] .msg-edit-panel {
    background: #f7f7fa;
    border-color: rgba(0, 0, 0, 0.08);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
  }
  [data-theme="light"] .msg-edit-textarea {
    background: #fff;
    border-color: rgba(0, 0, 0, 0.1);
    color: #111118;
    caret-color: #6a5acd;
  }
  [data-theme="light"] .msg-edit-textarea:focus {
    border-color: rgba(124, 106, 255, 0.55);
    box-shadow: 0 0 0 3px rgba(124, 106, 255, 0.14);
    background: #fff;
  }
  [data-theme="light"] .msg-edit-cancel {
    background: rgba(0, 0, 0, 0.05);
    color: #44445a;
  }
  [data-theme="light"] .msg-edit-cancel:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.08);
    color: #111118;
  }
  [data-theme="light"] .msg-edit-hint { color: #8a8a9a; }
`;
