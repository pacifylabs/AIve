'use client';

import { useEffect, useId, useState } from 'react';
import { presetFor, VOICE_PRESETS, type VoicePreset } from '@/lib/voice-presets';

const CUSTOM = 'custom';

/**
 * "How you sound" as a list to choose from, each with a sample to hear, plus a box for anything else. The chosen
 * description is what is saved and what staff read. The sample is read by the browser's own voice: it lets a person
 * hear the wording, not a voice the staff will use.
 */
export function VoicePicker({
  name,
  defaultValue,
  disabled,
  error,
}: {
  name: string;
  defaultValue: string;
  disabled?: boolean;
  error?: string;
}) {
  const id = useId();
  const initial = presetFor(defaultValue);
  const [choice, setChoice] = useState(initial?.id ?? (defaultValue.trim() ? CUSTOM : VOICE_PRESETS[0]!.id));
  const [custom, setCustom] = useState(initial ? '' : defaultValue);
  const [playing, setPlaying] = useState<string | null>(null);
  // Known only in the browser; until then the play buttons are left out rather than shown and broken.
  const [canSpeak, setCanSpeak] = useState(false);

  useEffect(() => {
    setCanSpeak(typeof window !== 'undefined' && 'speechSynthesis' in window);
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);

  const value = choice === CUSTOM ? custom : (VOICE_PRESETS.find((preset) => preset.id === choice)?.voice ?? '');

  function play(preset: VoicePreset) {
    const synth = window.speechSynthesis;
    synth.cancel();
    if (playing === preset.id) {
      setPlaying(null);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(preset.sample);
    utterance.rate = preset.rate;
    utterance.pitch = preset.pitch;
    utterance.onend = () => setPlaying((current) => (current === preset.id ? null : current));
    utterance.onerror = () => setPlaying(null);
    setPlaying(preset.id);
    synth.speak(utterance);
  }

  return (
    <fieldset className="space-y-2" aria-describedby={error ? `${id}-error` : `${id}-hint`}>
      <legend className="text-sm font-medium">How you sound</legend>
      <p id={`${id}-hint`} className="text-xs text-muted">
        Pick the voice your staff write in.{canSpeak ? ' Press play to hear a line in that style.' : ''}
      </p>
      <input type="hidden" name={name} value={value} />
      <div className="grid gap-2">
        {VOICE_PRESETS.map((preset) => {
          const selected = choice === preset.id;
          return (
            <div
              key={preset.id}
              className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${
                selected ? 'border-accent bg-accent-soft' : 'border-line-soft'
              }`}
            >
              <input
                type="radio"
                id={`${id}-${preset.id}`}
                name={`${id}-voice`}
                checked={selected}
                disabled={disabled}
                onChange={() => setChoice(preset.id)}
                className="mt-1"
              />
              <label htmlFor={`${id}-${preset.id}`} className="min-w-0 flex-1 cursor-pointer">
                <span className="block font-medium">{preset.label}</span>
                <span className="block text-xs text-muted">“{preset.sample}”</span>
              </label>
              {canSpeak ? (
                <button
                  type="button"
                  onClick={() => play(preset)}
                  className="btn btn-sm shrink-0"
                  aria-label={`${playing === preset.id ? 'Stop' : 'Play'} the ${preset.label.toLowerCase()} sample`}
                  aria-pressed={playing === preset.id}
                >
                  {playing === preset.id ? 'Stop' : 'Play'}
                </button>
              ) : null}
            </div>
          );
        })}
        <div
          className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${
            choice === CUSTOM ? 'border-accent bg-accent-soft' : 'border-line-soft'
          }`}
        >
          <input
            type="radio"
            id={`${id}-custom`}
            name={`${id}-voice`}
            checked={choice === CUSTOM}
            disabled={disabled}
            onChange={() => setChoice(CUSTOM)}
            className="mt-1"
          />
          <div className="min-w-0 flex-1 space-y-2">
            <label htmlFor={`${id}-custom`} className="block cursor-pointer font-medium">
              Something else
            </label>
            {choice === CUSTOM ? (
              <textarea
                aria-label="Describe how you sound"
                rows={2}
                value={custom}
                disabled={disabled}
                onChange={(event) => setCustom(event.target.value)}
                placeholder="For example: plain and friendly, no jargon."
                className="field"
              />
            ) : null}
          </div>
        </div>
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
