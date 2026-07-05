import * as vscode from "vscode";

const KEY_PREFIX = "insightcoder.apiKey.";

/** Provider ids share a secret slot when they use the same account/endpoint family. */
function secretKeyFor(providerId: string): string {
  const normalized = providerId === "openai-compatible" ? "minimax" : providerId;
  return `${KEY_PREFIX}${normalized}`;
}

export class SecretsStore {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async getApiKey(providerId: string): Promise<string | undefined> {
    return this.secrets.get(secretKeyFor(providerId));
  }

  async setApiKey(providerId: string, value: string): Promise<void> {
    await this.secrets.store(secretKeyFor(providerId), value);
  }

  async deleteApiKey(providerId: string): Promise<void> {
    await this.secrets.delete(secretKeyFor(providerId));
  }

  onDidChange(listener: () => void): vscode.Disposable {
    return this.secrets.onDidChange((e) => {
      if (e.key.startsWith(KEY_PREFIX)) {
        listener();
      }
    });
  }
}

/** Interactive command flow: pick provider, then paste the key (masked). */
export async function promptSetApiKey(secrets: SecretsStore): Promise<void> {
  const pick = await vscode.window.showQuickPick(
    [
      { label: "MiniMax / OpenAI-compatible", id: "minimax" },
      { label: "Google Gemini", id: "gemini" },
    ],
    { placeHolder: "Which provider's API key do you want to set?" }
  );
  if (!pick) {
    return;
  }
  const value = await vscode.window.showInputBox({
    prompt: `API key for ${pick.label}`,
    password: true,
    ignoreFocusOut: true,
  });
  if (value === undefined) {
    return;
  }
  if (value.trim() === "") {
    await secrets.deleteApiKey(pick.id);
    vscode.window.showInformationMessage(`InsightCoder: cleared API key for ${pick.label}.`);
    return;
  }
  await secrets.setApiKey(pick.id, value.trim());
  vscode.window.showInformationMessage(`InsightCoder: API key for ${pick.label} saved.`);
}
