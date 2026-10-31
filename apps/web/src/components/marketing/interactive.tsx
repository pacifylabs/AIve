'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useState } from 'react';
import { Arrow } from './primitives';

/** Selected/unselected styling shared by every pill tab group. */
const tabStyle = (on: boolean) => ({ background: on ? '#111111' : 'transparent', color: on ? '#FFFFFF' : '#3A3A38' });

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Carousel that advances every 6 seconds. Visitors can pause it, and it never moves on its own for people who ask for
 * reduced motion (WCAG 2.2.2). Any manual step pauses it.
 */
export function Carousel({ label, slides, positions }: { label: string; slides: ReactNode[]; positions: number }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) setPaused(true);
  }, []);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % positions), 6000);
    return () => window.clearInterval(timer);
  }, [paused, positions]);

  const go = (next: number) => {
    setIndex((next + positions) % positions);
    setPaused(true);
  };

  return (
    <div className="stack" style={{ gap: 28 }}>
      <div className="slider" role="region" aria-roledescription="carousel" aria-label={label}>
        <div className="slides" style={{ ['--i' as string]: index }}>
          {slides.map((slide, i) => (
            <div
              key={i}
              className="slide"
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${slides.length}`}
            >
              {slide}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <div className="dots" role="group" aria-label="Choose position">
          {Array.from({ length: positions }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`dot${i === index ? ' dot-on' : ''}`}
              aria-label={`Position ${i + 1}`}
              aria-current={i === index}
              onClick={() => go(i)}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="icon-btn"
            aria-label={paused ? 'Play slides' : 'Pause slides'}
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M7 5v14l12-7z" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
              </svg>
            )}
          </button>
          <button type="button" className="icon-btn" aria-label="Previous" onClick={() => go(index - 1)}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <button type="button" className="icon-btn" aria-label="Next" onClick={() => go(index + 1)}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Pill tabs over a grey stage; each panel is rendered on the server and handed in. */
export function CapabilityTabs({
  label,
  tabs,
}: {
  label: string;
  tabs: { key: string; label: string; panel: ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.key);
  const current = tabs.find((tab) => tab.key === active) ?? tabs[0];
  return (
    <div className="stack" style={{ gap: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div className="tabs" role="group" aria-label={label}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className="tab"
              aria-pressed={tab.key === current?.key}
              onClick={() => setActive(tab.key)}
              style={tabStyle(tab.key === current?.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="demo-stage" style={{ minHeight: 360 }} aria-live="polite">
        <div key={current?.key} className="enter">
          {current?.panel}
        </div>
      </div>
    </div>
  );
}

export interface DemoStep {
  title: string;
  text: string;
  scene: ReactNode;
}

/** The "Watch a morning's work" demo: two stories, stepped through by the visitor. */
export function DemoStepper({ stories }: { stories: { key: string; label: string; steps: DemoStep[] }[] }) {
  const [storyKey, setStoryKey] = useState(stories[0]?.key);
  const [step, setStep] = useState(0);
  const story = stories.find((s) => s.key === storyKey) ?? stories[0]!;
  const last = story.steps.length - 1;
  const current = story.steps[step] ?? story.steps[0]!;

  return (
    <div className="demo">
      <div className="stack" style={{ gap: 22 }}>
        <div className="tabs" role="group" aria-label="Choose a demo" style={{ alignSelf: 'flex-start' }}>
          {stories.map((s) => (
            <button
              key={s.key}
              type="button"
              className="tab"
              aria-pressed={s.key === story.key}
              onClick={() => {
                setStoryKey(s.key);
                setStep(0);
              }}
              style={tabStyle(s.key === story.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <ol className="stack" style={{ gap: 4, listStyle: 'none', margin: 0, padding: 0 }}>
          {story.steps.map((s, i) => (
            <li key={s.title}>
              <button
                type="button"
                className="step"
                aria-current={i === step ? 'step' : undefined}
                onClick={() => setStep(i)}
                style={{
                  background: i === step ? '#FFFFFF' : 'transparent',
                  borderColor: i === step ? '#E6E6E2' : 'transparent',
                }}
              >
                <span
                  className="mono"
                  style={{ fontSize: 12, color: i === step ? '#1E7A52' : '#7C7C78', paddingTop: 3 }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="stack" style={{ gap: 3 }}>
                  <span style={{ fontSize: 15, fontWeight: 500, color: i === step ? '#111111' : '#3A3A38' }}>
                    {s.title}
                  </span>
                  <span style={{ fontSize: 13, lineHeight: 1.5, color: '#5E5E5B' }}>{s.text}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div className="stack" style={{ gap: 14 }}>
        <div className="demo-stage" aria-live="polite">
          <div key={`${story.key}-${step}`} className="stack enter" style={{ gap: 16 }}>
            {current.scene}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span className="mono small">
            Step {step + 1} of {story.steps.length}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-light btn-sm"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
            >
              Back
            </button>
            <button type="button" className="btn btn-dark btn-sm" onClick={() => setStep(step === last ? 0 : step + 1)}>
              {step === last ? 'Start again' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Safety page: one switch pauses the whole example workspace. */
export function PauseSwitch() {
  const [paused, setPaused] = useState(false);
  const rows = [
    { tile: 'tile-sm', code: 'SM', name: 'Social Media Staff' },
    { tile: 'tile-sl', code: 'SL', name: 'Sales Manager Staff' },
  ];
  return (
    <div className="card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <div className="stack" style={{ gap: 2 }}>
          <span id="pause-label" style={{ fontSize: 16, fontWeight: 500 }}>
            Northfield Studio workspace
          </span>
          <span className="small">
            {paused ? 'Paused by you · nothing will be sent' : 'Running · 4 drafts waiting for you'}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!paused}
          aria-labelledby="pause-label"
          onClick={() => setPaused((value) => !value)}
          className="switch"
          style={{ background: paused ? '#B4B4AE' : '#1E7A52' }}
        >
          <span className="knob" style={{ left: paused ? 4 : 32 }} />
        </button>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        {rows.map((row) => (
          <div
            key={row.code}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 14px',
              borderRadius: 12,
              background: '#F6F6F4',
            }}
          >
            <span style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}>
              <span className={`tile ${row.tile}`} aria-hidden="true">
                {row.code}
              </span>
              {row.name}
            </span>
            <span className={`badge ${paused ? 'b-grey' : 'b-ok'}`}>{paused ? 'Paused' : 'Working'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Pricing page: two questions point to a plan. */
export function PlanPicker() {
  const [role, setRole] = useState<'social' | 'sales' | 'both'>('both');
  const [acts, setActs] = useState(true);
  const plan =
    role === 'both'
      ? { name: 'Team', why: 'Both roles at Manager level, passing leads to each other, under one cap.' }
      : acts
        ? { name: 'Manager', why: 'One role that can earn the right to act on its own.' }
        : { name: 'Assistant', why: 'One role that drafts everything for your approval.' };
  return (
    <div className="stack" style={{ gap: 28 }}>
      <div className="grid2" style={{ gap: 28 }}>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ marginBottom: 10 }}>Which staff?</legend>
          <div className="tabs" role="group" aria-label="Which staff" style={{ flexWrap: 'wrap' }}>
            {(
              [
                ['social', 'Social Media'],
                ['sales', 'Sales Manager'],
                ['both', 'Both'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className="tab"
                aria-pressed={role === key}
                onClick={() => setRole(key)}
                style={tabStyle(role === key)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ marginBottom: 10 }}>Should it ever act on its own?</legend>
          <div className="tabs" role="group" aria-label="Autonomy" style={{ flexWrap: 'wrap' }}>
            <button
              type="button"
              className="tab"
              aria-pressed={acts}
              onClick={() => setActs(true)}
              style={tabStyle(acts)}
            >
              Yes, once it&apos;s earned it
            </button>
            <button
              type="button"
              className="tab"
              aria-pressed={!acts}
              onClick={() => setActs(false)}
              style={tabStyle(!acts)}
            >
              No, I approve everything
            </button>
          </div>
        </fieldset>
      </div>
      <div
        aria-live="polite"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 20,
          flexWrap: 'wrap',
          background: '#111111',
          color: '#FFFFFF',
          borderRadius: 16,
          padding: '22px 24px',
        }}
      >
        <div className="stack" style={{ gap: 4 }}>
          <span className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', color: '#BFE3CF' }}>
            YOUR PLAN
          </span>
          <span style={{ fontSize: 22, fontWeight: 500 }}>{plan.name}</span>
          <span style={{ fontSize: 14, color: '#C9C9C4' }}>{plan.why}</span>
        </div>
        <Link href={`/early-access?role=${role}`} className="btn btn-white btn-xl">
          Join early access <Arrow />
        </Link>
      </div>
    </div>
  );
}
