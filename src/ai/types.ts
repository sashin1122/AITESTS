export interface AiResult {
  text: string;
  /** True when the model hit the output limit and the answer may be cut short. */
  truncated: boolean;
}

export interface AiBackend {
  complete(system: string, user: string, maxTokens: number): Promise<AiResult>;
}

/** The model declined the request; retrying the same input won't help. */
export class AiRefusedError extends Error {}
