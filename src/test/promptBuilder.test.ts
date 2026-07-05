import { describe, expect, it } from "vitest";
import { buildSummaryPrompt, buildSystemPrompt } from "../core/promptBuilder";

describe("promptBuilder", () => {
  it("assembles the three context sections with file framing", () => {
    const prompt = buildSystemPrompt({
      files: [{ relPath: "src/a.ts", content: "const a = 1;" }],
      gitDiff: "diff --git a/src/a.ts",
      summaries: "Summary of conversation 1",
      estimatedTokens: 42,
      skipped: [],
    });
    expect(prompt).toContain("CODEBASE CONTEXT (whole codebase of the project):");
    expect(prompt).toContain("file: src/a.ts");
    expect(prompt).toContain("---- file start ----");
    expect(prompt).toContain("const a = 1;");
    expect(prompt).toContain("---- file end ----");
    expect(prompt).toContain("GIT DIFF CONTEXT (current uncommitted changes):");
    expect(prompt).toContain("diff --git a/src/a.ts");
    expect(prompt).toContain("CONVERSATION HISTORY CONTEXT (summaries of past conversations):");
    expect(prompt).toContain("Summary of conversation 1");
    expect(prompt).toContain("You are an AI assistant designed to analyze");
  });

  it("wraps the conversation into the summary prompt", () => {
    const prompt = buildSummaryPrompt("**User:**\n\nhello");
    expect(prompt).toContain("Summarize the following conversation about a codebase.");
    expect(prompt).toContain("**User:**\n\nhello");
    expect(prompt.trimEnd().endsWith("Concise Summary:")).toBe(true);
  });
});
