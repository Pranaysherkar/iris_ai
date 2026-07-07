"use client";

import { useState, useRef, KeyboardEvent } from "react";

type Props = {
  onSend: (content: string) => Promise<void>;
  onVoiceToggle?: () => Promise<void>;
  voiceRecording?: boolean;
  voiceBusy?: boolean;
  disabled?: boolean;
};

export default function ChatInput({
  onSend,
  onVoiceToggle,
  voiceRecording = false,
  voiceBusy = false,
  disabled = false,
}: Props) {
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
    if (!trimmed || sending || disabled || voiceRecording) return;
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

  const handleMicClick = async () => {
    if (!onVoiceToggle || voiceBusy || sending) return;
    await onVoiceToggle();
  };

  const inputLocked = sending || disabled || voiceBusy;
  const canSend = value.trim().length > 0 && !inputLocked && !voiceRecording;
  const micActive = voiceRecording;
  const showMic = Boolean(onVoiceToggle);

  return (
    <div className="chat-input-outer">
      <div className={`chat-input-wrap ${inputLocked ? "sending" : ""}`}>
        {showMic ? (
          <button
            type="button"
            className={`mic-btn ${micActive ? "mic-btn-active" : ""} ${voiceBusy ? "mic-btn-busy" : ""}`}
            onClick={handleMicClick}
            disabled={voiceBusy || sending}
            aria-label={
              voiceBusy
                ? "Processing voice"
                : micActive
                  ? "Stop recording and send"
                  : "Start voice message"
            }
            title={
              voiceBusy
                ? "Processing…"
                : micActive
                  ? "Tap to send"
                  : "Voice message"
            }
          >
            {voiceBusy ? <SpinnerIcon /> : <MicIcon active={micActive} />}
          </button>
        ) : null}

        <textarea
          ref={textareaRef}
          className="chat-textarea"
          placeholder={
            micActive ? "Listening… tap mic when done" : voiceBusy ? "Iris is responding…" : "Message Iris…"
          }
          value={value}
          rows={1}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={inputLocked || voiceRecording}
          aria-label="Chat message input"
        />

        <button
          className={`send-btn ${canSend ? "send-btn-active" : ""}`}
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send message"
        >
          {sending ? <SpinnerIcon /> : <SendIcon />}
        </button>
      </div>
      <p className="input-hint">
        {micActive ? (
          <>Tap <kbd>mic</kbd> again to send your voice message</>
        ) : (
          <>
            Press <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for new line
            {showMic ? <> · <kbd>mic</kbd> for voice</> : null}
          </>
        )}
      </p>
      <style>{inputStyles}</style>
    </div>
  );
}

function MicIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}
function SpinnerIcon() {
  return <span className="input-spinner" />;
}

const inputStyles = `
  .chat-input-outer {
    padding: 10px clamp(12px, 4vw, 24px) 16px;
    flex-shrink: 0;
    max-width: 900px;
    margin: 0 auto;
    width: 100%;
  }

  .chat-input-wrap {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 16px;
    padding: 12px 12px 12px 18px;
    transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
    box-shadow: 0 2px 20px rgba(0,0,0,0.2);
  }
  .chat-input-wrap:focus-within {
    border-color: rgba(124,106,255,0.5);
    box-shadow: 0 0 0 3px rgba(124,106,255,0.08), 0 8px 32px rgba(0,0,0,0.25);
    background: rgba(255,255,255,0.06);
  }
  .chat-input-wrap.sending {
    opacity: 0.85;
  }

  .mic-btn {
    width: 38px; height: 38px;
    border-radius: 12px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
    color: #8a8aa8;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.2s, color 0.2s, border-color 0.2s, transform 0.15s, box-shadow 0.2s;
  }
  .mic-btn:hover:not(:disabled) {
    background: rgba(124,106,255,0.12);
    color: #c4b5fd;
    border-color: rgba(124,106,255,0.35);
  }
  .mic-btn-active {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.45);
    color: #f87171;
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.12);
    animation: mic-pulse 1.2s ease-in-out infinite;
  }
  .mic-btn-busy {
    cursor: wait;
    opacity: 0.7;
  }
  .mic-btn:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
  @keyframes mic-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }

  .chat-textarea {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    resize: none;
    color: #e8e8f0;
    font-size: clamp(14px, 2vw, 15px);
    font-family: 'Inter', system-ui, sans-serif;
    line-height: 1.6;
    max-height: 200px;
    overflow-y: auto;
    padding: 0;
  }
  .chat-textarea::placeholder { color: #4a4a60; }
  .chat-textarea:disabled { opacity: 0.65; }

  .send-btn {
    width: 38px; height: 38px;
    border-radius: 12px;
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
    box-shadow: 0 4px 16px rgba(124,106,255,0.4);
  }
  .send-btn-active:hover {
    transform: scale(1.06) translateY(-1px);
    box-shadow: 0 6px 24px rgba(124,106,255,0.55);
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
    color: #2e2e42;
    text-align: center;
    margin-top: 8px;
    letter-spacing: 0.1px;
  }
  .input-hint kbd {
    font-family: inherit;
    font-size: 10.5px;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    color: #4a4a60;
  }

  @media (max-width: 640px) {
    .chat-input-outer { padding: 8px 12px 12px; }
    .input-hint { display: none; }
    .chat-input-wrap { padding: 10px 10px 10px 14px; border-radius: 14px; }
    .send-btn, .mic-btn { width: 36px; height: 36px; border-radius: 10px; }
  }

  [data-theme="light"] .chat-input-wrap {
    background: #ffffff;
    border-color: rgba(0,0,0,0.1);
    box-shadow: 0 2px 16px rgba(0,0,0,0.06);
  }
  [data-theme="light"] .chat-input-wrap:focus-within {
    border-color: rgba(124,106,255,0.5);
    box-shadow: 0 0 0 3px rgba(124,106,255,0.1), 0 8px 32px rgba(0,0,0,0.04);
    background: #ffffff;
  }
  [data-theme="light"] .chat-textarea { color: #111118; }
  [data-theme="light"] .chat-textarea::placeholder { color: #9090a8; }
  [data-theme="light"] .mic-btn {
    background: rgba(0,0,0,0.03);
    border-color: rgba(0,0,0,0.08);
    color: #66667a;
  }
  [data-theme="light"] .send-btn {
    background: rgba(0,0,0,0.03);
    border-color: rgba(0,0,0,0.08);
    color: #9090a8;
  }
  [data-theme="light"] .send-btn-active {
    background: linear-gradient(135deg, #7c6aff, #9d8cff);
    color: #fff;
    border-color: transparent;
  }
  [data-theme="light"] .input-hint { color: #c0c0d0; }
  [data-theme="light"] .input-hint kbd {
    background: rgba(0,0,0,0.04);
    border-color: rgba(0,0,0,0.1);
    color: #9090a8;
  }
`;
