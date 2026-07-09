import type { SettingsReader } from "../config/settings";
import { SecretsStore } from "../config/secrets";
import { GeminiProvider } from "./geminiProvider";
import { OpenAICompatProvider } from "./openaiCompatProvider";
import type { LLMProvider, ModelInfo } from "./types";

export interface ActiveModel {
  providerId: string;
  modelId: string;
}

export interface ModelChoiceEntry {
  providerId: string;
  modelId: string;
  label: string;
  contextWindow?: number;
}

const GEMINI_STATIC: ModelInfo[] = [
  { id: "gemini-3.5-flash", contextWindow: 1048576 },
  { id: "gemini-3.5-pro", contextWindow: 1048576 },
];

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
  private modelChoicesCache: ModelChoiceEntry[] | undefined;

  constructor(
    private readonly settings: SettingsReader,
    private readonly secrets: SecretsStore
  ) {}

  invalidate(): void {
    this.cache.clear();
    // baseUrl / provider / key may have changed — next refresh repopulates.
    this.modelChoicesCache = undefined;
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

  private openAiCompatId(): string {
    const cfg = this.settings.get();
    return cfg.provider === "gemini" ? "minimax" : cfg.provider;
  }

  private staticMinimaxModels(): ModelInfo[] {
    const cfg = this.settings.get();
    return [{ id: cfg.provider === "gemini" ? "MiniMax-M3" : cfg.model }];
  }

  private static assemble(
    openAiCompatId: string,
    minimaxModels: ModelInfo[],
    geminiModels: ModelInfo[]
  ): ModelChoiceEntry[] {
    return [
      ...minimaxModels.map((m) => ({
        providerId: openAiCompatId,
        modelId: m.id,
        label: `${m.id} (MiniMax)`,
        contextWindow: m.contextWindow,
      })),
      ...geminiModels.map((m) => ({
        providerId: "gemini",
        modelId: m.id,
        label: `${m.id} (Gemini)`,
        contextWindow: m.contextWindow,
      })),
    ];
  }

  /**
   * Model choices with ZERO network I/O: the last refreshed list if available,
   * else the static fallbacks. Lets the panel initialize instantly; callers
   * kick off refreshModelChoices() in the background for the real list.
   */
  getCachedModelChoices(): ModelChoiceEntry[] {
    if (this.modelChoicesCache) {
      return this.modelChoicesCache;
    }
    return ProviderRegistry.assemble(
      this.openAiCompatId(),
      this.staticMinimaxModels(),
      GEMINI_STATIC
    );
  }

  /** Query both providers (in parallel) for their model lists and cache the result. */
  async refreshModelChoices(): Promise<ModelChoiceEntry[]> {
    const openAiCompatId = this.openAiCompatId();

    const listFor = async (providerId: string, fallback: ModelInfo[]): Promise<ModelInfo[]> => {
      if (!(await this.hasApiKey(providerId))) {
        return fallback;
      }
      try {
        const provider = await this.getProvider(providerId);
        const listed = await provider.listModels();
        return listed.length > 0 ? listed : fallback;
      } catch {
        return fallback;
      }
    };

    const [minimaxModels, geminiModels] = await Promise.all([
      listFor(openAiCompatId, this.staticMinimaxModels()),
      listFor("gemini", GEMINI_STATIC),
    ]);

    this.modelChoicesCache = ProviderRegistry.assemble(openAiCompatId, minimaxModels, geminiModels);
    return this.modelChoicesCache;
  }
}
