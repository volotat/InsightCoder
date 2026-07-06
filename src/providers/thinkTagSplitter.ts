import type { StreamEvent } from "./types";

const OPEN = "<think>";
const CLOSE = "</think>";

/** Longest suffix of `buf` that is a proper prefix of `target` (a possible split tag). */
function partialSuffixLen(buf: string, target: string): number {
  const max = Math.min(buf.length, target.length - 1);
  for (let k = max; k > 0; k--) {
    if (buf.slice(buf.length - k) === target.slice(0, k)) {
      return k;
    }
  }
  return 0;
}

/**
 * Some OpenAI-compatible models (e.g. MiniMax M-series) do not use a separate
 * `reasoning_content` field — they inline their reasoning in the normal content
 * stream wrapped in `<think>…</think>`. This splits that stream into `thinking`
 * and `text` events, correctly handling tags that straddle chunk boundaries.
 */
export class ThinkTagSplitter {
  private buffer = "";
  private mode: "answer" | "thinking" = "answer";

  push(text: string): StreamEvent[] {
    this.buffer += text;
    const events: StreamEvent[] = [];
    for (;;) {
      const target = this.mode === "answer" ? OPEN : CLOSE;
      const idx = this.buffer.indexOf(target);
      if (idx !== -1) {
        const chunk = this.buffer.slice(0, idx);
        if (chunk) {
          events.push(this.emit(chunk));
        }
        this.buffer = this.buffer.slice(idx + target.length);
        this.mode = this.mode === "answer" ? "thinking" : "answer";
        continue;
      }
      // No complete tag: emit everything except a possible partial tag suffix.
      const hold = partialSuffixLen(this.buffer, target);
      const ready = this.buffer.slice(0, this.buffer.length - hold);
      if (ready) {
        events.push(this.emit(ready));
        this.buffer = this.buffer.slice(ready.length);
      }
      return events;
    }
  }

  /** Emit whatever is left when the stream ends. */
  flush(): StreamEvent[] {
    if (!this.buffer) {
      return [];
    }
    const event = this.emit(this.buffer);
    this.buffer = "";
    return [event];
  }

  private emit(text: string): StreamEvent {
    return this.mode === "thinking"
      ? { type: "thinking", text }
      : { type: "text", text };
  }
}

/**
 * Removes inline reasoning from a COMPLETE (non-streamed) string — used for
 * one-shot generations like summaries so the trace never lands in stored text.
 * Strips complete <think>…</think> blocks and any unterminated trailing one.
 */
export function stripThinkTags(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/<think>[\s\S]*$/, "")
    .trim();
}
