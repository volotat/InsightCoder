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
 *
 * It also handles the common continuation-turn case where the model's chat
 * template auto-prefills the opening `<think>`, so the response arrives with the
 * reasoning first and ONLY a closing `</think>` (no opening tag). When a closing
 * tag appears before any opening one, the splitter emits a `reclassify` event —
 * telling the consumer that everything streamed as answer so far was actually
 * reasoning — then treats the rest of the leading section as thinking.
 */
export class ThinkTagSplitter {
  private buffer = "";
  private mode: "answer" | "thinking" = "answer";
  /** Once we've entered a thinking block via an opening tag, stop watching for a bare closer. */
  private seenOpen = false;

  push(text: string): StreamEvent[] {
    this.buffer += text;
    const events: StreamEvent[] = [];
    for (;;) {
      if (this.mode === "thinking") {
        const idx = this.buffer.indexOf(CLOSE);
        if (idx !== -1) {
          this.emitInto(events, "thinking", this.buffer.slice(0, idx));
          this.buffer = this.buffer.slice(idx + CLOSE.length);
          this.mode = "answer";
          continue;
        }
        this.holdAndEmit(events, "thinking", [CLOSE]);
        return events;
      }

      // answer mode
      const openIdx = this.buffer.indexOf(OPEN);
      const closeIdx = this.seenOpen ? -1 : this.buffer.indexOf(CLOSE);
      const openFirst = openIdx !== -1 && (closeIdx === -1 || openIdx < closeIdx);

      if (openFirst) {
        this.emitInto(events, "text", this.buffer.slice(0, openIdx));
        this.buffer = this.buffer.slice(openIdx + OPEN.length);
        this.mode = "thinking";
        this.seenOpen = true;
        continue;
      }
      if (closeIdx !== -1) {
        // Bare closing tag: reasoning was auto-prefixed. Everything already
        // emitted as answer is really reasoning, as is the run before this tag.
        events.push({ type: "reclassify" });
        this.emitInto(events, "thinking", this.buffer.slice(0, closeIdx));
        this.buffer = this.buffer.slice(closeIdx + CLOSE.length);
        this.mode = "answer";
        this.seenOpen = true;
        continue;
      }
      this.holdAndEmit(events, "text", this.seenOpen ? [OPEN] : [OPEN, CLOSE]);
      return events;
    }
  }

  /** Emit whatever is left when the stream ends. */
  flush(): StreamEvent[] {
    if (!this.buffer) {
      return [];
    }
    const events: StreamEvent[] = [];
    this.emitInto(events, this.mode === "thinking" ? "thinking" : "text", this.buffer);
    this.buffer = "";
    return events;
  }

  private emitInto(events: StreamEvent[], kind: "thinking" | "text", text: string): void {
    if (text) {
      events.push(kind === "thinking" ? { type: "thinking", text } : { type: "text", text });
    }
  }

  /** Emit buffered content except a suffix that might be the start of one of `targets`. */
  private holdAndEmit(events: StreamEvent[], kind: "thinking" | "text", targets: string[]): void {
    const hold = Math.max(...targets.map((t) => partialSuffixLen(this.buffer, t)));
    const ready = this.buffer.slice(0, this.buffer.length - hold);
    if (ready) {
      this.emitInto(events, kind, ready);
      this.buffer = this.buffer.slice(ready.length);
    }
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
