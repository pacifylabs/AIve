/**
 * Ready-made ways a company can sound. `voice` is what is saved on the profile and what staff read when they write;
 * `sample` is a line in that voice for the person to hear before choosing. `rate` and `pitch` only shape how the
 * browser reads the sample aloud.
 */
export interface VoicePreset {
  id: string;
  label: string;
  voice: string;
  sample: string;
  rate: number;
  pitch: number;
}

export const VOICE_PRESETS: readonly VoicePreset[] = [
  {
    id: 'friendly',
    label: 'Friendly and plain',
    voice: 'Friendly and plain. Short sentences, everyday words, no jargon. Warm, like talking to a neighbour.',
    sample: 'Hi there! We made this to save you time. Have a look, and tell us what you think.',
    rate: 1,
    pitch: 1.1,
  },
  {
    id: 'professional',
    label: 'Professional and clear',
    voice: 'Professional and clear. Precise, confident and polite. Facts first, no slang, no exclamation marks.',
    sample: 'Our service helps teams finish routine work faster. Here is how it works, and what it costs to start.',
    rate: 0.95,
    pitch: 1,
  },
  {
    id: 'bold',
    label: 'Bold and energetic',
    voice: 'Bold and energetic. Punchy lines, strong verbs and a clear call to action. Upbeat without hype.',
    sample: 'Stop waiting. Start doing. Your next big step is one click away, so take it today.',
    rate: 1.1,
    pitch: 1.15,
  },
  {
    id: 'calm',
    label: 'Calm and reassuring',
    voice: 'Calm and reassuring. Gentle, patient and supportive. Explain things simply and never rush the reader.',
    sample: 'Take your time. There is no rush, and we are here to help whenever you are ready.',
    rate: 0.9,
    pitch: 0.95,
  },
  {
    id: 'playful',
    label: 'Playful and witty',
    voice: 'Playful and witty. Light humour and a little cheek, but always kind. Never at anyone’s expense.',
    sample: 'Your to-do list called. It says it misses you less already. Let us handle the boring bits.',
    rate: 1.05,
    pitch: 1.2,
  },
  {
    id: 'expert',
    label: 'Expert and helpful',
    voice: 'Expert and helpful. Teach as you go: practical tips, clear steps and the reason behind each one.',
    sample: 'Here is a quick tip: put your best work first. Most people decide within the first few seconds.',
    rate: 0.97,
    pitch: 1,
  },
];

/** The preset a saved voice came from, or null when the person wrote their own. */
export function presetFor(voice: string | null | undefined): VoicePreset | null {
  const text = voice?.trim();
  if (!text) return null;
  return VOICE_PRESETS.find((preset) => preset.voice === text) ?? null;
}
