import { useState } from "preact/hooks";

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

interface Props {
  thinking: string;
  tokens?: number;
  /** True while the model is actively producing this trace. */
  live?: boolean;
  /** Estimated token counts are prefixed with ~. */
  estimated?: boolean;
}

/**
 * Collapsible reasoning trace. Hidden by default; while live it shows a clear
 * animated "Thinking…" header with a continuously updating token count.
 */
export function ThinkingBlock({ thinking, tokens, live, estimated = true }: Props) {
  const [open, setOpen] = useState(false);
  if (!thinking && !live) {
    return null;
  }
  const tokenLabel =
    tokens && tokens > 0 ? `${estimated ? "~" : ""}${fmt(tokens)} tokens` : "";

  return (
    <div class={`thinking-block ${live ? "live" : ""}`}>
      <button
        class="thinking-header"
        onClick={() => setOpen((v) => !v)}
        title={open ? "Hide reasoning" : "Show reasoning"}
      >
        <span class="thinking-caret">{open ? "▾" : "▸"}</span>
        {live ? (
          <span class="thinking-live">
            <span class="thinking-dots">
              <span></span>
              <span></span>
              <span></span>
            </span>
            Thinking…
          </span>
        ) : (
          <span class="thinking-label">Thoughts</span>
        )}
        {tokenLabel && <span class="thinking-tokens">{tokenLabel}</span>}
      </button>
      {open && thinking && <pre class="thinking-body">{thinking}</pre>}
    </div>
  );
}
