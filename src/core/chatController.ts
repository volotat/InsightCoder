import type { SettingsReader } from "../config/settings";
import type { ChatMessage } from "../providers/types";
import { MissingApiKeyError, ProviderRegistry } from "../providers/providerRegistry";
import type { HostToWebview, TurnState } from "../panel/protocol";
import {
  ContextEngine,
  contextBreakdown,
  largestFiles,
  type ContextFileStat,
  type ProjectContext,
} from "./contextEngine";
import { ConversationStore } from "./conversationStore";
import { buildSystemPrompt } from "./promptBuilder";
import { Summarizer } from "./summarizer";
import { TokenService } from "./tokenService";

const CHUNK_FLUSH_MS = 50;

export type MessageSink = (msg: HostToWebview) => void;

/**
 * The turn state machine: idle → assemblingContext → streaming → saving → idle.
 * Owns the context cache and the in-flight stream; the webview bridge is a
 * thin message router on top of this class.
 */
export class ChatController {
  private state: TurnState = "idle";
  private context: ProjectContext | undefined;
  private systemPrompt: string | undefined;
  private abort: AbortController | undefined;
  private largeContextDecision: ((accept: boolean) => void) | undefined;
  private sink: MessageSink = () => {};

  /** Notified after every successful context build (e.g. Explorer decorations). */
  onContextBuilt: ((ctx: ProjectContext) => void) | undefined;

  readonly tokens = new TokenService();

  constructor(
    private readonly engine: ContextEngine,
    private readonly store: ConversationStore,
    private readonly registry: ProviderRegistry,
    private readonly settings: SettingsReader,
    private readonly summarizer: Summarizer,
    private readonly log: (msg: string) => void
  ) {}

  attachSink(sink: MessageSink): void {
    this.sink = sink;
  }

  getState(): TurnState {
    return this.state;
  }

  getSystemPrompt(): string | undefined {
    return this.systemPrompt;
  }

  /** Per-file context size breakdown (largest first); empty until the context is built. */
  getContextBreakdown(): ContextFileStat[] {
    return this.context ? contextBreakdown(this.context) : [];
  }

  getContextInfo(): HostToWebview | undefined {
    if (!this.context) {
      return undefined;
    }
    return {
      type: "contextInfo",
      info: {
        fileCount: this.context.files.length,
        estimatedTokens: this.context.estimatedTokens,
        skippedCount: this.context.skipped.length,
      },
    };
  }

  invalidateContext(): void {
    this.context = undefined;
    this.systemPrompt = undefined;
  }

  private setState(state: TurnState): void {
    this.state = state;
    this.sink({ type: "turnState", state });
  }

  async ensureContext(force = false): Promise<ProjectContext> {
    if (this.context && !force) {
      return this.context;
    }
    const summaries = await this.store.listSummaries();
    this.context = await this.engine.buildContext(summaries, (m) => this.log(m));
    this.systemPrompt = buildSystemPrompt(this.context);
    this.sink({
      type: "contextInfo",
      info: {
        fileCount: this.context.files.length,
        estimatedTokens: this.context.estimatedTokens,
        skippedCount: this.context.skipped.length,
      },
    });
    this.log(
      `Context assembled: ${this.context.files.length} files, ~${this.context.estimatedTokens} tokens, ${this.context.skipped.length} skipped`
    );
    this.onContextBuilt?.(this.context);
    // Surface the would-be input size immediately, before anything is sent.
    void this.countDraftTokens("");
    return this.context;
  }

  async reloadContext(): Promise<void> {
    if (this.state !== "idle") {
      return;
    }
    this.setState("assemblingContext");
    try {
      await this.ensureContext(true);
    } catch (e) {
      this.sink({ type: "error", message: `Context reload failed: ${e}` });
    } finally {
      this.setState("idle");
    }
  }

