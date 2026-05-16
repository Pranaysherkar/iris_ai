"use client";

import { useState } from "react";
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
    max-width: min(72%, 520px);
    flex-shrink: 0;
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
    .msg-bubble-user { max-width: min(85%, 520px); }
    .msg-bubble { padding: 10px 14px; }
  }
  @media (max-width: 480px) {
    .msg-row { padding: 5px 10px; gap: 6px; }
    .msg-avatar-ring { width: 26px; height: 26px; }
    .msg-bubble-user { max-width: 90%; }
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
`;
