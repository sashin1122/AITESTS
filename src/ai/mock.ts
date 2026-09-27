import type { AiBackend, AiResult } from "./types.js";

/** Canned responses for local development and tests; costs nothing. */
export class MockAi implements AiBackend {
  async complete(system: string, user: string): Promise<AiResult> {
    const doc = user.replace(/^<document>\n|\n<\/document>$/g, "");
    const kind = system.startsWith("You summarise") ? "Summary" : "Translation";
    return { text: `[mock ${kind}] ${doc.slice(0, 120)}${doc.length > 120 ? "…" : ""}`, truncated: false };
  }
}
