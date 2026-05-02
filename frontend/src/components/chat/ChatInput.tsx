"use client";

import { useState, useRef, KeyboardEvent } from "react";

type Props = {
  onSend: (content: string) => Promise<void>;
};

export default function ChatInput({ onSend }: Props) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    adjustHeight();
  };

  const handleSend = async () => {
    const trimmed = value.trim();
    if (!trimmed || sending) return;
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setSending(true);
    try {
      await onSend(trimmed);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = value.trim().length > 0 && !sending;

  return (
    <div className="chat-input-outer">
      <div className={`chat-input-wrap ${sending ? "sending" : ""}`}>
        {/* Attachment button */}
        <button className="input-action-btn" title="Attach file" disabled={sending}>
          <AttachIcon />
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          placeholder="Message Iris…"
          value={value}
          rows={1}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={sending}
          aria-label="Chat message input"
        />

        {/* Send button */}
        <button
          className={`send-btn ${canSend ? "send-btn-active" : ""}`}
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send message"
        >
          {sending ? <SpinnerIcon /> : <SendIcon />}
        </button>
      </div>
      <p className="input-hint">Press Enter to send · Shift+Enter for new line</p>
      <style>{inputStyles}</style>
    </div>
  );
}

/* ── Icons ── */
function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
function AttachIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
function SpinnerIcon() {
  return <span className="input-spinner" />;
}

/* ── Styles ── */
const inputStyles = `
  .chat-input-outer {
    padding: 12px 20px 20px;
    flex-shrink: 0;
    max-width: 820px;
    margin: 0 auto;
    width: 100%;
  }

  .chat-input-wrap {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 16px;
    padding: 10px 10px 10px 14px;
    transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
  }
  .chat-input-wrap:focus-within {
    border-color: rgba(124,106,255,0.45);
    box-shadow: 0 0 0 3px rgba(124,106,255,0.08), 0 8px 32px rgba(0,0,0,0.3);
    background: rgba(255,255,255,0.05);
  }
  .chat-input-wrap.sending {
    opacity: 0.7;
    pointer-events: none;
  }

  .chat-textarea {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    resize: none;
    color: #e8e8f0;
    font-size: 14.5px;
    font-family: 'Inter', system-ui, sans-serif;
    line-height: 1.6;
    max-height: 200px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.1) transparent;
    padding: 2px 0;
  }
  .chat-textarea::placeholder { color: #4a4a60; }
  .chat-textarea::-webkit-scrollbar { width: 3px; }
  .chat-textarea::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }

  .input-action-btn {
    width: 34px; height: 34px;
    border-radius: 10px;
    background: none;
    border: none;
    color: #4a4a60;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: color 0.2s, background 0.2s;
  }
  .input-action-btn:hover { color: #8888a8; background: rgba(255,255,255,0.06); }
  .input-action-btn:disabled { opacity: 0.3; cursor: not-allowed; }

  .send-btn {
    width: 36px; height: 36px;
    border-radius: 10px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
    color: #4a4a60;
    display: flex; align-items: center; justify-content: center;
    cursor: not-allowed;
    flex-shrink: 0;
    transition: background 0.2s, color 0.2s, border-color 0.2s, transform 0.15s, box-shadow 0.2s;
  }
  .send-btn-active {
    background: linear-gradient(135deg, #7c6aff, #9d8cff);
    border-color: transparent;
    color: #fff;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(124,106,255,0.35);
  }
  .send-btn-active:hover {
    transform: scale(1.06);
    box-shadow: 0 6px 20px rgba(124,106,255,0.5);
  }
  .send-btn-active:active { transform: scale(0.96); }
  .send-btn:disabled:not(.send-btn-active) { opacity: 0.35; }

  .input-spinner {
    width: 16px; height: 16px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    display: inline-block;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .input-hint {
    font-size: 11px;
    color: #333344;
    text-align: center;
    margin-top: 8px;
  }

  @media (max-width: 640px) {
    .chat-input-outer { padding: 10px 12px 16px; }
    .input-hint { display: none; }
  }

  /* --- Light Theme Overrides --- */
  [data-theme="light"] .chat-input-wrap {
    background: #ffffff;
    border-color: rgba(0,0,0,0.1);
  }
  [data-theme="light"] .chat-input-wrap:focus-within {
    border-color: rgba(124,106,255,0.45);
    box-shadow: 0 0 0 3px rgba(124,106,255,0.1), 0 8px 32px rgba(0,0,0,0.05);
    background: #ffffff;
  }
  [data-theme="light"] .chat-textarea {
    color: #111118;
  }
  [data-theme="light"] .chat-textarea::placeholder {
    color: #8888a8;
  }
  [data-theme="light"] .input-action-btn {
    color: #8888a8;
  }
  [data-theme="light"] .input-action-btn:hover {
    background: rgba(0,0,0,0.04);
    color: #55556a;
  }
  [data-theme="light"] .send-btn {
    background: rgba(0,0,0,0.03);
    border-color: rgba(0,0,0,0.06);
    color: #8888a8;
  }
  [data-theme="light"] .send-btn-active {
    background: linear-gradient(135deg, #7c6aff, #9d8cff);
    color: #fff;
    border-color: transparent;
  }
  [data-theme="light"] .input-hint {
    color: #8888a8;
  }
`;
