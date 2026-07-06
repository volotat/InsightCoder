/** Provider-layer contracts. Keep free of `vscode` imports so core stays unit-testable. */

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface GenerationParams {
  temperature: number;
  maxOutputTokens: number;
}

export interface ChatRequest {
  systemPrompt: string;
  messages: ChatMessage[];
  model: string;
  generation: GenerationParams;
  signal?: AbortSignal;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  /** Tokens spent on reasoning/thinking, when the provider reports them separately. */
  reasoningTokens?: number;
}

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  /** Answer text streamed so far was actually reasoning (auto-prefixed <think>). */
  | { type: "reclassify" }
  | { type: "done"; usage?: Usage }
  | { type: "error"; message: string; retryable: boolean };

export interface ModelInfo {
  id: string;
  contextWindow?: number;
}

export interface TokenCount {
  total: number;
  /** false means the number is an estimate, not a tokenizer/API result. */
  exact: boolean;
}

export interface LLMProvider {
  readonly id: string;
  streamChat(req: ChatRequest): AsyncIterable<StreamEvent>;
  countTokens(
    systemPrompt: string,
    messages: ChatMessage[],
    model: string,
    draft?: string
  ): Promise<TokenCount>;
  listModels(): Promise<ModelInfo[]>;
  /** One-shot non-streaming generation (used by the summarizer). */
  generateOnce(
    prompt: string,
    opts: { model: string; temperature?: number; maxOutputTokens?: number }
  ): Promise<string>;
}
