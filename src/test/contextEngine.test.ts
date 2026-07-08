import { describe, expect, it } from "vitest";
import {
  ContextEngine,
  contextBreakdown,
  largestFiles,
  type ProjectContext,
} from "../core/contextEngine";
import { fakeGit, fakeRepo, fakeSettings } from "./helpers";

describe("ContextEngine", () => {
  it("includes text files and records the git diff", async () => {
    const { discovery, reader } = fakeRepo({
      "a.ts": "const a = 1;",
      "docs/readme.md": "# hello",
    });
    const engine = new ContextEngine(
      discovery,
      reader,
      fakeGit({ nonIgnored: new Set(["a.ts", "docs/readme.md"]), diff: "diff --git x" }),
      fakeSettings()
    );
    const ctx = await engine.buildContext("summary text");
    expect(ctx.files.map((f) => f.relPath)).toEqual(["a.ts", "docs/readme.md"]);
    expect(ctx.gitDiff).toBe("diff --git x");
    expect(ctx.summaries).toBe("summary text");
    expect(ctx.estimatedTokens).toBeGreaterThan(0);
  });

  it("skips files not in the git non-ignored set", async () => {
    const { discovery, reader } = fakeRepo({
      "kept.ts": "x",
      "ignored.log": "y",
    });
    const engine = new ContextEngine(
      discovery,
      reader,
      fakeGit({ nonIgnored: new Set(["kept.ts"]) }),
      fakeSettings()
    );
    const ctx = await engine.buildContext("");
    expect(ctx.files.map((f) => f.relPath)).toEqual(["kept.ts"]);
    expect(ctx.skipped).toEqual([{ path: "ignored.log", reason: "excluded" }]);
  });

  it("falls back to .gitignore parsing when not a git repo", async () => {
    const { discovery, reader } = fakeRepo({
      "src/app.ts": "x",
      "build/out.js": "y",
      "nested/dist/bundle.js": "z",
    });
    reader.gitignores.set("", "build/\n");
    reader.gitignores.set("nested", "dist/\n");
    const engine = new ContextEngine(
      discovery,
      reader,
      fakeGit({ nonIgnored: undefined }),
      fakeSettings()
    );
    const ctx = await engine.buildContext("");
    expect(ctx.files.map((f) => f.relPath)).toEqual(["src/app.ts"]);
  });

  it("skips binary files (NUL sniff) and oversized files", async () => {
    const big = "a".repeat(300 * 1024);
    const binary = new Uint8Array([0x50, 0x4b, 0x00, 0x01, 0x02]);
    const { discovery, reader } = fakeRepo({
      "ok.ts": "fine",
      "huge.txt": big,
      "blob.bin": binary,
    });
    const engine = new ContextEngine(
      discovery,
      reader,
      fakeGit({ nonIgnored: new Set(["ok.ts", "huge.txt", "blob.bin"]) }),
      fakeSettings({ maxFileSizeKb: 256 })
    );
    const ctx = await engine.buildContext("");
    expect(ctx.files.map((f) => f.relPath)).toEqual(["ok.ts"]);
    expect(ctx.skipped).toContainEqual({ path: "huge.txt", reason: "too-large" });
    expect(ctx.skipped).toContainEqual({ path: "blob.bin", reason: "binary" });
  });

  it("reports the largest files for the size-guard warning", async () => {
    const { discovery, reader } = fakeRepo({
      "small.ts": "x",
      "large.ts": "y".repeat(10 * 1024),
    });
    const engine = new ContextEngine(
      discovery,
      reader,
      fakeGit({ nonIgnored: new Set(["small.ts", "large.ts"]) }),
      fakeSettings()
    );
    const ctx = await engine.buildContext("");
    const top = largestFiles(ctx, 1);
    expect(top).toEqual([{ path: "large.ts", kb: 10 }]);
  });
});

describe("contextBreakdown", () => {
  function ctxOf(files: Record<string, string>): ProjectContext {
    return {
      files: Object.entries(files).map(([relPath, content]) => ({ relPath, content })),
      gitDiff: "",
      summaries: "",
      estimatedTokens: 0,
      skipped: [],
    };
  }

  it("ranks files largest-first with token estimates and percentage shares", () => {
    const stats = contextBreakdown(
      ctxOf({ "small.ts": "a".repeat(100), "big.ts": "b".repeat(300) })
    );
    expect(stats.map((s) => s.relPath)).toEqual(["big.ts", "small.ts"]);
    expect(stats[0]).toMatchObject({ chars: 300, estTokens: 75, pct: 75 });
    expect(stats[1]).toMatchObject({ chars: 100, estTokens: 25, pct: 25 });
    expect(stats.reduce((sum, s) => sum + s.pct, 0)).toBe(100);
  });

  it("returns an empty list for an empty context", () => {
    expect(contextBreakdown(ctxOf({}))).toEqual([]);
  });
});
