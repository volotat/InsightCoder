import * as crypto from "node:crypto";
import * as path from "node:path";
import * as vscode from "vscode";
import { promptSetApiKey, SecretsStore } from "./config/secrets";
import { VSCodeSettingsReader } from "./config/settings";
import { ChatController } from "./core/chatController";
import {
  ContextEngine,
  type FileDiscovery,
  type FileReader,
} from "./core/contextEngine";
import { ConversationStore } from "./core/conversationStore";
import { GitService } from "./core/gitService";
import { Summarizer } from "./core/summarizer";
import { ChatViewProvider } from "./panel/chatViewProvider";
import { ContextDecorationProvider } from "./panel/contextDecorationProvider";
import { ProviderRegistry } from "./providers/providerRegistry";

function braceGlob(patterns: string[]): string {
  return patterns.length === 1 ? patterns[0] : `{${patterns.join(",")}}`;
}

class WorkspaceFileDiscovery implements FileDiscovery {
  constructor(private readonly folder: vscode.WorkspaceFolder) {}

  async findFiles(include: string[], exclude: string[]): Promise<string[]> {
    const includePattern = new vscode.RelativePattern(this.folder, braceGlob(include));
    const excludePattern =
      exclude.length > 0 ? new vscode.RelativePattern(this.folder, braceGlob(exclude)) : undefined;
    const uris = await vscode.workspace.findFiles(includePattern, excludePattern);
    return uris.map((u) => vscode.workspace.asRelativePath(u, false));
  }
}

class WorkspaceFileReader implements FileReader {
  constructor(private readonly folder: vscode.WorkspaceFolder) {}

  async readFile(relPath: string): Promise<Uint8Array> {
    return vscode.workspace.fs.readFile(vscode.Uri.joinPath(this.folder.uri, relPath));
  }

