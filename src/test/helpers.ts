import type { InsightCoderSettings, SettingsReader } from "../config/settings";
import type { FileDiscovery, FileReader, GitFacade } from "../core/contextEngine";

export function fakeSettings(
  overrides: Partial<InsightCoderSettings["context"]> = {}
): SettingsReader {
  return {
    get: () => ({
      provider: "minimax",
      model: "MiniMax-M3",
      baseUrl: "https://api.minimax.io/v1",
      context: {
        include: ["**/*"],
        exclude: [],
        maxTokens: 500000,
        maxFileSizeKb: 256,
        ...overrides,
      },
      generation: { temperature: 1.0, maxOutputTokens: 65536 },
      summariesEnabled: true,
    }),
  };
}

export function fakeRepo(files: Record<string, string | Uint8Array>): {
  discovery: FileDiscovery;
  reader: FileReader & { gitignores: Map<string, string> };
} {
  const encoder = new TextEncoder();
  const reader = {
    gitignores: new Map<string, string>(),
    async readFile(relPath: string): Promise<Uint8Array> {
      const content = files[relPath];
      if (content === undefined) {
        throw new Error(`no such file: ${relPath}`);
      }
      return typeof content === "string" ? encoder.encode(content) : content;
    },
    async readGitignores(): Promise<Map<string, string>> {
      return reader.gitignores;
    },
  };
  return {
    discovery: {
      async findFiles(): Promise<string[]> {
        return Object.keys(files);
      },
    },
    reader,
  };
}

export function fakeGit(opts: {
  nonIgnored?: Set<string> | undefined;
  diff?: string;
}): GitFacade {
  return {
    async listNonIgnoredFiles() {
      return opts.nonIgnored;
    },
    async getDiff() {
      return opts.diff ?? "No uncommitted changes.";
    },
  };
}
