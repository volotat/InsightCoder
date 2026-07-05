import { describe, expect, it } from "vitest";
import { TokenService } from "../core/tokenService";
import type { LLMProvider, TokenCount } from "../providers/types";

function providerWith(count: TokenCount | Error): LLMProvider {
  return {
    id: "fake",
    streamChat: async function* () {},
    async countTokens() {
      if (count instanceof Error) {
        throw count;
      }
      return count;
    },
    async listModels() {
      return [];
    },
    async generateOnce() {
      return "";
    },
  };
}

describe("TokenService", () => {
  it("passes through exact provider counts", async () => {
    const svc = new TokenService();
    const result = await svc.count(providerWith({ total: 123, exact: true }), "sys", [], "m");
    expect(result).toEqual({ total: 123, exact: true });
  });

  it("estimates with the default ratio when the provider is inexact", async () => {
    const svc = new TokenService();
    const result = await svc.count(
      providerWith({ total: 1, exact: false }),
      "a".repeat(400),
      [],
      "m"
    );
    expect(result).toEqual({ total: 100, exact: false });
  });

  it("recalibrates from real usage", async () => {
    const svc = new TokenService();
    svc.calibrate(1000, 500); // 2 chars per token
    const result = await svc.count(providerWith(new Error("offline")), "a".repeat(400), [], "m");
    expect(result).toEqual({ total: 200, exact: false });
  });
});
