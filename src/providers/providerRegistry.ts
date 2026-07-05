import type { SettingsReader } from "../config/settings";
import { SecretsStore } from "../config/secrets";
import { GeminiProvider } from "./geminiProvider";
import { OpenAICompatProvider } from "./openaiCompatProvider";
import type { LLMProvider, ModelInfo } from "./types";

export interface ActiveModel {
  providerId: string;
  modelId: string;
}

const MISSING_KEY = "MISSING_API_KEY";

export class MissingApiKeyError extends Error {
  constructor(readonly providerId: string) {
    super(MISSING_KEY);
  }
}

/**
 * Builds and caches provider instances from settings + secrets; the cache is
 * invalidated on configuration or secret changes so a stale key is never reused.
 */
export class ProviderRegistry {
  private cache = new Map<string, LLMProvider>();
  private active: ActiveModel | undefined;

  constructor(
    private readonly settings: SettingsReader,
    private readonly secrets: SecretsStore
  ) {}

  invalidate(): void {
    this.cache.clear();
  }

  /** In-session model override from the dropdown; falls back to settings. */
  setActiveModel(providerId: string, modelId: string): void {
    this.active = { providerId, modelId };
  }

  getActiveModel(): ActiveModel {
    if (this.active) {
      return this.active;
    }
    const cfg = this.settings.get();
    return { providerId: cfg.provider, modelId: cfg.model };
  }

  async hasApiKey(providerId?: string): Promise<boolean> {
    const id = providerId ?? this.getActiveModel().providerId;
    return (await this.secrets.getApiKey(id)) !== undefined;
  }

  async getProvider(providerId?: string): Promise<LLMProvider> {
    const id = providerId ?? this.getActiveModel().providerId;
    const cached = this.cache.get(id);
    if (cached) {
      return cached;
    }
    const apiKey = await this.secrets.getApiKey(id);
    if (!apiKey) {
      throw new MissingApiKeyError(id);
    }
    const cfg = this.settings.get();
    const provider: LLMProvider =
      id === "gemini"
        ? new GeminiProvider(apiKey, cfg.model)
        : new OpenAICompatProvider(id, apiKey, cfg.baseUrl, cfg.model);
    this.cache.set(id, provider);
    return provider;
  }

  /** Model choices for the dropdown, across all providers with a stored key. */
  async listModelChoices(): Promise<
    { providerId: string; modelId: string; label: string; contextWindow?: number }[]
  > {
    const cfg = this.settings.get();
    const choices: { providerId: string; modelId: string; label: string; contextWindow?: number }[] = [];

    const openAiCompatId = cfg.provider === "gemini" ? "minimax" : cfg.provider;
    const minimaxModels: ModelInfo[] = [{ id: cfg.provider === "gemini" ? "MiniMax-M3" : cfg.model }];
    if (await this.hasApiKey(openAiCompatId)) {
      try {
        const provider = await this.getProvider(openAiCompatId);
        const listed = await provider.listModels();
        if (listed.length > 0) {
          minimaxModels.splice(0, minimaxModels.length, ...listed);
        }
      } catch {
        // keep the static fallback
      }
    }
    for (const m of minimaxModels) {
      choices.push({
        providerId: openAiCompatId,
        modelId: m.id,
        label: `${m.id} (MiniMax)`,
        contextWindow: m.contextWindow,
      });
    }

    const geminiStatic: ModelInfo[] = [
      { id: "gemini-3.5-flash", contextWindow: 1048576 },
      { id: "gemini-3.5-pro", contextWindow: 1048576 },
    ];
    let geminiModels = geminiStatic;
    if (await this.hasApiKey("gemini")) {
      try {
        const provider = await this.getProvider("gemini");
        const listed = await provider.listModels();
        if (listed.length > 0) {
          geminiModels = listed;
        }
      } catch {
        // keep the static fallback
      }
    }
    for (const m of geminiModels) {
      choices.push({
        providerId: "gemini",
        modelId: m.id,
        label: `${m.id} (Gemini)`,
        contextWindow: m.contextWindow,
      });
    }
    return choices;
  }
}
