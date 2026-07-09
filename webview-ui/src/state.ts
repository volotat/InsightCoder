import { signal } from "@preact/signals";
import { saveUiState } from "./vscodeApi";
import type {
  ContextInfo,
  ConversationMeta,
  HostToWebview,
  ModelChoice,
  TurnDTO,
  TurnState,
} from "../../src/panel/protocol";

export const turns = signal<TurnDTO[]>([]);
export const conversations = signal<ConversationMeta[]>([]);
export const activeConversationId = signal<number>(0);
export const models = signal<ModelChoice[]>([]);
export const activeModel = signal<{ providerId: string; modelId: string }>({
  providerId: "minimax",
  modelId: "MiniMax-M3",
});
export const turnState = signal<TurnState>("idle");
export const tokenCount = signal<{ total: number; exact: boolean } | null>(null);
export const contextInfo = signal<ContextInfo | null>(null);
export const hasApiKey = signal<boolean>(true);
export const errorMessage = signal<string | null>(null);
export const showTabs = signal<boolean>(false);
export const initialized = signal<boolean>(false);
export const canResend = signal<boolean>(false);

// In-flight streaming state for the current assistant turn.
export const streaming = signal<boolean>(false);
export const streamingText = signal<string>("");
export const streamingThinking = signal<string>("");
export const streamingThinkingTokens = signal<number>(0);
/** True while reasoning is arriving and the answer hasn't started yet. */
export const thinkingActive = signal<boolean>(false);

function resetStreaming(): void {
  streaming.value = false;
  streamingText.value = "";
  streamingThinking.value = "";
  streamingThinkingTokens.value = 0;
  thinkingActive.value = false;
}

/** Persist the visible chat so a reloaded webview repaints without waiting for init. */
function snapshot(): void {
  saveUiState({ turns: turns.value, activeConversationId: activeConversationId.value });
}

export function handleHostMessage(msg: HostToWebview): void {
  switch (msg.type) {
    case "init":
      turns.value = msg.turns;
      conversations.value = msg.conversations;
      activeConversationId.value = msg.activeConversationId;
      models.value = msg.models;
      activeModel.value = msg.activeModel;
      hasApiKey.value = msg.hasApiKey;
      canResend.value = msg.canResend;
      if (msg.contextInfo) {
        contextInfo.value = msg.contextInfo;
      }
      initialized.value = true;
      snapshot();
      break;
    case "conversationList":
      conversations.value = msg.conversations;
      activeConversationId.value = msg.activeConversationId;
      break;
    case "conversationLoaded":
      turns.value = msg.turns;
      activeConversationId.value = msg.conversationId;
      resetStreaming();
      showTabs.value = false;
      snapshot();
      break;
    case "streamStart":
      errorMessage.value = null;
      resetStreaming();
      streaming.value = true;
      break;
    case "thinkingChunk":
      streamingThinking.value += msg.text;
      thinkingActive.value = true;
      break;
    case "thinkingTokens":
      streamingThinkingTokens.value = msg.count;
      break;
    case "reclassifyThinking":
      // The answer streamed so far was actually reasoning — move it.
      streamingThinking.value = streamingText.value + streamingThinking.value;
      streamingText.value = "";
      thinkingActive.value = true;
      break;
    case "streamChunk":
      // Answer text has begun — reasoning is complete.
      thinkingActive.value = false;
      streamingText.value += msg.text;
      break;
    case "streamEnd":
      if (streamingText.value || streamingThinking.value) {
        turns.value = [
          ...turns.value,
          {
            role: "assistant",
            content: streamingText.value,
            timestamp: new Date().toISOString(),
            model: activeModel.value.modelId,
            thinking: msg.thinking || streamingThinking.value || undefined,
            thinkingTokens: msg.thinkingTokens ?? (streamingThinkingTokens.value || undefined),
          },
        ];
      }
      resetStreaming();
      snapshot();
      break;
    case "tokenCount":
      tokenCount.value = { total: msg.total, exact: msg.exact };
      break;
    case "turnState":
      turnState.value = msg.state;
      break;
    case "contextInfo":
      contextInfo.value = msg.info;
      break;
    case "apiKeyState":
      hasApiKey.value = msg.hasApiKey;
      break;
    case "canResend":
      canResend.value = msg.value;
      break;
    case "modelList":
      models.value = msg.models;
      break;
    case "error":
      errorMessage.value = msg.message;
      break;
  }
}

/** Repaint the last-known chat immediately from the persisted snapshot (cold load). */
export function hydrateFromSnapshot(s: { turns: TurnDTO[]; activeConversationId: number }): void {
  turns.value = s.turns;
  activeConversationId.value = s.activeConversationId;
  initialized.value = true;
}
