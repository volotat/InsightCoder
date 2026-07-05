import OpenAI from "openai";
import type {
  ChatMessage,
  ChatRequest,
  LLMProvider,
  ModelInfo,
  StreamEvent,
  TokenCount,
} from "./types";

function isRetryable(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  return status === 429 || (typeof status === "number" && status >= 500);
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) {
    return e.message;
  }
  return String(e);
}

/**
 * Works for MiniMax (M-series) and any other OpenAI-compatible endpoint —
 * the base URL and model name are plain configuration.
 */
export class OpenAICompatProvider implements LLMProvider {
  private readonly client: OpenAI;

  constructor(
    readonly id: string,
    apiKey: string,
    baseUrl: string,
    private readonly configuredModel: string
  ) {
    this.client = new OpenAI({ apiKey, baseURL: baseUrl });
  }

  async *streamChat(req: ChatRequest): AsyncIterable<StreamEvent> {
    try {
      const stream = await this.client.chat.completions.create(
        {
          model: req.model,
          stream: true,
          stream_options: { include_usage: true },
          temperature: req.generation.temperature,
          max_tokens: req.generation.maxOutputTokens,
          messages: [
            { role: "system", content: req.systemPrompt },
            ...req.messages.map((m) => ({ role: m.role, content: m.content })),
          ],
        },
        { signal: req.signal }
      );
      let usage: { inputTokens: number; outputTokens: number } | undefined;
      for await (const chunk of stream) {
        if (chunk.usage) {
          usage = {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
          };
        }
        const delta = chunk.choices?.[0]?.delta as
          | { content?: string | null; reasoning_content?: string; reasoning?: string }
          | undefined;
        // MiniMax exposes reasoning as `reasoning_content`; OpenRouter-style
        // endpoints use `reasoning`.
        const thinking = delta?.reasoning_content ?? delta?.reasoning;
        if (thinking) {
          yield { type: "thinking", text: thinking };
        }
        if (delta?.content) {
          yield { type: "text", text: delta.content };
        }
      }
      yield { type: "done", usage };
    } catch (e) {
      if (req.signal?.aborted) {
        yield { type: "done" };
        return;
      }
      yield { type: "error", message: errorMessage(e), retryable: isRetryable(e) };
    }
  }

  /**
   * No official MiniMax tokenizer exists in JS — return a labeled estimate.
   * The TokenService recalibrates the chars-per-token ratio from real usage
   * after each completed turn.
   */
  async countTokens(
    systemPrompt: string,
    messages: ChatMessage[],
    _model: string,
    draft?: string
  ): Promise<TokenCount> {
    const chars =
      systemPrompt.length +
      messages.reduce((s, m) => s + m.content.length, 0) +
      (draft?.length ?? 0);
    return { total: Math.ceil(chars / 4), exact: false };
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const page = await this.client.models.list();
      const models = page.data.map((m) => ({ id: m.id }));
      if (models.length > 0) {
        return models;
      }
    } catch {
      // endpoint may not implement /models — fall through
    }
    return [{ id: this.configuredModel }];
  }

  async generateOnce(
    prompt: string,
    opts: { model: string; temperature?: number; maxOutputTokens?: number }
  ): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: opts.model,
      temperature: opts.temperature,
      max_tokens: opts.maxOutputTokens,
      messages: [{ role: "user", content: prompt }],
    });
    return res.choices[0]?.message?.content?.trim() ?? "";
  }
}
