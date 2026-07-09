import OpenAI from "openai";
import { stripThinkTags, ThinkTagSplitter } from "./thinkTagSplitter";
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

/**
 * MiniMax M-series uses interleaved thinking: assistant turns in history MUST
 * be sent back with their reasoning restored as <think> blocks, or the model
 * stops emitting reasoning (and degrades) on follow-up turns.
 */
export function toWireMessages(
  systemPrompt: string,
  messages: ChatMessage[]
): { role: "system" | "user" | "assistant"; content: string }[] {
  return [
    { role: "system" as const, content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role,
      content:
        m.role === "assistant" && m.thinking
          ? `<think>${m.thinking}</think>\n\n${m.content}`
          : m.content,
    })),
  ];
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
          messages: toWireMessages(req.systemPrompt, req.messages),
        },
        { signal: req.signal }
      );
      let usage: { inputTokens: number; outputTokens: number } | undefined;
      const splitter = new ThinkTagSplitter();
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
        // Some endpoints expose reasoning in a dedicated field (`reasoning_content`
        // on MiniMax's newer API, `reasoning` on OpenRouter-style proxies)…
        const thinking = delta?.reasoning_content ?? delta?.reasoning;
        if (thinking) {
          yield { type: "thinking", text: thinking };
        }
        // …while others (MiniMax M-series) inline it in the content as
        // <think>…</think>; the splitter separates that out.
        if (delta?.content) {
          for (const event of splitter.push(delta.content)) {
            yield event;
          }
        }
      }
      for (const event of splitter.flush()) {
        yield event;
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
      // Thinking is replayed in history on this provider, so count it too.
      messages.reduce((s, m) => s + m.content.length + (m.thinking?.length ?? 0), 0) +
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
    // Strip any inline <think> reasoning so it never lands in summaries.
    return stripThinkTags(res.choices[0]?.message?.content ?? "");
  }
}
