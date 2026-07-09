import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type { ChatMessage, ChatRole } from "../providers/types";

export interface ConversationTurn {
  role: ChatRole;
  content: string;
  timestamp: string;
  model?: string;
  /** Assistant reasoning trace, if the model produced one. */
  thinking?: string;
  /** Tokens spent on the reasoning trace (exact if reported, else estimated). */
  thinkingTokens?: number;
}

/** A node in the conversation tree. Editing a message creates a sibling branch. */
export interface TurnNode extends ConversationTurn {
  id: string;
  parentId: string | null;
}

export interface Conversation {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Append-only tree; sibling order = insertion order. */
  nodes: TurnNode[];
  /** Leaf whose root-path is the visible conversation. */
  activeLeafId: string | null;
}

/** A path entry enriched with sibling info for the ‹ i/n › branch switcher. */
export interface PathTurn extends ConversationTurn {
  id: string;
  siblingIndex: number;
  siblingCount: number;
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

function titleFrom(pathTurns: ConversationTurn[]): string {
  const first = pathTurns.find((t) => t.role === "user");
  if (!first) {
    return "New conversation";
  }
  const line = first.content.trim().split("\n")[0];
  return line.length > 60 ? line.slice(0, 57) + "…" : line;
}

/** Accepts both the current tree format and the legacy linear `turns` format. */
function normalize(raw: unknown): Conversation {
  const conv = raw as Conversation & { turns?: ConversationTurn[] };
  if (Array.isArray(conv.nodes)) {
    return conv;
  }
  // Legacy linear conversation → single-branch chain.
  const nodes: TurnNode[] = [];
  let parentId: string | null = null;
  for (const turn of conv.turns ?? []) {
    const node: TurnNode = { ...turn, id: randomUUID(), parentId };
    nodes.push(node);
    parentId = node.id;
  }
  return {
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    nodes,
    activeLeafId: parentId,
  };
}

function childrenOf(conv: Conversation, parentId: string | null): TurnNode[] {
  return conv.nodes.filter((n) => n.parentId === parentId);
}

function pathOf(conv: Conversation): TurnNode[] {
  const byId = new Map(conv.nodes.map((n) => [n.id, n]));
  const out: TurnNode[] = [];
  let cur = conv.activeLeafId ? byId.get(conv.activeLeafId) : undefined;
  while (cur) {
    out.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out.reverse();
}

/** Deepest descendant following the most recently created child at each level. */
function deepestDescendant(conv: Conversation, node: TurnNode): TurnNode {
  let cur = node;
  for (;;) {
    const kids = childrenOf(conv, cur.id);
    if (kids.length === 0) {
      return cur;
    }
    cur = kids[kids.length - 1];
  }
}

/**
 * Canonical conversation persistence: JSON files in the EXTENSION's own storage
 * (never inside the analyzed repo). Conversations are trees — editing a message
 * branches, and the active leaf selects which branch is visible/sent.
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

  /** The visible conversation: root path of the active leaf. */
  currentPath(): TurnNode[] {
    return pathOf(this.current());
  }

  /** The visible conversation with sibling info for the branch switcher. */
  currentPathDTO(): PathTurn[] {
    const conv = this.current();
    return pathOf(conv).map((node) => {
      const siblings = childrenOf(conv, node.parentId);
      return {
        id: node.id,
        role: node.role,
        content: node.content,
        timestamp: node.timestamp,
        model: node.model,
        thinking: node.thinking,
        thinkingTokens: node.thinkingTokens,
        siblingIndex: siblings.findIndex((s) => s.id === node.id),
        siblingCount: siblings.length,
      };
    });
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
        const conv = normalize(
          JSON.parse(await fs.readFile(path.join(this.dir, name), "utf-8"))
        );
        metas.push({
          id: conv.id,
          title: conv.title || `Conversation ${conv.id}`,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          turnCount: pathOf(conv).length,
        });
      } catch {
        // unreadable file — skip rather than crash the panel
      }
    }
    metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return metas;
  }

  async load(id: number): Promise<Conversation> {
    return normalize(JSON.parse(await fs.readFile(this.convPath(id), "utf-8")));
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
      nodes: [],
      activeLeafId: null,
    };
    this.current_ = conv;
    await this.persist(conv);
    return conv;
  }

  /** Appends a turn under the active leaf and makes it the new leaf. */
  async appendTurn(turn: ConversationTurn): Promise<void> {
    const conv = this.current();
    const node: TurnNode = { ...turn, id: randomUUID(), parentId: conv.activeLeafId };
    conv.nodes.push(node);
    conv.activeLeafId = node.id;
    conv.updatedAt = turn.timestamp;
    conv.title = titleFrom(pathOf(conv));
    await this.persist(conv);
  }

  /**
   * Edits a message by creating a SIBLING of the original node (the original
   * branch is preserved) and making the copy the active leaf.
   * Returns the edited node's role, or undefined if the id is unknown.
   */
  async editAndBranch(nodeId: string, content: string): Promise<ChatRole | undefined> {
    const conv = this.current();
    const original = conv.nodes.find((n) => n.id === nodeId);
    if (!original) {
      return undefined;
    }
    const now = new Date().toISOString();
    const branch: TurnNode = {
      id: randomUUID(),
      parentId: original.parentId,
      role: original.role,
      content,
      timestamp: now,
      model: original.model,
      // Reasoning belonged to the original wording — not carried to the edit.
    };
    conv.nodes.push(branch);
    conv.activeLeafId = branch.id;
    conv.updatedAt = now;
    conv.title = titleFrom(pathOf(conv));
    await this.persist(conv);
    return branch.role;
  }

  /** Switches a path node to its index-th sibling; the deepest, most recent descendant of that sibling becomes the leaf. */
  async selectSibling(nodeId: string, index: number): Promise<boolean> {
    const conv = this.current();
    const node = conv.nodes.find((n) => n.id === nodeId);
    if (!node) {
      return false;
    }
    const siblings = childrenOf(conv, node.parentId);
    const target = siblings[index];
    if (!target) {
      return false;
    }
    conv.activeLeafId = deepestDescendant(conv, target).id;
    conv.title = titleFrom(pathOf(conv));
    await this.persist(conv);
    return true;
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
    return this.currentPath().map((t) => ({
      role: t.role,
      content: t.content,
      // Carried along so providers that need reasoning replayed (MiniMax
      // interleaved thinking) can reconstruct it; others ignore it.
      thinking: t.thinking,
    }));
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
      if (!conv || conv.nodes.length === 0) {
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

  /** Human-readable transcript of the ACTIVE branch. Reasoning traces excluded. */
  renderMarkdown(conv: Conversation): string {
    return (
      pathOf(conv)
        .map((t) => `**${t.role === "user" ? "User" : "Model"}:**\n\n${t.content}`)
        .join("\n\n") + "\n"
    );
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
