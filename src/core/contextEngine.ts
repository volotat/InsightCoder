import ignore from "ignore";
import type { SettingsReader } from "../config/settings";

/** Structural subset of GitService, so tests can stub it without subprocesses. */
export interface GitFacade {
  listNonIgnoredFiles(): Promise<Set<string> | undefined>;
  getDiff(): Promise<string>;
}

export interface ContextFile {
  relPath: string;
  content: string;
}

export interface SkippedFile {
  path: string;
  reason: "binary" | "too-large" | "excluded" | "unreadable";
}

export interface ProjectContext {
  files: ContextFile[];
  gitDiff: string;
  /** Concatenated past-conversation summaries (long-term memory). */
  summaries: string;
  estimatedTokens: number;
  skipped: SkippedFile[];
}

/** ~4 chars per token — corrected at runtime from real usage (see TokenService). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Abstractions over vscode.workspace so the engine runs in plain-Node tests. */
export interface FileDiscovery {
  /** Returns workspace-relative paths matching include minus exclude globs. */
  findFiles(include: string[], exclude: string[]): Promise<string[]>;
}

export interface FileReader {
  readFile(relPath: string): Promise<Uint8Array>;
  /** Contents of every .gitignore in the tree, keyed by its directory ("" = root). */
  readGitignores(): Promise<Map<string, string>>;
}

const BINARY_SNIFF_BYTES = 8 * 1024;

function looksBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < n; i++) {
    if (bytes[i] === 0) {
      return true;
    }
  }
  return false;
}

export class ContextEngine {
  constructor(
    private readonly discovery: FileDiscovery,
    private readonly reader: FileReader,
    private readonly git: GitFacade,
    private readonly settings: SettingsReader
  ) {}

  async buildContext(
    summaries: string,
    progress?: (message: string) => void
  ): Promise<ProjectContext> {
    const cfg = this.settings.get();
    progress?.("Scanning workspace files…");

    const candidates = await this.discovery.findFiles(
      cfg.context.include,
      cfg.context.exclude
    );

    const allowed = await this.resolveNonIgnored(candidates);
    const skipped: SkippedFile[] = [];
    const files: ContextFile[] = [];
    const maxBytes = cfg.context.maxFileSizeKb * 1024;
    const decoder = new TextDecoder("utf-8", { fatal: false });

    for (const relPath of candidates.sort()) {
      if (!allowed.has(relPath)) {
        skipped.push({ path: relPath, reason: "excluded" });
        continue;
      }
      let bytes: Uint8Array;
      try {
        bytes = await this.reader.readFile(relPath);
      } catch {
        skipped.push({ path: relPath, reason: "unreadable" });
        continue;
      }
      if (bytes.byteLength > maxBytes) {
        skipped.push({ path: relPath, reason: "too-large" });
        continue;
      }
      if (looksBinary(bytes)) {
        skipped.push({ path: relPath, reason: "binary" });
        continue;
      }
      files.push({ relPath, content: decoder.decode(bytes) });
    }

    progress?.("Collecting git diff…");
    const gitDiff = await this.git.getDiff();

    const totalChars =
      files.reduce((sum, f) => sum + f.content.length + f.relPath.length + 50, 0) +
      gitDiff.length +
      summaries.length;

    return {
      files,
      gitDiff,
      summaries,
      estimatedTokens: Math.ceil(totalChars / 4),
      skipped,
    };
  }

  /**
   * Gitignore handling: one `git ls-files` call when in a repo; otherwise parse
   * .gitignore files with the `ignore` package. Never a per-file subprocess.
   */
  private async resolveNonIgnored(candidates: string[]): Promise<Set<string>> {
    const fromGit = await this.git.listNonIgnoredFiles();
    if (fromGit) {
      return new Set(candidates.filter((p) => fromGit.has(p)));
    }
    const gitignores = await this.reader.readGitignores();
    if (gitignores.size === 0) {
      return new Set(candidates);
    }
    const matchers = [...gitignores.entries()].map(([dir, content]) => ({
      dir: dir === "" ? "" : dir.replace(/\/?$/, "/"),
      ig: ignore().add(content),
    }));
    return new Set(
      candidates.filter((p) => {
        for (const { dir, ig } of matchers) {
          if (dir === "" || p.startsWith(dir)) {
            const rel = dir === "" ? p : p.slice(dir.length);
            if (rel && ig.ignores(rel)) {
              return false;
            }
          }
        }
        return true;
      })
    );
  }
}

/** Top-N largest files, for the too-large warning UI. */
export function largestFiles(
  ctx: ProjectContext,
  n = 10
): { path: string; kb: number }[] {
  return [...ctx.files]
    .sort((a, b) => b.content.length - a.content.length)
    .slice(0, n)
    .map((f) => ({ path: f.relPath, kb: Math.round(f.content.length / 1024) }));
}

export interface ContextFileStat {
  relPath: string;
  chars: number;
  estTokens: number;
  /** This file's share (%) of all included files' content — for the exclusion decision. */
  pct: number;
}

/** Every included file ranked largest-first, with size / estimated-token / share stats. */
export function contextBreakdown(ctx: ProjectContext): ContextFileStat[] {
  const totalChars = ctx.files.reduce((sum, f) => sum + f.content.length, 0);
  return [...ctx.files]
    .sort((a, b) => b.content.length - a.content.length)
    .map((f) => {
      const chars = f.content.length;
      return {
        relPath: f.relPath,
        chars,
        estTokens: estimateTokens(f.content),
        pct: totalChars > 0 ? Math.round((chars / totalChars) * 100) : 0,
      };
    });
}
