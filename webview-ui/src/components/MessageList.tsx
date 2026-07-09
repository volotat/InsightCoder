import { useEffect, useRef, useState } from "preact/hooks";
import { post } from "../vscodeApi";
import {
  streaming,
  streamingText,
  streamingThinking,
  streamingThinkingTokens,
  thinkingActive,
  turnState,
  turns,
} from "../state";
import type { TurnDTO } from "../../../src/panel/protocol";
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
      <div class="message-header">
        <span class="message-role">Model</span>
      </div>
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

/** ChatGPT-style ‹ 2/3 › switcher, shown where a message has sibling branches. */
function SiblingNav({ turn }: { turn: TurnDTO }) {
  if (!turn.id || turn.siblingCount === undefined || turn.siblingCount <= 1) {
    return null;
  }
  const index = turn.siblingIndex ?? 0;
  const busy = turnState.value !== "idle";
  const go = (i: number) => post({ type: "selectSibling", id: turn.id!, index: i });
  return (
    <span class="sibling-nav">
      <button disabled={busy || index === 0} title="Previous version" onClick={() => go(index - 1)}>
        ‹
      </button>
      <span class="sibling-pos">
        {index + 1}/{turn.siblingCount}
      </span>
      <button
        disabled={busy || index === turn.siblingCount - 1}
        title="Next version"
        onClick={() => go(index + 1)}
      >
        ›
      </button>
    </span>
  );
}

function MessageEditor({ turn, onDone }: { turn: TurnDTO; onDone: () => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, []);

  const save = () => {
    const content = textareaRef.current?.value.trim();
    if (content && content !== turn.content && turn.id) {
      post({ type: "editMessage", id: turn.id, content });
    }
    onDone();
  };

  return (
    <div class="message-editor">
      <textarea
        ref={textareaRef}
        rows={Math.min(12, Math.max(3, turn.content.split("\n").length + 1))}
        defaultValue={turn.content}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            save();
          } else if (e.key === "Escape") {
            onDone();
          }
        }}
      />
      <div class="message-editor-actions">
        <button onClick={save}>{turn.role === "user" ? "Save & resend" : "Save"}</button>
        <button onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

export function MessageList() {
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  const busy = turnState.value !== "idle";

  return (
    <div class="message-list" ref={listRef}>
      {turns.value.length === 0 && !streaming.value && <WelcomeMessage />}
      {turns.value.map((t) => (
        <div class={`message ${t.role}`} key={t.id ?? t.timestamp}>
          <div class="message-header">
            <span class="message-role">{t.role === "user" ? "User" : "Model"}</span>
            <SiblingNav turn={t} />
          </div>
          {editingId === t.id ? (
            <MessageEditor turn={t} onDone={() => setEditingId(null)} />
          ) : (
            <>
              {t.role === "assistant" && t.thinking && (
                <ThinkingBlock thinking={t.thinking} tokens={t.thinkingTokens} />
              )}
              <Markdown source={t.content} />
              {t.id && !busy && (
                <div class="message-footer">
                  <button
                    class="message-edit-btn"
                    title={t.role === "user" ? "Edit and resend (creates a new branch)" : "Edit this response (creates a new branch)"}
                    onClick={() => setEditingId(t.id!)}
                  >
                    ✎ Edit
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ))}
      <StreamingMessage />
      <div ref={bottomRef} />
    </div>
  );
}
