import { describe, expect, it } from 'vitest';
import { API_TIMEOUT_MS, apiBaseUrl } from './api-config';

describe('apiBaseUrl', () => {
  it('uses API_URL without a trailing slash', () => {
    expect(apiBaseUrl({ API_URL: 'https://api.example.com/' })).toBe('https://api.example.com');
  });

  it('falls back to the local API on a developer machine', () => {
    expect(apiBaseUrl({})).toBe('http://localhost:3100');
  });

  it('refuses to guess on a deployed build that has no API_URL', () => {
    expect(() => apiBaseUrl({ VERCEL: '1' })).toThrow(/API_URL is not set/);
    expect(() => apiBaseUrl({ VERCEL: '1', API_URL: '  ' })).toThrow(/API_URL is not set/);
  });
});

describe('API_TIMEOUT_MS', () => {
  it('outlasts a sleeping API waking up (about 60 seconds at worst)', () => {
    expect(API_TIMEOUT_MS).toBeGreaterThan(60_000);
  });
});
