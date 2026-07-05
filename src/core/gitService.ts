import { execFile } from "node:child_process";

const DIFF_CAP_BYTES = 512 * 1024;

function run(
  cwd: string,
  args: string[],
  maxBuffer = 64 * 1024 * 1024
): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, maxBuffer }, (error, stdout) => {
      resolve({ ok: !error, stdout: stdout ?? "" });
    });
  });
}

export class GitService {
  constructor(private readonly root: string) {}

  async isGitRepo(): Promise<boolean> {
    const { ok } = await run(this.root, ["rev-parse", "--is-inside-work-tree"]);
    return ok;
  }

  /**
   * All non-ignored files (tracked + untracked), repo-root-relative, in ONE git call —
   * replaces the old per-file `git check-ignore` subprocess storm.
   */
  async listNonIgnoredFiles(): Promise<Set<string> | undefined> {
    const { ok, stdout } = await run(this.root, [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
    ]);
    if (!ok) {
      return undefined;
    }
    return new Set(stdout.split("\0").filter((p) => p.length > 0));
  }

  /** Staged + unstaged diff, labeled, capped so a giant diff can't blow up the prompt. */
  async getDiff(): Promise<string> {
    const staged = await run(this.root, ["diff", "--staged"]);
    const unstaged = await run(this.root, ["diff"]);
    if (!staged.ok && !unstaged.ok) {
      return "Unable to retrieve Git diff information.";
    }
    const parts: string[] = [];
    if (staged.stdout.trim()) {
      parts.push("--- STAGED CHANGES ---\n" + staged.stdout);
    }
    if (unstaged.stdout.trim()) {
      parts.push("--- UNSTAGED CHANGES ---\n" + unstaged.stdout);
    }
    let diff = parts.join("\n") || "No uncommitted changes.";
    if (diff.length > DIFF_CAP_BYTES) {
      diff =
        diff.slice(0, DIFF_CAP_BYTES) +
        `\n\n[... diff truncated at ${Math.round(DIFF_CAP_BYTES / 1024)} KB ...]`;
    }
    return diff;
  }
}
