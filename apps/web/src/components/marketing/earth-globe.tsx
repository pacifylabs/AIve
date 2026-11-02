'use client';

import { useEffect, useRef, useState } from 'react';
import type { GlobeInstance } from 'globe.gl';
import { readTheme, type Theme, watchTheme } from './theme';

/** The example cities named on the activity cards around the globe. */
const CITIES = [
  { name: 'Toronto', lat: 43.65, lng: -79.38, tone: 'accent' },
  { name: 'London', lat: 51.51, lng: -0.13, tone: 'accent' },
  { name: 'Lagos', lat: 6.52, lng: 3.38, tone: 'accent' },
  { name: 'Singapore', lat: 1.35, lng: 103.82, tone: 'amber' },
] as const;

const ARCS = [
  { from: CITIES[0], to: CITIES[1] },
  { from: CITIES[1], to: CITIES[2] },
  { from: CITIES[2], to: CITIES[3] },
];

const PALETTE: Record<Theme, { image: string; atmosphere: string; accent: string; amber: string }> = {
  light: { image: '/earth/earth-day-2048.jpg', atmosphere: '#2563EB', accent: '#5B8CFF', amber: '#E8A23A' },
  dark: { image: '/earth/earth-night-2048.jpg', atmosphere: '#6EA2FF', accent: '#8DB6FF', amber: '#F2B860' },
};

/*
 * Camera distance that makes the 3D Earth the same size as the CSS fallback disc (83% of the box): globe.gl's camera
 * has a 50° field of view and a globe radius of 100, so altitude = 1 / sin(atan(0.833 * tan 25°)) - 1.
 */
const ALTITUDE = 1.77;

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function paint(globe: GlobeInstance, theme: Theme): void {
  const colors = PALETTE[theme];
  globe
    .globeImageUrl(colors.image)
    .atmosphereColor(colors.atmosphere)
    .arcColor((arc: object) => ((arc as (typeof ARCS)[number]).to.tone === 'amber' ? colors.amber : colors.accent))
    .pointColor((city: object) => ((city as (typeof CITIES)[number]).tone === 'amber' ? colors.amber : colors.accent))
    .ringColor((city: object) => {
      const hex = (city as (typeof CITIES)[number]).tone === 'amber' ? colors.amber : colors.accent;
      return (t: number) =>
        `${hex}${Math.round((1 - t) * 200)
          .toString(16)
          .padStart(2, '0')}`;
    });
}

/**
 * Real 3D Earth (globe.gl + NASA imagery) drawn over the CSS Earth in the same box. It loads only when the hero is
 * near the viewport, pauses off-screen, and is skipped for reduced motion or missing WebGL, where the CSS Earth stays.
 */
export function EarthGlobe() {
  const mount = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = mount.current;
    if (!element) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !supportsWebGL()) return;

    let globe: GlobeInstance | null = null;
    let cancelled = false;
    let stopTheme = () => {};
    let resize: ResizeObserver | null = null;

    const start = async () => {
      const { default: Globe } = await import('globe.gl');
      if (cancelled) return;
      const size = element.clientWidth;
      globe = new Globe(element, { rendererConfig: { alpha: true, antialias: true }, animateIn: false })
        .width(size)
        .height(size)
        .backgroundColor('rgba(0,0,0,0)')
        .showAtmosphere(true)
        .atmosphereAltitude(0.16)
        .pointsData([...CITIES])
        .pointAltitude(0.01)
        .pointRadius(0.45)
        .arcsData(
          ARCS.map((arc) => ({
            ...arc,
            startLat: arc.from.lat,
            startLng: arc.from.lng,
            endLat: arc.to.lat,
            endLng: arc.to.lng,
          })),
        )
        .arcStroke(0.6)
        .arcDashLength(0.4)
        .arcDashGap(0.6)
        .arcDashAnimateTime(2800)
        .ringsData([...CITIES])
        .ringMaxRadius(3.2)
        .ringPropagationSpeed(1.4)
        .ringRepeatPeriod(1600)
        .pointOfView({ lat: 24, lng: -32, altitude: ALTITUDE })
        .onGlobeReady(() => setReady(true));
      paint(globe, readTheme());

      // Purely decorative: it turns on its own and never captures drags, so touch scrolling still works.
      const controls = globe.controls();
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.45;
      controls.enableRotate = false;
      controls.enableZoom = false;
      controls.enablePan = false;

      stopTheme = watchTheme((theme) => globe && paint(globe, theme));
      resize = new ResizeObserver(() => {
        const next = element.clientWidth;
        if (globe && next > 0) globe.width(next).height(next);
      });
      resize.observe(element);
    };

    // Load on approach, then pause whenever the globe is scrolled out of view.
    const visibility = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting && !globe) void start();
        else if (globe) {
          if (entry.isIntersecting) globe.resumeAnimation();
          else globe.pauseAnimation();
        }
      },
      { rootMargin: '200px' },
    );
    visibility.observe(element);

    return () => {
      cancelled = true;
      visibility.disconnect();
      resize?.disconnect();
      stopTheme();
      globe?._destructor();
    };
  }, []);

  return <div ref={mount} className={`globe-canvas${ready ? ' is-ready' : ''}`} aria-hidden="true" />;
}
