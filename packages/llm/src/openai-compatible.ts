import { z } from 'zod';
import { type ModelPrice, setModelPrice } from './pricing.js';
import {
  type GenerateRequest,
  type GenerateResult,
  ModelOutputError,
  type ModelProvider,
  ModelRefusalError,
} from './types.js';

export interface OpenAiCompatibleOptions {
  /** Read from the typed config module by the caller; never from process.env here. */
  apiKey: string;
  /** The Chat Completions base, e.g. https://api.openai.com/v1 or https://api.groq.com/openai/v1. */
  baseUrl: string;
  /** Answers every task, whatever model the role asked for: roles name Claude models this endpoint does not serve. */
  model: string;
  /** USD per million tokens. Registered so spending caps still hold; 0 for a free key. */
  price: ModelPrice;
  /** Swappable for tests. */
  fetch?: typeof fetch;
}

interface ChatResponse {
  model?: string;
  choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
}

/**
 * Any OpenAI-compatible Chat Completions endpoint: OpenAI, Groq, Google Gemini, OpenRouter, Ollama and the like.
 *
 * It asks for a JSON object (the widest-supported structured mode), puts the JSON Schema in the system prompt, and
 * validates the answer with the request's zod schema, so a provider that ignores the schema still cannot slip a wrong
 * shape past us. Effort is not sent: these endpoints have no common equivalent.
 */
export class OpenAiCompatibleProvider implements ModelProvider {
  private readonly fetch: typeof fetch;
  private readonly url: string;

  constructor(private readonly options: OpenAiCompatibleOptions) {
    this.fetch = options.fetch ?? fetch;
    this.url = `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    setModelPrice(options.model, options.price);
  }

  async generate<T extends z.ZodType>(request: GenerateRequest<T>): Promise<GenerateResult<z.output<T>>> {
    const schema = JSON.stringify(z.toJSONSchema(request.schema));
    const response = await this.fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.options.apiKey}` },
      body: JSON.stringify({
        model: this.options.model,
        max_tokens: request.maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `${request.system}\n\nAnswer with one JSON object that matches this JSON Schema, and nothing else:\n${schema}`,
          },
          { role: 'user', content: request.user },
        ],
      }),
      signal: AbortSignal.timeout(request.timeoutMs ?? 60_000),
    });
    if (!response.ok) {
      // The body names the cause (bad key, unknown model, rate limit); the key itself is never in it.
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      throw new Error(`The model endpoint answered ${response.status}: ${detail}`);
    }

    const body = (await response.json()) as ChatResponse;
    const choice = body.choices?.[0];
    if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') throw new ModelRefusalError(null);
    if (choice?.finish_reason === 'length') {
      throw new ModelOutputError(`The answer was cut off at ${request.maxTokens} tokens.`);
    }

    const parsed = request.schema.safeParse(parseJson(choice?.message?.content));
    if (!parsed.success) throw new ModelOutputError('The answer did not match the required shape.');

    const cached = body.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    return {
      output: parsed.data,
      // The configured name, not the endpoint's (which may add a date suffix), so the registered price applies.
      model: this.options.model,
      usage: {
        inputTokens: (body.usage?.prompt_tokens ?? 0) - cached,
        outputTokens: body.usage?.completion_tokens ?? 0,
        cacheReadTokens: cached,
        cacheWriteTokens: 0,
      },
    };
  }
}

/** Models sometimes wrap JSON in a code fence even in JSON mode. */
function parseJson(content: string | null | undefined): unknown {
  if (!content) return undefined;
  const text = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
