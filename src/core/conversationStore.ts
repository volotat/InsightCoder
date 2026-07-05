import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ChatMessage, ChatRole } from "../providers/types";

export interface ConversationTurn {
  role: ChatRole;
  content: string;
  timestamp: string;
  model?: string;
  /** Assistant reasoning trace, if the model produced one. Never resent to the model. */
  thinking?: string;
  /** Tokens spent on the reasoning trace (exact if reported, else estimated). */
  thinkingTokens?: number;
}

export interface Conversation {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  turns: ConversationTurn[];
}

export interface ConversationMeta {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  turnCount: number;
}

const CONV_RE = /^conversation_(\d+)\.json$/;
const SUMMARY_RE = /^conversation_(\d+)_summary\.md$/;

function titleFrom(turns: ConversationTurn[]): string {
  const first = turns.find((t) => t.role === "user");
  if (!first) {
    return "New conversation";
  }
  const line = first.content.trim().split("\n")[0];
  return line.length > 60 ? line.slice(0, 57) + "…" : line;
}

/**
 * Canonical conversation persistence: JSON files in the EXTENSION's own storage
 * (never inside the analyzed repo). Markdown is a derived export only.
 */
export class ConversationStore {
  private current_: Conversation | undefined;

  constructor(private readonly dir: string) {}

  private convPath(id: number): string {
    return path.join(this.dir, `conversation_${id}.json`);
  }

  private summaryPath(id: number): string {
    return path.join(this.dir, `conversation_${id}_summary.md`);
  }

  async init(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const metas = await this.list();
    if (metas.length > 0) {
      const latest = metas[0];
      this.current_ = await this.load(latest.id);
    } else {
      this.current_ = await this.startNew();
    }
  }

  current(): Conversation {
    if (!this.current_) {
      throw new Error("ConversationStore not initialized");
    }
    return this.current_;
  }

  async list(): Promise<ConversationMeta[]> {
    const entries = await fs.readdir(this.dir).catch(() => [] as string[]);
    const metas: ConversationMeta[] = [];
    for (const name of entries) {
      const m = CONV_RE.exec(name);
      if (!m) {
        continue;
      }
      try {
        const conv = JSON.parse(
          await fs.readFile(path.join(this.dir, name), "utf-8")
        ) as Conversation;
        metas.push({
          id: conv.id,
          title: conv.title || `Conversation ${conv.id}`,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          turnCount: conv.turns.length,
        });
      } catch {
        // unreadable file — skip rather than crash the panel
      }
    }
    metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return metas;
  }

  async load(id: number): Promise<Conversation> {
    const conv = JSON.parse(
      await fs.readFile(this.convPath(id), "utf-8")
    ) as Conversation;
    return conv;
  }

  async switchTo(id: number): Promise<Conversation> {
    this.current_ = await this.load(id);
    return this.current_;
  }

  async startNew(): Promise<Conversation> {
    const nextId = (await this.allIds()).reduce((a, b) => Math.max(a, b), 0) + 1;
    const now = new Date().toISOString();
    const conv: Conversation = {
      id: nextId,
      title: "New conversation",
      createdAt: now,
      updatedAt: now,
      turns: [],
    };
    this.current_ = conv;
    await this.persist(conv);
    return conv;
  }

  async appendTurn(turn: ConversationTurn): Promise<void> {
    const conv = this.current();
    conv.turns.push(turn);
    conv.updatedAt = turn.timestamp;
    conv.title = titleFrom(conv.turns);
    await this.persist(conv);
  }

  async delete(id: number): Promise<void> {
    await fs.rm(this.convPath(id), { force: true });
    await fs.rm(this.summaryPath(id), { force: true });
    if (this.current_?.id === id) {
      const metas = await this.list();
      this.current_ = metas.length > 0 ? await this.load(metas[0].id) : await this.startNew();
    }
  }

  historyAsMessages(): ChatMessage[] {
    return this.current().turns.map((t) => ({ role: t.role, content: t.content }));
  }

  /** All summary file contents, sorted by conversation number — the long-term memory. */
  async listSummaries(): Promise<string> {
    const entries = await fs.readdir(this.dir).catch(() => [] as string[]);
    const files = entries
      .map((name) => ({ name, m: SUMMARY_RE.exec(name) }))
      .filter((x): x is { name: string; m: RegExpExecArray } => x.m !== null)
      .sort((a, b) => Number(a.m[1]) - Number(b.m[1]));
    const parts: string[] = [];
    for (const { name } of files) {
      const content = await fs.readFile(path.join(this.dir, name), "utf-8");
      parts.push(
        `Conversation Summary file: ${name}\n---- file start ----\n${content}\n---- file end ----\n`
      );
    }
    return parts.join("\n");
  }

  async findUnsummarized(): Promise<number[]> {
    const ids = await this.allIds();
    const result: number[] = [];
    for (const id of ids) {
      const conv = await this.load(id).catch(() => undefined);
      if (!conv || conv.turns.length === 0) {
        continue;
      }
      const hasSummary = await fs
        .access(this.summaryPath(id))
        .then(() => true)
        .catch(() => false);
      if (!hasSummary) {
        result.push(id);
      }
    }
    return result.sort((a, b) => a - b);
  }

  async writeSummary(id: number, text: string): Promise<void> {
    await fs.writeFile(this.summaryPath(id), text, "utf-8");
  }

  renderMarkdown(conv: Conversation): string {
    return conv.turns
      .map((t) => `**${t.role === "user" ? "User" : "Model"}:**\n\n${t.content}`)
      .join("\n\n") + "\n";
  }

  private async allIds(): Promise<number[]> {
    const entries = await fs.readdir(this.dir).catch(() => [] as string[]);
    return entries
      .map((name) => CONV_RE.exec(name))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => Number(m[1]));
  }

  private async persist(conv: Conversation): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const tmp = this.convPath(conv.id) + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(conv, null, 2), "utf-8");
    await fs.rename(tmp, this.convPath(conv.id));
  }
}
