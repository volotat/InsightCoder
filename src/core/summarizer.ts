import type { SettingsReader } from "../config/settings";
import { ProviderRegistry } from "../providers/providerRegistry";
import type { Conversation, ConversationStore } from "./conversationStore";
import { buildSummaryPrompt, SUMMARY_GENERATION } from "./promptBuilder";

const BACKFILL_DELAY_MS = 5000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Summarizer {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly settings: SettingsReader,
    private readonly store: ConversationStore,
    private readonly log: (msg: string) => void
  ) {}

  /** Fire-and-forget after each turn; failures are logged, never surfaced as errors. */
  async summarize(conv: Conversation): Promise<void> {
    if (!this.settings.get().summariesEnabled || conv.nodes.length === 0) {
      return;
    }
    try {
      const text = this.store.renderMarkdown(conv);
      const provider = await this.registry.getProvider();
      const { modelId } = this.registry.getActiveModel();
      const summary = await provider.generateOnce(buildSummaryPrompt(text), {
        model: modelId,
        ...SUMMARY_GENERATION,
      });
      if (summary) {
        await this.store.writeSummary(conv.id, summary);
        this.log(`Summary written for conversation ${conv.id}`);
      }
    } catch (e) {
      this.log(`Summarization failed for conversation ${conv.id}: ${e}`);
    }
  }

  /**
   * Back-fill summaries for conversations that don't have one yet.
   * Runs non-blocking after activation (the old app blocked launch on this),
   * spaced out to respect rate limits.
   */
  async backfill(progress?: (done: number, total: number) => void): Promise<void> {
    if (!this.settings.get().summariesEnabled) {
      return;
    }
    const ids = await this.store.findUnsummarized();
    if (ids.length === 0) {
      return;
    }
    this.log(`Back-filling summaries for ${ids.length} conversation(s)…`);
    let done = 0;
    for (const id of ids) {
      const conv = await this.store.load(id).catch(() => undefined);
      if (conv) {
        await this.summarize(conv);
      }
      done++;
      progress?.(done, ids.length);
      if (done < ids.length) {
        await sleep(BACKFILL_DELAY_MS);
      }
    }
  }
}
