import Anthropic from "@anthropic-ai/sdk";
import { AiRefusedError, type AiBackend, type AiResult } from "./types.js";

// Models that support the server-side refusal fallback and effort control.
const FALLBACK_MODELS = new Set(["claude-opus-5"]);
const EFFORT_MODELS = new Set(["claude-opus-5", "claude-sonnet-5"]);

export class AnthropicAi implements AiBackend {
  // Reads ANTHROPIC_API_KEY from the environment.
  private readonly client = new Anthropic();

  constructor(private readonly model: string) {}

  async complete(system: string, user: string, maxTokens: number): Promise<AiResult> {
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
      // Summaries and translations don't need deep reasoning; low effort keeps cost down.
      ...(EFFORT_MODELS.has(this.model) && { output_config: { effort: "low" as const } }),
      // If the model declines, let the API retry on Anthropic's recommended fallback model.
      ...(FALLBACK_MODELS.has(this.model) && {
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default" as const,
      }),
    });

    if (response.stop_reason === "refusal") {
      throw new AiRefusedError(response.stop_details?.explanation ?? "The model declined this request");
    }

    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
      .trim();
    return { text, truncated: response.stop_reason === "max_tokens" };
  }
}
