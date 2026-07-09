import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConversationStore } from "../core/conversationStore";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "insightcoder-store-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("ConversationStore", () => {
  it("creates a first conversation on init and persists appended turns", async () => {
    const store = new ConversationStore(dir);
    await store.init();
    expect(store.current().id).toBe(1);

    await store.appendTurn({ role: "user", content: "hello world", timestamp: "2026-07-05T10:00:00Z" });
    await store.appendTurn({ role: "assistant", content: "hi", timestamp: "2026-07-05T10:00:05Z" });

    const reloaded = new ConversationStore(dir);
    await reloaded.init();
    expect(reloaded.currentPath()).toHaveLength(2);
    expect(reloaded.current().title).toBe("hello world");
  });

  it("bumps the counter for new conversations and lists most-recent first", async () => {
    const store = new ConversationStore(dir);
    await store.init();
    await store.appendTurn({ role: "user", content: "first", timestamp: "2026-07-01T00:00:00Z" });
    const second = await store.startNew();
    expect(second.id).toBe(2);
    await store.appendTurn({ role: "user", content: "second", timestamp: "2026-07-02T00:00:00Z" });

    const metas = await store.list();
    expect(metas.map((m) => m.id)).toEqual([2, 1]);
  });

  it("switches and deletes conversations", async () => {
    const store = new ConversationStore(dir);
    await store.init();
    await store.appendTurn({ role: "user", content: "one", timestamp: "2026-07-01T00:00:00Z" });
    await store.startNew();
    await store.switchTo(1);
    expect(store.currentPath()[0].content).toBe("one");
    await store.delete(1);
    expect(store.current().id).toBe(2);
    expect((await store.list()).map((m) => m.id)).toEqual([2]);
  });

  it("collects summaries sorted by conversation number", async () => {
    const store = new ConversationStore(dir);
    await store.init();
    await store.writeSummary(2, "second summary");
    await store.writeSummary(1, "first summary");
    const summaries = await store.listSummaries();
    expect(summaries.indexOf("first summary")).toBeLessThan(summaries.indexOf("second summary"));
    expect(summaries).toContain("---- file start ----");
  });

  it("finds unsummarized conversations", async () => {
    const store = new ConversationStore(dir);
    await store.init();
    await store.appendTurn({ role: "user", content: "x", timestamp: "2026-07-01T00:00:00Z" });
    expect(await store.findUnsummarized()).toEqual([1]);
    await store.writeSummary(1, "done");
    expect(await store.findUnsummarized()).toEqual([]);
  });

  it("migrates legacy linear conversations into a single-branch tree", async () => {
    await fs.writeFile(
      path.join(dir, "conversation_3.json"),
      JSON.stringify({
        id: 3,
        title: "old one",
        createdAt: "2026-07-01T00:00:00Z",
        updatedAt: "2026-07-01T00:00:10Z",
        turns: [
          { role: "user", content: "legacy q", timestamp: "2026-07-01T00:00:00Z" },
          { role: "assistant", content: "legacy a", timestamp: "2026-07-01T00:00:10Z" },
        ],
      }),
      "utf-8"
    );
    const store = new ConversationStore(dir);
    await store.init();
    expect(store.current().id).toBe(3);
    const dto = store.currentPathDTO();
    expect(dto.map((t) => t.content)).toEqual(["legacy q", "legacy a"]);
    expect(dto.every((t) => t.siblingCount === 1)).toBe(true);
  });

  it("editAndBranch creates a sibling and preserves the original branch", async () => {
    const store = new ConversationStore(dir);
    await store.init();
    await store.appendTurn({ role: "user", content: "q1", timestamp: "2026-07-01T00:00:00Z" });
    await store.appendTurn({ role: "assistant", content: "a1", timestamp: "2026-07-01T00:00:01Z" });
    await store.appendTurn({ role: "user", content: "q2", timestamp: "2026-07-01T00:00:02Z" });
    await store.appendTurn({ role: "assistant", content: "a2", timestamp: "2026-07-01T00:00:03Z" });

    const q2 = store.currentPathDTO()[2];
    const role = await store.editAndBranch(q2.id, "q2 edited");
    expect(role).toBe("user");

    // Active branch: q1, a1, q2' — the edited turn is the new leaf, awaiting a reply.
    const dto = store.currentPathDTO();
    expect(dto.map((t) => t.content)).toEqual(["q1", "a1", "q2 edited"]);
    expect(dto[2].siblingIndex).toBe(1);
    expect(dto[2].siblingCount).toBe(2);
    // Unbranched turns show no switcher.
    expect(dto[0].siblingCount).toBe(1);

    // The original branch is intact and reachable.
    await store.selectSibling(dto[2].id, 0);
    expect(store.currentPathDTO().map((t) => t.content)).toEqual(["q1", "a1", "q2", "a2"]);
  });

  it("selectSibling follows the most recent descendants of the chosen branch", async () => {
    const store = new ConversationStore(dir);
    await store.init();
    await store.appendTurn({ role: "user", content: "q1", timestamp: "2026-07-01T00:00:00Z" });
    await store.appendTurn({ role: "assistant", content: "a1", timestamp: "2026-07-01T00:00:01Z" });
    const q1 = store.currentPathDTO()[0];
    await store.editAndBranch(q1.id, "q1 v2");
    await store.appendTurn({ role: "assistant", content: "a1 v2", timestamp: "2026-07-01T00:00:02Z" });
    await store.appendTurn({ role: "user", content: "follow-up", timestamp: "2026-07-01T00:00:03Z" });

    // Jump back to v1, then forward to v2 — the deep path is restored.
    const head = store.currentPathDTO()[0];
    await store.selectSibling(head.id, 0);
    expect(store.currentPathDTO().map((t) => t.content)).toEqual(["q1", "a1"]);
    await store.selectSibling(store.currentPathDTO()[0].id, 1);
    expect(store.currentPathDTO().map((t) => t.content)).toEqual(["q1 v2", "a1 v2", "follow-up"]);
  });

  it("editing an assistant turn branches without touching the question", async () => {
    const store = new ConversationStore(dir);
    await store.init();
    await store.appendTurn({ role: "user", content: "q", timestamp: "2026-07-01T00:00:00Z" });
    await store.appendTurn({ role: "assistant", content: "wrong answer", timestamp: "2026-07-01T00:00:01Z" });
    const answer = store.currentPathDTO()[1];
    const role = await store.editAndBranch(answer.id, "corrected answer");
    expect(role).toBe("assistant");
    expect(store.currentPathDTO().map((t) => t.content)).toEqual(["q", "corrected answer"]);
    expect(store.currentPathDTO()[1].siblingCount).toBe(2);
  });
});
