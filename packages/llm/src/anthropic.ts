import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import {
  type GenerateRequest,
  type GenerateResult,
  ModelOutputError,
  type ModelProvider,
  ModelRefusalError,
} from './types.js';

export interface AnthropicProviderOptions {
  /** Read from the typed config module by the caller; never from process.env here. */
  apiKey: string;
  /** SDK-level retries for 408/409/429/5xx and connection errors. Task-level retries sit above this. */
  maxRetries?: number;
}

/**
 * Calls Claude and returns output validated against the request's zod schema.
 *
 * Structured outputs (`output_config.format`) replace the forced tool call KudiBooks used: current models reject
 * `tool_choice: { type: 'tool' }`, while structured outputs constrain the answer to the schema directly.
 *
 * Server-side fallbacks are on: if the requested model declines on safety grounds, the API re-runs the same request on
 * a fallback model it picks by refusal category, inside the same call. A refusal only reaches us when every model
 * declined, and `response.model` then says which model answered.
 */
export class AnthropicProvider implements ModelProvider {
  private readonly client: Anthropic;

  constructor(options: AnthropicProviderOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey, maxRetries: options.maxRetries ?? 2 });
  }

  async generate<T extends z.ZodType>(request: GenerateRequest<T>): Promise<GenerateResult<z.output<T>>> {
    const response = await this.client.beta.messages.parse(
      {
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        model: request.model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: [{ role: 'user', content: request.user }],
        output_config: {
          format: betaZodOutputFormat(request.schema),
          ...(request.effort ? { effort: request.effort } : {}),
        },
      },
      { timeout: request.timeoutMs ?? 60_000 },
    );

    if (response.stop_reason === 'refusal') throw new ModelRefusalError(response.stop_details?.category ?? null);
    if (response.stop_reason === 'max_tokens') {
      throw new ModelOutputError(`The answer was cut off at ${request.maxTokens} tokens.`);
    }
    if (response.parsed_output === null || response.parsed_output === undefined) {
      throw new ModelOutputError('The answer did not match the required shape.');
    }

    return {
      output: response.parsed_output as z.output<T>,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      },
    };
  }
}
