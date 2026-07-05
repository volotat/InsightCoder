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
    expect(reloaded.current().turns).toHaveLength(2);
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
    expect(store.current().turns[0].content).toBe("one");
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

});
