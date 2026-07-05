import * as vscode from "vscode";
import type { GenerationParams } from "../providers/types";

export interface InsightCoderSettings {
  provider: "minimax" | "gemini" | "openai-compatible";
  model: string;
  baseUrl: string;
  context: {
    include: string[];
    exclude: string[];
    maxTokens: number;
    maxFileSizeKb: number;
  };
  generation: GenerationParams;
  summariesEnabled: boolean;
}

/** Narrow interface so core code can be unit-tested without vscode. */
export interface SettingsReader {
  get(): InsightCoderSettings;
}

export class VSCodeSettingsReader implements SettingsReader {
  get(): InsightCoderSettings {
    const cfg = vscode.workspace.getConfiguration("insightcoder");
    return {
      provider: cfg.get<InsightCoderSettings["provider"]>("provider", "minimax"),
      model: cfg.get<string>("model", "MiniMax-M3"),
      baseUrl: cfg.get<string>("baseUrl", "https://api.minimax.io/v1"),
      context: {
        include: cfg.get<string[]>("context.include", ["**/*"]),
        exclude: cfg.get<string[]>("context.exclude", []),
        maxTokens: cfg.get<number>("context.maxTokens", 500000),
        maxFileSizeKb: cfg.get<number>("context.maxFileSizeKb", 256),
      },
      generation: {
        temperature: cfg.get<number>("generation.temperature", 1.0),
        maxOutputTokens: cfg.get<number>("generation.maxOutputTokens", 65536),
      },
      summariesEnabled: cfg.get<boolean>("summaries.enabled", true),
    };
  }
}