  /** Size guard: never silently ship an over-limit prompt. */
  private async confirmIfTooLarge(ctx: ProjectContext): Promise<boolean> {
    const limit = this.settings.get().context.maxTokens;
    if (ctx.estimatedTokens <= limit) {
      return true;
    }
    this.sink({
      type: "contextInfo",
      info: {
        fileCount: ctx.files.length,
        estimatedTokens: ctx.estimatedTokens,
        skippedCount: ctx.skipped.length,
        warnTooLarge: { limit, largestFiles: largestFiles(ctx) },
      },
    });
    return new Promise<boolean>((resolve) => {
      this.largeContextDecision = resolve;
    });
  }

  resolveLargeContext(accept: boolean): void {
    this.largeContextDecision?.(accept);
    this.largeContextDecision = undefined;
  }

  cancel(): void {
    this.abort?.abort();
  }

  /** A message is resendable when the active branch ends in a user turn with no answer. */
  canResend(): boolean {
    const turns = this.store.currentPath();
    return turns.length > 0 && turns[turns.length - 1].role === "user";
  }

  emitResendState(): void {
    this.sink({ type: "canResend", value: this.canResend() });
  }

  async sendMessage(text: string): Promise<void> {
    if (this.state !== "idle" || !text.trim()) {
      return;
    }
    this.setState("assemblingContext");
    try {
      const ctx = await this.ensureContext();
      if (!(await this.confirmIfTooLarge(ctx))) {
        this.setState("idle");
        return;
      }
      // History captured BEFORE appending, so the new message isn't duplicated.
      const history = this.store.historyAsMessages();
      // Commit the user turn before contacting the provider — any later failure
      // leaves a resendable dangling turn.
      await this.store.appendTurn({
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      });
      await this.runCompletion(text, history);
    } catch (e) {
      this.reportError(e);
      this.setState("idle");
      this.emitResendState();
    }
  }

  /** Re-run the last unanswered user turn without appending it again. */
  async resendLast(): Promise<void> {
    if (this.state !== "idle" || !this.canResend()) {
      return;
    }
    const turns = this.store.currentPath();
    const text = turns[turns.length - 1].content;
    const history: ChatMessage[] = turns
      .slice(0, -1)
      .map((t) => ({ role: t.role, content: t.content, thinking: t.thinking }));
    this.setState("assemblingContext");
    try {
      const ctx = await this.ensureContext();
      if (!(await this.confirmIfTooLarge(ctx))) {
        this.setState("idle");
        return;
      }
      await this.runCompletion(text, history);
    } catch (e) {
      this.reportError(e);
      this.setState("idle");
      this.emitResendState();
    }
  }

