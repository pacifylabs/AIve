import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FakeModelProvider } from './fake.js';
import { costUsd, priceOf, worstCaseUsd } from './pricing.js';
import { ModelOutputError } from './types.js';

describe('pricing', () => {
  it('prices input, cache and output tokens separately', () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 0 };
    // Opus 5.5: $4 input, $20 output, cache reads at a tenth of input.
    expect(costUsd('claude-opus-5-5', usage)).toBeCloseTo(4 + 20 + 0.4, 6);
  });

  it('reserves at least what the call can cost', () => {
    const worst = worstCaseUsd('claude-opus-5-5', 4_000, 1_000);
    const actual = costUsd('claude-opus-5-5', {
      inputTokens: 1_000,
      outputTokens: 1_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    expect(worst).toBeGreaterThanOrEqual(actual);
  });

  it('refuses a model with no known price, so it cannot slip past spending caps', () => {
    expect(() => priceOf('claude-unknown')).toThrow(/No price/);
  });
});

describe('FakeModelProvider', () => {
  const schema = z.object({ subject: z.string() });
  const request = { model: 'fake', system: 's', user: 'u', schema, maxTokens: 100 };

  it('returns validated output and records the call', async () => {
    const fake = new FakeModelProvider(() => ({ output: { subject: 'Hello' } }));
    await expect(fake.generate(request)).resolves.toMatchObject({ output: { subject: 'Hello' }, model: 'fake' });
    expect(fake.calls).toHaveLength(1);
  });

  it('rejects a reply that does not match the schema, and throws scripted errors', async () => {
    await expect(new FakeModelProvider(() => ({ output: { wrong: 1 } })).generate(request)).rejects.toThrow(
      ModelOutputError,
    );
    await expect(new FakeModelProvider(() => ({ error: new Error('timeout') })).generate(request)).rejects.toThrow(
      'timeout',
    );
  });
});
