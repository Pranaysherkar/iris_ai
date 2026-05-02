"use client";

import Image from "next/image";
import type { Message } from "./ChatLayout";

type Props = {
  message: Message;
};

/** Minimal markdown renderer: bold, code, newlines */
function renderMarkdown(text: string) {
  // Bold: **text**
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\n)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="inline-code">{part.slice(1, -1)}</code>;
    }
    if (part === "\n") return <br key={i} />;
    return part;
  });
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const isThinking = message.content === "__thinking__";

  if (isUser) {
    return (
      <div className="msg-row msg-row-user">
        <div className="msg-bubble msg-bubble-user">
          <p className="msg-text">{message.content}</p>
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
            width={28}
            height={28}
            unoptimized
            priority
            className="msg-avatar-img"
          />
        </div>
      </div>
      <div className="msg-bubble msg-bubble-assistant">
        {isThinking ? (
          <div className="thinking-dots">
            <span /><span /><span />
          </div>
        ) : (
          <p className="msg-text">{renderMarkdown(message.content)}</p>
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
    padding: 6px 24px;
    max-width: 820px;
    margin: 0 auto;
    width: 100%;
    animation: msgFadeIn 0.3s ease;
  }
  @keyframes msgFadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .msg-row-user {
    flex-direction: row-reverse;
  }
  .msg-row-assistant {
    flex-direction: row;
  }

  /* Avatar */
  .msg-avatar-wrap { flex-shrink: 0; padding-top: 2px; }
  .msg-avatar-ring {
    width: 32px; height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, #7c6aff, #c084fc);
    padding: 2px;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 12px rgba(124,106,255,0.2);
  }
  .msg-avatar-img { border-radius: 50%; object-fit: cover; }

  /* Bubbles */
  .msg-bubble {
    max-width: 75%;
    padding: 11px 16px;
    border-radius: 16px;
    line-height: 1.65;
  }
  .msg-bubble-user {
    background: linear-gradient(135deg, #7c6aff 0%, #9d8cff 100%);
    border-bottom-right-radius: 4px;
    box-shadow: 0 4px 16px rgba(124,106,255,0.25);
  }
  .msg-bubble-assistant {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-bottom-left-radius: 4px;
  }

  /* Text */
  .msg-text {
    font-size: 14.5px;
    color: #e8e8f0;
    margin: 0;
    word-break: break-word;
  }
  .msg-bubble-user .msg-text { color: #fff; }

  /* Inline code */
  .inline-code {
    background: rgba(255,255,255,0.1);
    padding: 1px 5px;
    border-radius: 4px;
    font-family: 'Geist Mono', 'Fira Code', monospace;
    font-size: 13px;
  }
  .msg-bubble-user .inline-code { background: rgba(255,255,255,0.2); }

  /* Thinking dots */
  .thinking-dots {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 2px 0;
    height: 22px;
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

  @media (max-width: 640px) {
    .msg-row { padding: 6px 14px; }
    .msg-bubble { max-width: 88%; }
  }

  /* --- Light Theme Overrides --- */
  [data-theme="light"] .msg-bubble-assistant {
    background: #f8f9fa;
    border-color: rgba(0,0,0,0.06);
  }
  [data-theme="light"] .msg-bubble-assistant .msg-text {
    color: #111118;
  }
  [data-theme="light"] .msg-bubble-assistant .inline-code {
    background: rgba(0,0,0,0.06);
    color: #000;
  }
  [data-theme="light"] .msg-bubble-user .inline-code {
    background: rgba(0,0,0,0.2);
  }
`;