  /** Streams one assistant turn for `userText` given prior `history`, then persists it. */
  private async runCompletion(userText: string, history: ChatMessage[]): Promise<void> {
    const provider = await this.registry.getProvider();
    const { modelId } = this.registry.getActiveModel();

    this.setState("streaming");
    this.sink({ type: "streamStart" });
    this.abort = new AbortController();

    let full = "";
    let pending = "";
    let thinkingFull = "";
    let thinkingPending = "";
    let usage: { inputTokens: number; outputTokens: number; reasoningTokens?: number } | undefined;
    let streamError: string | undefined;
    let lastFlush = Date.now();

    const flushText = () => {
      if (pending) {
        this.sink({ type: "streamChunk", text: pending });
        pending = "";
        lastFlush = Date.now();
      }
    };
    const flushThinking = () => {
      if (thinkingPending) {
        this.sink({ type: "thinkingChunk", text: thinkingPending });
        thinkingPending = "";
        // Live estimate of thinking cost — updates continuously while thinking.
        this.sink({
          type: "thinkingTokens",
          count: this.tokens.estimate(thinkingFull.length),
          exact: false,
        });
        lastFlush = Date.now();
      }
    };

    try {
      const stream = provider.streamChat({
        systemPrompt: this.systemPrompt!,
        messages: [...history, { role: "user", content: userText }],
        model: modelId,
        generation: this.settings.get().generation,
        signal: this.abort.signal,
      });

      for await (const event of stream) {
        if (event.type === "thinking") {
          thinkingFull += event.text;
          thinkingPending += event.text;
          if (Date.now() - lastFlush >= CHUNK_FLUSH_MS) {
            flushThinking();
          }
        } else if (event.type === "reclassify") {
          // The model auto-prefixed <think>: the answer streamed so far was
          // actually reasoning. Move it into the thinking trace on both sides.
          const tail = pending;
          thinkingFull = full;
          full = "";
          pending = "";
          this.sink({ type: "reclassifyThinking" });
          if (tail) {
            this.sink({ type: "thinkingChunk", text: tail });
          }
          this.sink({
            type: "thinkingTokens",
            count: this.tokens.estimate(thinkingFull.length),
            exact: false,
          });
        } else if (event.type === "text") {
          // Answer started — make sure any buffered thinking is flushed first.
          flushThinking();
          full += event.text;
          pending += event.text;
          if (Date.now() - lastFlush >= CHUNK_FLUSH_MS) {
            flushText();
          }
        } else if (event.type === "done") {
          usage = event.usage;
        } else {
          streamError = event.message;
        }
      }
    } finally {
      this.abort = undefined;
    }
    flushThinking();
    flushText();

    const thinkingTokens =
      thinkingFull.length > 0
        ? usage?.reasoningTokens ?? this.tokens.estimate(thinkingFull.length)
        : undefined;

    if (streamError && !full) {
      this.sink({ type: "error", message: streamError });
      this.sink({ type: "streamEnd" });
      this.setState("idle");
      this.emitResendState();
      return;
    }

    this.setState("saving");
    if (full) {
      await this.store.appendTurn({
        role: "assistant",
        content: full,
        timestamp: new Date().toISOString(),
        model: modelId,
        thinking: thinkingFull || undefined,
        thinkingTokens,
      });
    }
    this.sink({ type: "streamEnd", usage, thinking: thinkingFull || undefined, thinkingTokens });
    if (streamError) {
      this.sink({ type: "error", message: `Stream ended early: ${streamError}` });
    }

    if (usage) {
      const totalChars =
        (this.systemPrompt?.length ?? 0) +
        history.reduce((s, m) => s + m.content.length, 0) +
        userText.length;
      this.tokens.calibrate(totalChars, usage.inputTokens);
    }

    void this.summarizer.summarize(this.store.current());
    void this.countDraftTokens("");
    this.setState("idle");
    this.emitResendState();
  }

  private reportError(e: unknown): void {
    if (e instanceof MissingApiKeyError) {
      this.sink({ type: "apiKeyState", hasApiKey: false });
      this.sink({
        type: "error",
        message: "No API key set for the active provider. Run “InsightCoder: Set API Key…”.",
      });
    } else {
      this.sink({ type: "error", message: String(e) });
    }
  }

  /**
   * Counts the FULL input that would be sent right now (system prompt with the
   * whole codebase + conversation history + draft). Falls back to a local
   * estimate when no provider/key is available, so the number is visible
   * before the first message is ever sent.
   */
  async countDraftTokens(draft: string): Promise<void> {
    const systemPrompt = this.systemPrompt ?? "";
    const messages = this.store.historyAsMessages();
    try {
      const provider = await this.registry.getProvider();
      const { modelId } = this.registry.getActiveModel();
      const count = await this.tokens.count(provider, systemPrompt, messages, modelId, draft);
      this.sink({ type: "tokenCount", total: count.total, exact: count.exact });
    } catch {
      const chars =
        systemPrompt.length +
        messages.reduce((s, m) => s + m.content.length, 0) +
        draft.length;
      this.sink({ type: "tokenCount", total: this.tokens.estimate(chars), exact: false });
    }
  }
}
