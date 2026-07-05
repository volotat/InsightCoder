/**
 * Typed message protocol between the extension host and the webview.
 * This file is imported by BOTH bundles — keep it free of `vscode` and DOM imports.
 */

export type ChatRole = "user" | "assistant";

export interface TurnDTO {
  role: ChatRole;
  content: string;
  timestamp: string;
  model?: string;
  thinking?: string;
  thinkingTokens?: number;
}

export interface ConversationMeta {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  turnCount: number;
}

export interface ModelChoice {
  providerId: string;
  modelId: string;
  label: string;
  contextWindow?: number;
}

export type TurnState =
  | "idle"
  | "assemblingContext"
  | "streaming"
  | "saving"
  | "error";

export interface ContextInfo {
  fileCount: number;
  estimatedTokens: number;
  skippedCount: number;
  warnTooLarge?: {
    limit: number;
    largestFiles: { path: string; kb: number }[];
  };
}

/** Messages sent from the webview to the extension host. */
export type WebviewToHost =
  | { type: "ready" }
  | { type: "sendMessage"; text: string }
  | { type: "cancelStream" }
  | { type: "reloadContext" }
  | { type: "newConversation" }
  | { type: "switchConversation"; id: number }
  | { type: "deleteConversation"; id: number }
  | { type: "selectModel"; providerId: string; modelId: string }
  | { type: "draftChanged"; text: string }
  | { type: "confirmLargeContext"; accept: boolean }
  | { type: "setApiKey" }
  | { type: "exportConversation" }
  | { type: "showContext" }
  | { type: "resendLast" };

/** Messages sent from the extension host to the webview. */
export type HostToWebview =
  | {
      type: "init";
      turns: TurnDTO[];
      conversations: ConversationMeta[];
      activeConversationId: number;
      models: ModelChoice[];
      activeModel: { providerId: string; modelId: string };
      hasApiKey: boolean;
      contextInfo?: ContextInfo;
      canResend: boolean;
    }
  | { type: "conversationList"; conversations: ConversationMeta[]; activeConversationId: number }
  | { type: "conversationLoaded"; turns: TurnDTO[]; conversationId: number }
  | { type: "streamStart" }
  | { type: "thinkingChunk"; text: string }
  | { type: "thinkingTokens"; count: number; exact: boolean }
  | { type: "streamChunk"; text: string }
  | {
      type: "streamEnd";
      usage?: { inputTokens: number; outputTokens: number; reasoningTokens?: number };
      thinking?: string;
      thinkingTokens?: number;
    }
  | { type: "tokenCount"; total: number; exact: boolean }
  | { type: "turnState"; state: TurnState }
  | { type: "contextInfo"; info: ContextInfo }
  | { type: "apiKeyState"; hasApiKey: boolean }
  | { type: "canResend"; value: boolean }
  | { type: "error"; message: string };
