import { AnthropicProvider } from './anthropic.js';
import { OpenAiCompatibleProvider } from './openai-compatible.js';
import type { ModelProvider } from './types.js';

/** The model settings from the typed config module (the names match its keys). */
export interface ModelSettings {
  LLM_PROVIDER: 'anthropic' | 'openai';
  ANTHROPIC_API_KEY?: string | undefined;
  OPENAI_API_KEY?: string | undefined;
  OPENAI_BASE_URL: string;
  OPENAI_MODEL?: string | undefined;
  OPENAI_INPUT_USD_PER_MTOK?: number | undefined;
  OPENAI_OUTPUT_USD_PER_MTOK?: number | undefined;
}

/** Without a key, every model call fails with a message an operator can act on, instead of doing nothing. */
const notConfigured = (setting: string): ModelProvider => ({
  generate: () => Promise.reject(new Error(`${setting} is not set, so staff cannot call a model.`)),
});

/** Picks the model service from LLM_PROVIDER. Config validation already required the OpenAI settings it needs. */
export function selectModelProvider(settings: ModelSettings): ModelProvider {
  if (settings.LLM_PROVIDER === 'openai') {
    if (!settings.OPENAI_API_KEY || !settings.OPENAI_MODEL) return notConfigured('OPENAI_API_KEY or OPENAI_MODEL');
    return new OpenAiCompatibleProvider({
      apiKey: settings.OPENAI_API_KEY,
      baseUrl: settings.OPENAI_BASE_URL,
      model: settings.OPENAI_MODEL,
      price: { input: settings.OPENAI_INPUT_USD_PER_MTOK ?? 0, output: settings.OPENAI_OUTPUT_USD_PER_MTOK ?? 0 },
    });
  }
  return settings.ANTHROPIC_API_KEY
    ? new AnthropicProvider({ apiKey: settings.ANTHROPIC_API_KEY })
    : notConfigured('ANTHROPIC_API_KEY');
}
