import * as vscode from "vscode";
import { ChatController } from "../core/chatController";
import { ConversationStore } from "../core/conversationStore";
import { ProviderRegistry } from "../providers/providerRegistry";
import type { HostToWebview, WebviewToHost } from "./protocol";

const DRAFT_DEBOUNCE_MS = 500;

function nonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

/**
 * Thin bridge: renders the webview shell and routes protocol messages to the
 * ChatController / ConversationStore. No business logic lives here.
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "insightcoder.chatView";

  private view: vscode.WebviewView | undefined;
  private draftTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly controller: ChatController,
    private readonly store: ConversationStore,
    private readonly registry: ProviderRegistry,
    private readonly log: (msg: string) => void
  ) {}

  post(msg: HostToWebview): void {
    void this.view?.webview.postMessage(msg);
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist")],
    };
    webviewView.webview.html = this.renderHtml(webviewView.webview);
    this.controller.attachSink((msg) => this.post(msg));

    webviewView.webview.onDidReceiveMessage((msg: WebviewToHost) => {
      void this.handle(msg).catch((e) => {
        this.log(`Webview message failed (${msg.type}): ${e}`);
        this.post({ type: "error", message: String(e) });
      });
    });
  }

  private async handle(msg: WebviewToHost): Promise<void> {
    switch (msg.type) {
      case "ready":
        await this.sendInit();
        // Assemble the context in the background so the first question is fast.
        void this.controller.ensureContext().catch((e) => this.log(`Context build failed: ${e}`));
        break;
      case "sendMessage":
        await this.controller.sendMessage(msg.text);
        this.post({
          type: "conversationList",
          conversations: await this.store.list(),
          activeConversationId: this.store.current().id,
        });
        break;
      case "cancelStream":
        this.controller.cancel();
        break;
      case "reloadContext":
        await this.controller.reloadContext();
        break;
      case "newConversation": {
        const conv = await this.store.startNew();
        this.post({ type: "conversationLoaded", turns: conv.turns, conversationId: conv.id });
        await this.sendConversationList();
        void this.controller.countDraftTokens("");
        this.controller.emitResendState();
        break;
      }
      case "switchConversation": {
        const conv = await this.store.switchTo(msg.id);
        this.post({ type: "conversationLoaded", turns: conv.turns, conversationId: conv.id });
        await this.sendConversationList();
        void this.controller.countDraftTokens("");
        this.controller.emitResendState();
        break;
      }
      case "deleteConversation": {
        const pick = await vscode.window.showWarningMessage(
          `Delete conversation ${msg.id} and its summary?`,
          { modal: true },
          "Delete"
        );
        if (pick !== "Delete") {
          return;
        }
        await this.store.delete(msg.id);
        const conv = this.store.current();
        this.post({ type: "conversationLoaded", turns: conv.turns, conversationId: conv.id });
        await this.sendConversationList();
        this.controller.emitResendState();
        break;
      }
      case "selectModel":
        this.registry.setActiveModel(msg.providerId, msg.modelId);
        this.post({ type: "apiKeyState", hasApiKey: await this.registry.hasApiKey() });
        break;
      case "draftChanged":
        clearTimeout(this.draftTimer);
        this.draftTimer = setTimeout(() => {
          void this.controller.countDraftTokens(msg.text);
        }, DRAFT_DEBOUNCE_MS);
        break;
      case "confirmLargeContext":
        this.controller.resolveLargeContext(msg.accept);
        break;
      case "setApiKey":
        await vscode.commands.executeCommand("insightcoder.setApiKey");
        break;
      case "exportConversation":
        await vscode.commands.executeCommand("insightcoder.exportConversation");
        break;
      case "showContext":
        await vscode.commands.executeCommand("insightcoder.showContext");
        break;
      case "inspectContext":
        await vscode.commands.executeCommand("insightcoder.inspectContext");
        break;
      case "resendLast":
        await this.controller.resendLast();
        await this.sendConversationList();
        break;
    }
  }

  async sendConversationList(): Promise<void> {
    this.post({
      type: "conversationList",
      conversations: await this.store.list(),
      activeConversationId: this.store.current().id,
    });
  }

  private async sendInit(): Promise<void> {
    const conv = this.store.current();
    const active = this.registry.getActiveModel();
    const contextInfo = this.controller.getContextInfo();
    this.post({
      type: "init",
      turns: conv.turns,
      conversations: await this.store.list(),
      activeConversationId: conv.id,
      models: await this.registry.listModelChoices(),
      activeModel: { providerId: active.providerId, modelId: active.modelId },
      hasApiKey: await this.registry.hasApiKey(),
      contextInfo: contextInfo?.type === "contextInfo" ? contextInfo.info : undefined,
      canResend: this.controller.canResend(),
    });
  }

  private renderHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.css")
    );
    const n = nonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${n}'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>InsightCoder</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${n}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
