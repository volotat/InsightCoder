import { describe, expect, it } from "vitest";
import { stripThinkTags, ThinkTagSplitter } from "../providers/thinkTagSplitter";
import type { StreamEvent } from "../providers/types";

/** Feed the text in the given chunk sizes and collect all emitted events. */
function run(chunks: string[]): StreamEvent[] {
  const splitter = new ThinkTagSplitter();
  const events: StreamEvent[] = [];
  for (const c of chunks) {
    events.push(...splitter.push(c));
  }
  events.push(...splitter.flush());
  return events;
}

function joined(events: StreamEvent[], type: "thinking" | "text"): string {
  return events
    .filter((e) => e.type === type)
    .map((e) => (e as { text: string }).text)
    .join("");
}

/** Model the consumer: apply `reclassify` by moving answer-so-far into thinking. */
function consume(events: StreamEvent[]): { thinking: string; answer: string } {
  let thinking = "";
  let answer = "";
  for (const e of events) {
    if (e.type === "thinking") {
      thinking += e.text;
    } else if (e.type === "text") {
      answer += e.text;
    } else if (e.type === "reclassify") {
      thinking = answer + thinking;
      answer = "";
    }
  }
  return { thinking, answer };
}

describe("ThinkTagSplitter", () => {
  it("separates a single <think> block from the answer", () => {
    const events = run(["<think>reasoning here</think>the answer"]);
    expect(joined(events, "thinking")).toBe("reasoning here");
    expect(joined(events, "text")).toBe("the answer");
  });

  it("treats plain content with no tags as answer text", () => {
    const events = run(["just a normal answer"]);
    expect(joined(events, "thinking")).toBe("");
    expect(joined(events, "text")).toBe("just a normal answer");
  });

  it("handles an open tag split across chunk boundaries", () => {
    const events = run(["<thi", "nk>deep ", "thoughts</think>done"]);
    expect(joined(events, "thinking")).toBe("deep thoughts");
    expect(joined(events, "text")).toBe("done");
  });

  it("handles a close tag split across chunk boundaries", () => {
    const events = run(["<think>abc</thi", "nk>xyz"]);
    expect(joined(events, "thinking")).toBe("abc");
    expect(joined(events, "text")).toBe("xyz");
  });

  it("does not leak a partial tag as answer text before it completes", () => {
    const splitter = new ThinkTagSplitter();
    const first = splitter.push("<thin");
    // The partial tag must be held back, not emitted as text.
    expect(first).toEqual([]);
    const rest = splitter.push("k>hi</think>bye");
    const all = [...first, ...rest, ...splitter.flush()];
    expect(joined(all, "thinking")).toBe("hi");
    expect(joined(all, "text")).toBe("bye");
  });

  it("emits answer text that arrives before any think tag", () => {
    const events = run(["intro <think>mid</think> outro"]);
    expect(joined(events, "text")).toBe("intro  outro");
    expect(joined(events, "thinking")).toBe("mid");
  });

  it("flushes an unterminated think block as thinking", () => {
    const events = run(["<think>still going"]);
    expect(joined(events, "thinking")).toBe("still going");
    expect(joined(events, "text")).toBe("");
  });

  it("handles auto-prefixed reasoning (closing tag, no opening tag)", () => {
    // Continuation turns where the chat template prefilled <think>.
    const { thinking, answer } = consume(
      run(["reasoning line 1\n", "reasoning line 2</think>\n\nThe answer."])
    );
    expect(thinking).toBe("reasoning line 1\nreasoning line 2");
    expect(answer).toBe("\n\nThe answer.");
  });

  it("reclassifies across chunk boundaries with a split closing tag", () => {
    const { thinking, answer } = consume(run(["deep thought</thi", "nk>done"]));
    expect(thinking).toBe("deep thought");
    expect(answer).toBe("done");
  });

  it("does not reclassify a normal answer that has no tags", () => {
    const events = run(["a plain multi-chunk ", "answer with no reasoning"]);
    expect(events.some((e) => e.type === "reclassify")).toBe(false);
    expect(joined(events, "text")).toBe("a plain multi-chunk answer with no reasoning");
  });

  it("treats a later bare closing tag as literal text once a block was already opened", () => {
    // After a proper <think>…</think>, a stray </think> in the answer stays text.
    const { thinking, answer } = consume(run(["<think>r</think>ans </think> more"]));
    expect(thinking).toBe("r");
    expect(answer).toBe("ans </think> more");
  });
});

describe("stripThinkTags", () => {
  it("removes a leading reasoning block from a summary", () => {
    expect(stripThinkTags("<think>let me think</think>\n\nThe summary.")).toBe("The summary.");
  });

  it("removes multiple blocks and keeps the rest", () => {
    expect(stripThinkTags("<think>a</think>one <think>b</think>two")).toBe("one two");
  });

  it("drops an unterminated trailing block", () => {
    expect(stripThinkTags("Real summary.<think>oops no close")).toBe("Real summary.");
  });

  it("leaves plain text untouched", () => {
    expect(stripThinkTags("Just a summary.")).toBe("Just a summary.");
  });
});
