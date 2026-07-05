/**
 * Manual smoke test against real provider endpoints (never runs in CI).
 *
 *   MINIMAX_API_KEY=... GEMINI_API_KEY=... npm run test:live
 *
 * Set one or both keys; providers without a key are skipped.
 */
import { GeminiProvider } from "../src/providers/geminiProvider";
import { OpenAICompatProvider } from "../src/providers/openaiCompatProvider";
import type { LLMProvider } from "../src/providers/types";

const PROMPT = "Reply with exactly: OK";

async function exercise(provider: LLMProvider, model: string): Promise<void> {
  console.log(`\n=== ${provider.id} / ${model} ===`);

  let text = "";
  let sawUsage = false;
  for await (const event of provider.streamChat({
    systemPrompt: "You are a test harness. Follow instructions literally.",
    messages: [{ role: "user", content: PROMPT }],
    model,
    generation: { temperature: 0, maxOutputTokens: 128 },
  })) {
    if (event.type === "text") {
      text += event.text;
    } else if (event.type === "done") {
      sawUsage = event.usage !== undefined;
      if (event.usage) {
        console.log(`usage: in=${event.usage.inputTokens} out=${event.usage.outputTokens}`);
      }
    } else {
      throw new Error(`stream error: ${event.message}`);
    }
  }
  if (!text.trim()) {
    throw new Error("empty stream");
  }
  console.log(`stream ok: "${text.trim().slice(0, 60)}" (usage reported: ${sawUsage})`);

  const count = await provider.countTokens("system", [{ role: "user", content: PROMPT }], model);
  console.log(`countTokens: ${count.total} (exact: ${count.exact})`);

  const once = await provider.generateOnce(PROMPT, { model, temperature: 0, maxOutputTokens: 64 });
  console.log(`generateOnce ok: "${once.slice(0, 60)}"`);
}

const minimaxKey = process.env.MINIMAX_API_KEY;
const geminiKey = process.env.GEMINI_API_KEY;
const baseUrl = process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io/v1";
const minimaxModel = process.env.MINIMAX_MODEL ?? "MiniMax-M3";
const geminiModel = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";

if (!minimaxKey && !geminiKey) {
  console.error("Set MINIMAX_API_KEY and/or GEMINI_API_KEY.");
  process.exit(1);
}

try {
  if (minimaxKey) {
    await exercise(new OpenAICompatProvider("minimax", minimaxKey, baseUrl, minimaxModel), minimaxModel);
  }
  if (geminiKey) {
    await exercise(new GeminiProvider(geminiKey, geminiModel), geminiModel);
  }
  console.log("\nAll live checks passed.");
} catch (e) {
  console.error("\nLive check FAILED:", e);
  process.exit(1);
}
