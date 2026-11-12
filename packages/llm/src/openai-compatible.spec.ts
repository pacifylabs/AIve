import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { OpenAiCompatibleProvider } from './openai-compatible.js';
import { costUsd, priceOf } from './pricing.js';
import { ModelOutputError, ModelRefusalError } from './types.js';

const schema = z.object({ subject: z.string() });
const request = { model: 'claude-haiku-5-5', system: 'Rules.', user: 'Task.', schema, maxTokens: 200 };

/** A stand-in endpoint that records what it was sent and answers with the given body and status. */
function endpoint(body: unknown, status = 200) {
  const sent: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, sent };
}

const reply = (content: string | null, extra: Record<string, unknown> = {}) => ({
  choices: [{ finish_reason: 'stop', message: { content }, ...extra }],
  usage: { prompt_tokens: 120, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 20 } },
});

function provider(fetch: typeof globalThis.fetch, price = { input: 0, output: 0 }) {
  return new OpenAiCompatibleProvider({
    apiKey: 'test-key',
    baseUrl: 'https://llm.example.com/v1/',
    model: 'test-model',
    price,
    fetch,
  });
}

describe('OpenAiCompatibleProvider', () => {
  it('sends the configured model in JSON mode and returns validated output', async () => {
    const { fetch, sent } = endpoint(reply('{"subject":"Hello"}'));
    const result = await provider(fetch).generate(request);

    expect(result).toEqual({
      output: { subject: 'Hello' },
      model: 'test-model',
      usage: { inputTokens: 100, outputTokens: 30, cacheReadTokens: 20, cacheWriteTokens: 0 },
    });
    expect(sent[0]!.url).toBe('https://llm.example.com/v1/chat/completions');
    const body = JSON.parse(sent[0]!.init.body as string);
    // The role asked for a Claude model; the endpoint is sent the one it serves.
    expect(body.model).toBe('test-model');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0].content).toContain('"subject"');
    expect((sent[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer test-key');
  });

  it('accepts JSON wrapped in a code fence', async () => {
    const { fetch } = endpoint(reply('```json\n{"subject":"Hi"}\n```'));
    await expect(provider(fetch).generate(request)).resolves.toMatchObject({ output: { subject: 'Hi' } });
  });

  it('rejects an answer in the wrong shape or not JSON at all', async () => {
    await expect(provider(endpoint(reply('{"title":"x"}')).fetch).generate(request)).rejects.toThrow(ModelOutputError);
    await expect(provider(endpoint(reply('Sure! Here it is.')).fetch).generate(request)).rejects.toThrow(
      ModelOutputError,
    );
  });

  it('reports a cut-off answer and a refusal as the platform errors', async () => {
    const cut = reply('{"subj');
    cut.choices[0]!.finish_reason = 'length';
    await expect(provider(endpoint(cut).fetch).generate(request)).rejects.toThrow(/cut off at 200 tokens/);
    await expect(
      provider(endpoint(reply(null, { message: { content: null, refusal: 'No.' } })).fetch).generate(request),
    ).rejects.toThrow(ModelRefusalError);
  });

  it('fails loudly with the status when the endpoint rejects the call', async () => {
    const { fetch } = endpoint({ error: { message: 'Invalid API key' } }, 401);
    await expect(provider(fetch).generate(request)).rejects.toThrow(/answered 401: .*Invalid API key/);
  });

  it('registers the configured price, so spending caps apply to the model', () => {
    provider(endpoint(reply('{}')).fetch, { input: 1, output: 2 });
    expect(priceOf('test-model')).toEqual({ input: 1, output: 2 });
    const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 };
    expect(costUsd('test-model', usage)).toBeCloseTo(3, 6);
  });

  it('refuses a negative price', () => {
    expect(() => provider(endpoint(reply('{}')).fetch, { input: -1, output: 0 })).toThrow(/must not be negative/);
  });
});
