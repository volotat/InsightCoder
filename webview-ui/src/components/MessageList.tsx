import { useEffect, useRef, useState } from "preact/hooks";
import {
  streaming,
  streamingText,
  streamingThinking,
  streamingThinkingTokens,
  thinkingActive,
  turns,
} from "../state";
import { Markdown, renderMarkdown } from "./Markdown";
import { ThinkingBlock } from "./ThinkingBlock";

/** The in-flight assistant message: live thinking header + streaming answer. */
function StreamingMessage() {
  const [html, setHtml] = useState("");
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const unsubscribe = streamingText.subscribe(() => {
      if (raf.current !== null) {
        return;
      }
      raf.current = requestAnimationFrame(() => {
        raf.current = null;
        const text = streamingText.value;
        setHtml(text ? renderMarkdown(text + " ▍") : "");
      });
    });
    return () => {
      unsubscribe();
      if (raf.current !== null) {
        cancelAnimationFrame(raf.current);
      }
    };
  }, []);

  if (!streaming.value) {
    return null;
  }
  return (
    <div class="message assistant">
      <div class="message-role">Model</div>
      {(streamingThinking.value || thinkingActive.value) && (
        <ThinkingBlock
          thinking={streamingThinking.value}
          tokens={streamingThinkingTokens.value}
          live={thinkingActive.value}
        />
      )}
      {html && <div class="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />}
      {!html && !thinkingActive.value && <div class="thinking-placeholder">Working…</div>}
    </div>
  );
}

function WelcomeMessage() {
  return (
    <div class="welcome">
      <h2>InsightCoder</h2>
      <p>Ask anything about the project that is currently open in VS Code.</p>
      <p class="privacy-note">
        Your entire codebase (plus uncommitted changes) is sent to the selected
        LLM provider as context. Avoid using it on repositories with secrets or
        sensitive data.
      </p>
    </div>
  );
}

export function MessageList() {
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  useEffect(() => {
    const el = listRef.current;
    if (!el) {
      return;
    }
    const onScroll = () => {
      pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (pinnedToBottom.current) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  });

  return (
    <div class="message-list" ref={listRef}>
      {turns.value.length === 0 && !streaming.value && <WelcomeMessage />}
      {turns.value.map((t, i) => (
        <div class={`message ${t.role}`} key={i}>
          <div class="message-role">{t.role === "user" ? "User" : "Model"}</div>
          {t.role === "assistant" && t.thinking && (
            <ThinkingBlock thinking={t.thinking} tokens={t.thinkingTokens} />
          )}
          <Markdown source={t.content} />
        </div>
      ))}
      <StreamingMessage />
      <div ref={bottomRef} />
    </div>
  );
}
