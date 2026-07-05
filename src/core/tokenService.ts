import type { ChatMessage, LLMProvider, TokenCount } from "../providers/types";

/**
 * Token counting with graceful degradation: exact counts from providers that
 * have a real endpoint (Gemini); a chars-per-token estimate otherwise,
 * recalibrated from the real usage every completed turn so it converges on
 * the provider's actual tokenizer.
 */
export class TokenService {
  private charsPerToken = 4;

  calibrate(totalChars: number, inputTokens: number): void {
    if (inputTokens > 0 && totalChars > 0) {
      this.charsPerToken = totalChars / inputTokens;
    }
  }

  /** Pure local estimate — used when no provider/key is available yet. */
  estimate(chars: number): number {
    return Math.ceil(chars / this.charsPerToken);
  }

  async count(
    provider: LLMProvider,
    systemPrompt: string,
    messages: ChatMessage[],
    model: string,
    draft?: string
  ): Promise<TokenCount> {
    try {
      const result = await provider.countTokens(systemPrompt, messages, model, draft);
      if (result.exact) {
        return result;
      }
    } catch {
      // fall through to the local estimate
    }
    const chars =
      systemPrompt.length +
      messages.reduce((s, m) => s + m.content.length, 0) +
      (draft?.length ?? 0);
    return { total: Math.ceil(chars / this.charsPerToken), exact: false };
  }
}
