import { describe, expect, it } from "vitest";
import { toWireMessages } from "../providers/openaiCompatProvider";

describe("toWireMessages", () => {
  it("restores <think> blocks on assistant history turns (MiniMax interleaved thinking)", () => {
    const wire = toWireMessages("SYS", [
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1", thinking: "let me reason" },
      { role: "user", content: "q2" },
    ]);
    expect(wire).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "q1" },
      { role: "assistant", content: "<think>let me reason</think>\n\na1" },
      { role: "user", content: "q2" },
    ]);
  });

  it("leaves assistant turns without thinking untouched", () => {
    const wire = toWireMessages("SYS", [
      { role: "user", content: "q" },
      { role: "assistant", content: "plain answer" },
    ]);
    expect(wire[2]).toEqual({ role: "assistant", content: "plain answer" });
  });

  it("never wraps user messages, even if a thinking field leaks onto one", () => {
    const wire = toWireMessages("SYS", [
      { role: "user", content: "q", thinking: "should be ignored" },
    ]);
    expect(wire[1]).toEqual({ role: "user", content: "q" });
  });
});
