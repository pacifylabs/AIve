import { AnthropicProvider } from './anthropic.js';
import { OpenAiCompatibleProvider } from './openai-compatible.js';
import type { ModelProvider } from './types.js';

export type ModelService = 'anthropic' | 'openai' | 'groq' | 'gemini' | 'openrouter' | 'ollama';

/** The model settings from the typed config module (the names match its keys). */
export interface ModelSettings {
  LLM_PROVIDER: ModelService;
  ANTHROPIC_API_KEY?: string | undefined;
  OPENAI_API_KEY?: string | undefined;
  OPENAI_BASE_URL?: string | undefined;
  OPENAI_MODEL?: string | undefined;
  GROQ_API_KEY?: string | undefined;
  GROQ_MODEL?: string | undefined;
  GEMINI_API_KEY?: string | undefined;
  GEMINI_MODEL?: string | undefined;
  OPENROUTER_API_KEY?: string | undefined;
  OPENROUTER_MODEL?: string | undefined;
  OLLAMA_BASE_URL?: string | undefined;
  OLLAMA_MODEL?: string | undefined;
  LLM_INPUT_USD_PER_MTOK?: number | undefined;
  LLM_OUTPUT_USD_PER_MTOK?: number | undefined;
}

interface Endpoint {
  /** The setting to name when something is missing. */
  key: string;
  apiKey: string | undefined;
  baseUrl: string;
  model: string | undefined;
}

/**
 * Where each OpenAI-compatible service lives and which model it uses unless told otherwise. The free services get a
 * default model (checked against each one's model list in November 2026); OpenAI and Ollama do not, since one is paid
 * and the other serves whatever was pulled.
 */
function endpointFor(service: Exclude<ModelService, 'anthropic'>, s: ModelSettings): Endpoint {
  switch (service) {
    case 'openai':
      return {
        key: 'OPENAI_API_KEY or OPENAI_MODEL',
        apiKey: s.OPENAI_API_KEY,
        baseUrl: s.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
        model: s.OPENAI_MODEL,
      };
    case 'groq':
      return {
        key: 'GROQ_API_KEY',
        apiKey: s.GROQ_API_KEY,
        baseUrl: 'https://api.groq.com/openai/v1',
        model: s.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
      };
    case 'gemini':
      return {
        key: 'GEMINI_API_KEY',
        apiKey: s.GEMINI_API_KEY,
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: s.GEMINI_MODEL ?? 'gemini-3.1-flash-lite',
      };
    case 'openrouter':
      return {
        key: 'OPENROUTER_API_KEY',
        apiKey: s.OPENROUTER_API_KEY,
        baseUrl: 'https://openrouter.ai/api/v1',
        // OpenRouter's router across its free models.
        model: s.OPENROUTER_MODEL ?? 'openrouter/free',
      };
    case 'ollama':
      // Ollama ignores the key, but the request still needs one.
      return {
        key: 'OLLAMA_MODEL',
        apiKey: 'ollama',
        baseUrl: s.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1',
        model: s.OLLAMA_MODEL,
      };
  }
}

/** Without a key, every model call fails with a message an operator can act on, instead of doing nothing. */
const notConfigured = (setting: string): ModelProvider => ({
  generate: () => Promise.reject(new Error(`${setting} is not set, so staff cannot call a model.`)),
});

/** Picks the model service from LLM_PROVIDER. Config validation already required the settings each one needs. */
export function selectModelProvider(settings: ModelSettings): ModelProvider {
  const service = settings.LLM_PROVIDER;
  if (service === 'anthropic') {
    return settings.ANTHROPIC_API_KEY
      ? new AnthropicProvider({ apiKey: settings.ANTHROPIC_API_KEY })
      : notConfigured('ANTHROPIC_API_KEY');
  }

  const endpoint = endpointFor(service, settings);
  if (!endpoint.apiKey || !endpoint.model) return notConfigured(endpoint.key);
  return new OpenAiCompatibleProvider({
    apiKey: endpoint.apiKey,
    baseUrl: endpoint.baseUrl,
    model: endpoint.model,
    // Free tiers cost nothing; config validation requires both prices for OpenAI.
    price: { input: settings.LLM_INPUT_USD_PER_MTOK ?? 0, output: settings.LLM_OUTPUT_USD_PER_MTOK ?? 0 },
  });
}
