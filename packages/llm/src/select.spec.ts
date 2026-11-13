import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AnthropicProvider } from './anthropic.js';
import { type ModelSettings, selectModelProvider } from './select.js';

const request = { model: 'claude-haiku-5-5', system: 's', user: 'u', schema: z.object({}), maxTokens: 10 };

/** Calls the selected provider against a stand-in endpoint and reports where it went and with what. */
async function callThrough(settings: ModelSettings) {
  const sent: { url: string; body: { model: string }; auth: string }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    sent.push({
      url,
      body: JSON.parse(init.body as string),
      auth: (init.headers as Record<string, string>).authorization!,
    });
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{}' } }] }));
  });
  await selectModelProvider(settings).generate(request);
  return sent[0]!;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('selectModelProvider', () => {
  it('uses Claude by default when its key is set', () => {
    expect(selectModelProvider({ LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' })).toBeInstanceOf(
      AnthropicProvider,
    );
  });

  it.each([
    ['groq', { GROQ_API_KEY: 'g' }, 'https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile', 'g'],
    [
      'gemini',
      { GEMINI_API_KEY: 'm' },
      'https://generativelanguage.googleapis.com/v1beta/openai',
      'gemini-3.1-flash-lite',
      'm',
    ],
    ['openrouter', { OPENROUTER_API_KEY: 'r' }, 'https://openrouter.ai/api/v1', 'openrouter/free', 'r'],
    ['ollama', { OLLAMA_MODEL: 'llama3.2' }, 'http://localhost:11434/v1', 'llama3.2', 'ollama'],
    [
      'openai',
      { OPENAI_API_KEY: 'o', OPENAI_MODEL: 'gpt-x', OPENAI_BASE_URL: 'https://api.openai.com/v1' },
      'https://api.openai.com/v1',
      'gpt-x',
      'o',
    ],
  ] as const)('sends %s calls to its endpoint with its key and model', async (service, keys, url, model, key) => {
    const sent = await callThrough({ LLM_PROVIDER: service, ANTHROPIC_API_KEY: 'ignored', ...keys });
    expect(sent.url).toBe(`${url}/chat/completions`);
    expect(sent.body.model).toBe(model);
    expect(sent.auth).toBe(`Bearer ${key}`);
  });

  it('keeps every key set at once, so LLM_PROVIDER alone switches between services', async () => {
    const all = { GROQ_API_KEY: 'g', GEMINI_API_KEY: 'm', OPENROUTER_API_KEY: 'r' };
    expect((await callThrough({ ...all, LLM_PROVIDER: 'gemini' })).auth).toBe('Bearer m');
    expect((await callThrough({ ...all, LLM_PROVIDER: 'openrouter' })).auth).toBe('Bearer r');
  });

  it('uses a model override instead of the default', async () => {
    const sent = await callThrough({ LLM_PROVIDER: 'groq', GROQ_API_KEY: 'g', GROQ_MODEL: 'openai/gpt-oss-120b' });
    expect(sent.body.model).toBe('openai/gpt-oss-120b');
  });

  it('fails every call by naming the missing setting', async () => {
    await expect(selectModelProvider({ LLM_PROVIDER: 'anthropic' }).generate(request)).rejects.toThrow(
      'ANTHROPIC_API_KEY is not set',
    );
    await expect(selectModelProvider({ LLM_PROVIDER: 'groq' }).generate(request)).rejects.toThrow(
      'GROQ_API_KEY is not set',
    );
  });
});
