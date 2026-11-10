import { describe, expect, it } from 'vitest';
import { postLength } from './post-length';

describe('postLength', () => {
  it('counts plain text', () => {
    expect(postLength('')).toBe(0);
    expect(postLength('Hello')).toBe(5);
  });

  it('counts an emoji or an accented letter as one character', () => {
    expect(postLength('👍🏽')).toBe(1);
    expect(postLength('café')).toBe(4);
    expect(postLength('é')).toBe(1);
  });
});
