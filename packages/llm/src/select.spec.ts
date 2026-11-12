import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AnthropicProvider } from './anthropic.js';
import { OpenAiCompatibleProvider } from './openai-compatible.js';
import { selectModelProvider } from './select.js';

const base = { OPENAI_BASE_URL: 'https://api.openai.com/v1' };
const request = { model: 'claude-haiku-5-5', system: 's', user: 'u', schema: z.object({}), maxTokens: 10 };

describe('selectModelProvider', () => {
  it('uses Claude by default when its key is set', () => {
    expect(selectModelProvider({ ...base, LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' })).toBeInstanceOf(
      AnthropicProvider,
    );
  });

  it('switches to the OpenAI-compatible endpoint', () => {
    const provider = selectModelProvider({
      ...base,
      LLM_PROVIDER: 'openai',
      ANTHROPIC_API_KEY: 'ignored',
      OPENAI_API_KEY: 'sk-test',
      OPENAI_MODEL: 'gpt-4o-mini',
      OPENAI_INPUT_USD_PER_MTOK: 0.15,
      OPENAI_OUTPUT_USD_PER_MTOK: 0.6,
    });
    expect(provider).toBeInstanceOf(OpenAiCompatibleProvider);
  });

  it('fails every call by naming the missing key', async () => {
    await expect(selectModelProvider({ ...base, LLM_PROVIDER: 'anthropic' }).generate(request)).rejects.toThrow(
      'ANTHROPIC_API_KEY is not set',
    );
  });
});
