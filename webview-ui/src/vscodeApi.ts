import type { TurnDTO, WebviewToHost } from "../../src/panel/protocol";

interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

export function post(msg: WebviewToHost): void {
  vscode.postMessage(msg);
}

/** Snapshot persisted across webview reloads so the last chat paints instantly. */
export interface UiStateSnapshot {
  turns: TurnDTO[];
  activeConversationId: number;
}

export function saveUiState(state: UiStateSnapshot): void {
  vscode.setState(state);
}

export function loadUiState(): UiStateSnapshot | undefined {
  const state = vscode.getState() as UiStateSnapshot | undefined;
  return state && Array.isArray(state.turns) ? state : undefined;
}
