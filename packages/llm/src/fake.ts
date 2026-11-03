import type { z } from 'zod';
import { type GenerateRequest, type GenerateResult, ModelOutputError, type ModelProvider } from './types.js';

/** A scripted reply: either an output object, or an error to throw (to test retries, refusals and timeouts). */
export type FakeReply = { output: unknown } | { error: Error };

/**
 * Deterministic stand-in for a real model, for tests and the demo workspace. Replies are matched to requests by a
 * function you supply, so a test can answer differently per task. Every call is recorded for assertions.
 */
export class FakeModelProvider implements ModelProvider {
  readonly calls: GenerateRequest<z.ZodType>[] = [];

  constructor(private readonly reply: (request: GenerateRequest<z.ZodType>) => FakeReply) {}

  async generate<T extends z.ZodType>(request: GenerateRequest<T>): Promise<GenerateResult<z.output<T>>> {
    this.calls.push(request);
    const answer = this.reply(request);
    if ('error' in answer) throw answer.error;
    const parsed = request.schema.safeParse(answer.output);
    if (!parsed.success) throw new ModelOutputError(`The fake reply did not match the schema: ${parsed.error.message}`);
    return {
      output: parsed.data,
      model: 'fake',
      usage: {
        inputTokens: Math.ceil((request.system.length + request.user.length) / 4),
        outputTokens: Math.ceil(JSON.stringify(parsed.data).length / 4),
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    };
  }
}
