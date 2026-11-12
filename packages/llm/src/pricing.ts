import type { ModelUsage } from './types.js';

/** USD per million tokens. Cache reads are a tenth of input; cache writes (5-minute TTL) are 1.25x input. */
export interface ModelPrice {
  input: number;
  output: number;
}

/**
 * Anthropic first-party list prices (checked 2026-11-02). Kept in code so a price change is a reviewed commit; the task
 * engine uses this both to reserve a worst case before a call and to settle the real cost after it. Models a refusal
 * fallback may answer from are listed too, since the cost is settled against the model that actually answered.
 */
export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  'claude-fable-5-1': { input: 10, output: 50 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  // The fake provider is free, so tests can assert exact budgets.
  fake: { input: 0, output: 0 },
};

export const DEFAULT_MODEL = 'claude-opus-5-5';

/** Prices for models an operator configures at startup (an OpenAI-compatible endpoint), from their settings. */
const configuredPrices = new Map<string, ModelPrice>();

export function setModelPrice(model: string, price: ModelPrice): void {
  if (!(price.input >= 0 && price.output >= 0)) throw new Error(`The price for model "${model}" must not be negative.`);
  configuredPrices.set(model, price);
}

export function priceOf(model: string): ModelPrice {
  const price = MODEL_PRICES[model] ?? configuredPrices.get(model);
  // An unpriced model would silently cost nothing and slip past every spending cap, so refuse it.
  if (!price) throw new Error(`No price is known for model "${model}". Add it to MODEL_PRICES.`);
  return price;
}

/** What a finished call cost. */
export function costUsd(model: string, usage: ModelUsage): number {
  const price = priceOf(model);
  const perToken = (perMillion: number) => perMillion / 1_000_000;
  return (
    usage.inputTokens * perToken(price.input) +
    usage.cacheReadTokens * perToken(price.input * 0.1) +
    usage.cacheWriteTokens * perToken(price.input * 1.25) +
    usage.outputTokens * perToken(price.output)
  );
}

/**
 * The most a call can cost, used for the budget reservation before it is made. Input is estimated from characters
 * (about four per token, rounded up generously) and output is the full `maxTokens`, since the model may use it all.
 */
export function worstCaseUsd(model: string, promptChars: number, maxTokens: number): number {
  const price = priceOf(model);
  const inputTokens = Math.ceil(promptChars / 3);
  return (inputTokens * price.input + maxTokens * price.output) / 1_000_000;
}
