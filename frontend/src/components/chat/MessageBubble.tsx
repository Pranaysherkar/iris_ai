"use client";

import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { Message } from "./ChatLayout";

type Props = {
  message: Message;
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
  };
  const low = classLang.toLowerCase();
  return m[low] ?? low;
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
            style={{ width: 28, height: "auto" }}
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
                          <span className="md-code-lang">{match[1]}</span>
                        </div>
                        <SyntaxHighlighter
                          language={lang}
                          style={oneDark}
                          PreTag="div"
                          customStyle={{
                            margin: 0,
                            padding: "14px 16px",
                            borderRadius: "0 0 12px 12px",
                            fontSize: "13px",
                            lineHeight: 1.55,
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
                          <span className="md-code-lang">code</span>
                        </div>
                        <pre className="md-plain-pre">
                          <code>{raw}</code>
                        </pre>
                      </div>
                    );
                  }
                  return <code className="inline-code">{children}</code>;
                },
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
  .msg-avatar-img {
    border-radius: 50%;
    object-fit: cover;
    aspect-ratio: 1;
    max-height: 28px;
  }

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

  .msg-markdown p { margin: 0 0 0.85em 0; }
  .msg-markdown p:last-child { margin-bottom: 0; }
  .msg-markdown ul, .msg-markdown ol {
    margin: 0.5em 0 0.85em 0;
    padding-left: 1.35em;
  }
  .msg-markdown li { margin: 0.25em 0; }
  .msg-markdown li::marker { color: #a89fff; }
  .msg-markdown strong { color: #f0eeff; font-weight: 600; }
  .msg-markdown a { color: #a89fff; text-decoration: underline; }
  .msg-markdown blockquote {
    margin: 0.6em 0;
    padding-left: 12px;
    border-left: 3px solid rgba(124,106,255,0.45);
    color: #c8c8dc;
  }
  .msg-markdown .md-code-frame {
    margin: 12px 0;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.1);
    max-width: 100%;
  }
  .msg-markdown .md-code-frame-head {
    display: flex;
    align-items: center;
    padding: 6px 12px;
    background: rgba(0,0,0,0.35);
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .msg-markdown .md-code-lang {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #b4b4c8;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
  .msg-markdown .md-plain-pre {
    margin: 0;
    padding: 14px 16px;
    background: #282c34;
    border-radius: 0 0 12px 12px;
    overflow-x: auto;
    font-size: 13px;
    line-height: 1.55;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    color: #e8e8f0;
  }

  /* Inline code */
  .inline-code {
    background: rgba(255,255,255,0.1);
    padding: 1px 5px;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
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
  [data-theme="light"] .msg-bubble-assistant .msg-text,
  [data-theme="light"] .msg-markdown p,
  [data-theme="light"] .msg-markdown li {
    color: #111118;
  }
  [data-theme="light"] .msg-markdown strong { color: #000; }
  [data-theme="light"] .msg-markdown .md-code-frame {
    border-color: rgba(0,0,0,0.12);
  }
  [data-theme="light"] .msg-markdown .md-code-frame-head {
    background: #eceef2;
    border-bottom-color: rgba(0,0,0,0.08);
  }
  [data-theme="light"] .msg-markdown .md-code-lang { color: #444; }
  [data-theme="light"] .msg-markdown .md-plain-pre {
    background: #1e1e2e;
    color: #e8e8f0;
  }
  [data-theme="light"] .msg-bubble-assistant .inline-code {
    background: rgba(0,0,0,0.06);
    color: #000;
  }
  [data-theme="light"] .msg-bubble-user .inline-code {
    background: rgba(0,0,0,0.2);
  }
`;
