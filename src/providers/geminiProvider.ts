import { GoogleGenAI } from "@google/genai";
import type {
  ChatMessage,
  ChatRequest,
  LLMProvider,
  ModelInfo,
  StreamEvent,
  TokenCount,
} from "./types";

function toContents(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

/**
 * Uses the stateless generateContentStream API: history is owned by the
 * ConversationStore and sent fully each turn — no SDK chat-session object,
 * no private-attribute access (unlike the old Python app).
 */
export class GeminiProvider implements LLMProvider {
  readonly id = "gemini";
  private readonly ai: GoogleGenAI;

  constructor(apiKey: string, private readonly configuredModel: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async *streamChat(req: ChatRequest): AsyncIterable<StreamEvent> {
    try {
      const stream = await this.ai.models.generateContentStream({
        model: req.model,
        contents: toContents(req.messages),
        config: {
          systemInstruction: req.systemPrompt,
          temperature: req.generation.temperature,
          maxOutputTokens: req.generation.maxOutputTokens,
          // Ask the model to surface its reasoning so we can show/hide it.
          thinkingConfig: { includeThoughts: true },
          abortSignal: req.signal,
        },
      });
      let usage: { inputTokens: number; outputTokens: number; reasoningTokens?: number } | undefined;
      for await (const chunk of stream) {
        const meta = chunk.usageMetadata;
        if (meta?.promptTokenCount !== undefined) {
          usage = {
            inputTokens: meta.promptTokenCount ?? 0,
            outputTokens: meta.candidatesTokenCount ?? 0,
            reasoningTokens: meta.thoughtsTokenCount,
          };
        }
        // Thought parts carry `thought: true`; answer parts don't.
        const parts = chunk.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          if (!part.text) {
            continue;
          }
          if ((part as { thought?: boolean }).thought) {
            yield { type: "thinking", text: part.text };
          } else {
            yield { type: "text", text: part.text };
          }
        }
      }
      yield { type: "done", usage };
    } catch (e) {
      if (req.signal?.aborted) {
        yield { type: "done" };
        return;
      }
      const message = e instanceof Error ? e.message : String(e);
      yield { type: "error", message, retryable: /429|503|500/.test(message) };
    }
  }

  async countTokens(
    systemPrompt: string,
    messages: ChatMessage[],
    model: string,
    draft?: string
  ): Promise<TokenCount> {
    // countTokens has no systemInstruction param — fold the system prompt and
    // draft in as user contents; same tokenizer, same total.
    const contents = [
      { role: "user", parts: [{ text: systemPrompt }] },
      ...toContents(messages),
      ...(draft ? [{ role: "user", parts: [{ text: draft }] }] : []),
    ];
    const res = await this.ai.models.countTokens({ model, contents });
    return { total: res.totalTokens ?? 0, exact: true };
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const pager = await this.ai.models.list();
      const out: ModelInfo[] = [];
      for await (const m of pager) {
        const name = (m.name ?? "").replace(/^models\//, "");
        if (name.includes("gemini") && m.supportedActions?.includes("generateContent")) {
          out.push({ id: name, contextWindow: m.inputTokenLimit });
        }
      }
      if (out.length > 0) {
        return out;
      }
    } catch {
      // offline or restricted key — fall through to static list
    }
    return [
      { id: this.configuredModel },
      { id: "gemini-3.5-flash", contextWindow: 1048576 },
      { id: "gemini-3.5-pro", contextWindow: 1048576 },
    ].filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);
  }

  async generateOnce(
    prompt: string,
    opts: { model: string; temperature?: number; maxOutputTokens?: number }
  ): Promise<string> {
    const res = await this.ai.models.generateContent({
      model: opts.model,
      contents: prompt,
      config: {
        temperature: opts.temperature,
        maxOutputTokens: opts.maxOutputTokens,
      },
    });
    return res.text?.trim() ?? "";
  }
}
