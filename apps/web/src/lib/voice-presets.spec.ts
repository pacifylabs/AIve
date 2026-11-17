import { describe, expect, it } from 'vitest';
import { presetFor, VOICE_PRESETS } from './voice-presets';

describe('voice presets', () => {
  it('have unique ids and a sample short enough to listen to', () => {
    expect(new Set(VOICE_PRESETS.map((preset) => preset.id)).size).toBe(VOICE_PRESETS.length);
    for (const preset of VOICE_PRESETS) {
      expect(preset.sample.length).toBeGreaterThan(20);
      expect(preset.sample.length).toBeLessThanOrEqual(220);
      // The saved text is what staff read, so it must fit the profile field.
      expect(preset.voice.length).toBeLessThanOrEqual(300);
    }
  });

  it('finds the preset a saved voice came from, so the list shows it chosen', () => {
    const friendly = VOICE_PRESETS[0]!;
    expect(presetFor(friendly.voice)?.id).toBe(friendly.id);
    expect(presetFor(`  ${friendly.voice}  `)?.id).toBe(friendly.id);
  });

  it('treats anything else as the person’s own description', () => {
    expect(presetFor('Like a pirate, but polite.')).toBeNull();
    expect(presetFor('')).toBeNull();
    expect(presetFor(null)).toBeNull();
  });
});