  async readGitignores(): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const uris = await vscode.workspace.findFiles(
      new vscode.RelativePattern(this.folder, "**/.gitignore"),
      new vscode.RelativePattern(this.folder, "**/node_modules/**")
    );
    for (const uri of uris) {
      const rel = vscode.workspace.asRelativePath(uri, false);
      const dir = path.posix.dirname(rel.split(path.sep).join("/"));
      const content = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
      result.set(dir === "." ? "" : dir, content);
    }
    return result;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("InsightCoder");
  const log = (msg: string) => output.appendLine(`[${new Date().toISOString()}] ${msg}`);
  context.subscriptions.push(output);

  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    log("No workspace folder open — InsightCoder is idle.");
    context.subscriptions.push(
      vscode.commands.registerCommand("insightcoder.openChat", () => {
        void vscode.window.showWarningMessage(
          "InsightCoder needs an open folder to analyze. Open a project first."
        );
      })
    );
    return;
  }

  // Conversations live in the EXTENSION's storage, keyed per workspace —
  // nothing is ever written into the analyzed repository.
  const workspaceId =
    path.basename(folder.uri.fsPath).replace(/[^\w-]/g, "_") +
    "-" +
    crypto.createHash("sha1").update(folder.uri.fsPath).digest("hex").slice(0, 12);
  const storageDir = path.join(context.globalStorageUri.fsPath, workspaceId);

  const settings = new VSCodeSettingsReader();
  const secrets = new SecretsStore(context.secrets);
  const registry = new ProviderRegistry(settings, secrets);
  const git = new GitService(folder.uri.fsPath);
  const engine = new ContextEngine(
    new WorkspaceFileDiscovery(folder),
    new WorkspaceFileReader(folder),
    git,
    settings
  );
  const store = new ConversationStore(storageDir);
  const summarizer = new Summarizer(registry, settings, store, log);
  const controller = new ChatController(engine, store, registry, settings, summarizer, log);

  const ready = store.init().then(
    () => log(`Conversation store ready at ${storageDir}`),
    (e) => log(`Conversation store failed to initialize: ${e}`)
  );

  const viewProvider = new ChatViewProvider(
    context.extensionUri,
    controller,
    store,
    registry,
    ready,
    log
  );
  const decorations = new ContextDecorationProvider(folder.uri);
  controller.onContextBuilt = (ctx) => decorations.update(ctx);

  context.subscriptions.push(
    // Keep the webview alive when the sidebar tab is hidden — switching back is
    // instant instead of a full HTML reload + init round-trip.
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, viewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerFileDecorationProvider(decorations),

    vscode.commands.registerCommand("insightcoder.openChat", () =>
      vscode.commands.executeCommand("insightcoder.chatView.focus")
    ),

    vscode.commands.registerCommand("insightcoder.reloadContext", () =>
      controller.reloadContext()
    ),

    vscode.commands.registerCommand("insightcoder.newConversation", async () => {
      await ready;
      await store.startNew();
      viewProvider.postCurrentConversation();
      await viewProvider.sendConversationList();
    }),

    vscode.commands.registerCommand("insightcoder.setApiKey", async () => {
      await promptSetApiKey(secrets);
      registry.invalidate();
      viewProvider.post({ type: "apiKeyState", hasApiKey: await registry.hasApiKey() });
    }),

    vscode.commands.registerCommand("insightcoder.exportConversation", async () => {
      await ready;
      const conv = store.current();
      const target = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(
          path.join(folder.uri.fsPath, `insightcoder_conversation_${conv.id}.md`)
        ),
        filters: { Markdown: ["md"] },
      });
      if (!target) {
        return;
      }
      await vscode.workspace.fs.writeFile(
        target,
        new TextEncoder().encode(store.renderMarkdown(conv))
      );
      void vscode.window.showInformationMessage(`Conversation exported to ${target.fsPath}`);
    }),

    // Replaces the old full_context.txt-dumped-into-CWD debugging side effect.
    vscode.commands.registerCommand("insightcoder.showContext", async () => {
      await controller.ensureContext();
      const prompt = controller.getSystemPrompt() ?? "(context not assembled)";
      const doc = await vscode.workspace.openTextDocument({ content: prompt, language: "markdown" });
      await vscode.window.showTextDocument(doc, { preview: true });
    }),

    vscode.commands.registerCommand("insightcoder.inspectContext", async () => {
      await controller.ensureContext();
      const files = controller.getContextBreakdown();
      if (files.length === 0) {
        void vscode.window.showInformationMessage(
          "InsightCoder: no files are currently in the model context."
        );
        return;
      }
      type Item = vscode.QuickPickItem & { relPath: string };
      const items: Item[] = files.map((f) => ({
        label: f.relPath,
        description: `${Math.round(f.chars / 1024)} KB · ~${f.estTokens.toLocaleString("en-US")} tokens · ${f.pct}%`,
        relPath: f.relPath,
      }));
      const picked = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        matchOnDescription: true,
        title: "InsightCoder — Context files by size",
        placeHolder: "Select files to exclude from the model context (largest first)",
      });
      if (!picked || picked.length === 0) {
        return;
      }
      const cfg = vscode.workspace.getConfiguration("insightcoder");
      const current = cfg.get<string[]>("context.exclude", []);
      // A workspace-relative path works as an exclude glob as-is. Paths containing
      // glob metacharacters (*?[]{}) are a rare edge case and not escaped in v1.
      const additions = picked.map((p) => p.relPath).filter((p) => !current.includes(p));
      if (additions.length === 0) {
        void vscode.window.showInformationMessage(
          "InsightCoder: the selected file(s) are already excluded."
        );
        return;
      }
      await cfg.update(
        "context.exclude",
        [...current, ...additions],
        vscode.ConfigurationTarget.Workspace
      );
      await controller.reloadContext();
      void vscode.window.showInformationMessage(
        `InsightCoder: excluded ${additions.length} file(s) from the context. Edit "insightcoder.context.exclude" in settings to re-include.`
      );
    }),

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("insightcoder")) {
        return;
      }
      registry.invalidate();
      if (e.affectsConfiguration("insightcoder.context")) {
        controller.invalidateContext();
      }
    }),

    secrets.onDidChange(() => registry.invalidate())
  );

  // Startup back-fill: non-blocking, unlike the old app which blocked launch on it.
  void ready.then(() =>
    summarizer
      .backfill((done, total) => log(`Summary back-fill ${done}/${total}`))
      .catch((e) => log(`Summary back-fill failed: ${e}`))
  );
}

export function deactivate(): void {}
