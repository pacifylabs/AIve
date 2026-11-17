import { describe, expect, it } from 'vitest';
import { draftFromArticle } from './draft-from-article.js';
import { draftPost } from './draft-post.js';
import { repurposePost } from './repurpose-post.js';

describe('drafting tasks', () => {
  it('leave room for a post that fills every field, so a long draft is never cut off', () => {
    const longest = JSON.stringify({
      body: 'b'.repeat(5000),
      hashtags: Array.from({ length: 10 }, () => '#hashtag'),
      firstComment: 'c'.repeat(1000),
      reply1: 'r'.repeat(1500),
      reply2: 'r'.repeat(1500),
      reply3: 'r'.repeat(1500),
    });
    for (const task of [draftPost, draftFromArticle, repurposePost]) {
      expect(task.model!.maxTokens, task.type).toBeGreaterThanOrEqual(Math.ceil(longest.length / 3));
    }
  });
});
