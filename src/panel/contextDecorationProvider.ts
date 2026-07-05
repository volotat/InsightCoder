import * as vscode from "vscode";
import type { ProjectContext } from "../core/contextEngine";

/**
 * Marks files in the Explorer according to their role in the current model
 * context: included files get a check badge, scanned-but-skipped files get a
 * minus badge with the skip reason. Unmarked files are not part of the context.
 */
export class ContextDecorationProvider implements vscode.FileDecorationProvider {
  private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this.changeEmitter.event;

  private included = new Set<string>();
  private skipped = new Map<string, string>();

  constructor(private readonly root: vscode.Uri) {}

  update(ctx: ProjectContext): void {
    this.included = new Set(ctx.files.map((f) => f.relPath));
    this.skipped = new Map(ctx.skipped.map((s) => [s.path, s.reason]));
    // Undefined = "everything may have changed"; VS Code re-queries visible items.
    this.changeEmitter.fire(undefined);
  }

  clear(): void {
    this.included.clear();
    this.skipped.clear();
    this.changeEmitter.fire(undefined);
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme !== "file" || !uri.fsPath.startsWith(this.root.fsPath)) {
      return undefined;
    }
    const rel = vscode.workspace.asRelativePath(uri, false);
    if (this.included.has(rel)) {
      return {
        badge: "✓",
        tooltip: "InsightCoder: included in the model context",
        color: new vscode.ThemeColor("charts.green"),
      };
    }
    const reason = this.skipped.get(rel);
    if (reason) {
      return {
        badge: "−",
        tooltip: `InsightCoder: excluded from the model context (${reason})`,
        color: new vscode.ThemeColor("disabledForeground"),
      };
    }
    return undefined;
  }
}
