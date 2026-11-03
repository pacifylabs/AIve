import type { z } from 'zod';

/** How hard the model should think. Maps to the API's `output_config.effort`. */
export type Effort = 'low' | 'medium' | 'high';

export interface GenerateRequest<T extends z.ZodType> {
  model: string;
  /** The rules: who the staff member is and what it may do. Never contains untrusted text. */
  system: string;
  /** The task, with any untrusted text already wrapped in tagged data blocks after the rules. */
  user: string;
  /** The shape the answer must take; the provider validates it before returning. */
  schema: T;
  maxTokens: number;
  effort?: Effort;
  timeoutMs?: number;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  /** Tokens read from or written to the prompt cache, priced differently from fresh input. */
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface GenerateResult<T> {
  output: T;
  usage: ModelUsage;
  /** The model that actually answered, which differs from the request when a fallback ran. */
  model: string;
}

/**
 * The only way the platform talks to a language model. Roles never import an SDK; they declare a model and a schema,
 * and the task engine calls this. Implementations: the Anthropic adapter, and a fake for tests and demos.
 */
export interface ModelProvider {
  generate<T extends z.ZodType>(request: GenerateRequest<T>): Promise<GenerateResult<z.output<T>>>;
}

/** The model declined on safety grounds. Not retryable: the run becomes a work item for a person. */
export class ModelRefusalError extends Error {
  constructor(readonly category: string | null) {
    super(category ? `The model declined this request (${category}).` : 'The model declined this request.');
  }
}

/** The model answered, but not in the required shape (or ran out of tokens first). Retryable. */
export class ModelOutputError extends Error {}
