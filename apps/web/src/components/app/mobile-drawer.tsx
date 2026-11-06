'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { SidebarContent, type SidebarProps } from './sidebar-content';
import { Icon } from './icons';

export const DRAWER_ID = 'app-drawer';

/**
 * The sidebar on a phone: a manual popover (so it sits in the top layer over everything) that slides in from the left.
 * It closes on Escape, on a tap on the dimmed page, and when a link is used. The page behind is made inert while it is
 * open, and focus goes in on open and back to the menu button on close.
 */
export function MobileDrawer(props: Omit<SidebarProps, 'onNavigate'>) {
  const drawer = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const close = () => {
    if (drawer.current?.matches(':popover-open')) drawer.current.hidePopover();
  };

  useEffect(close, [pathname]);

  useEffect(() => {
    const element = drawer.current;
    if (!element) return;
    const main = document.getElementById('app-main');
    const onToggle = (event: Event) => {
      const opened = (event as ToggleEvent).newState === 'open';
      main?.toggleAttribute('inert', opened);
      document
        .querySelector<HTMLElement>(`[aria-controls="${DRAWER_ID}"]`)
        ?.setAttribute('aria-expanded', String(opened));
      if (opened) element.querySelector<HTMLElement>('a, button')?.focus();
      else document.querySelector<HTMLElement>(`[aria-controls="${DRAWER_ID}"]`)?.focus();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    element.addEventListener('toggle', onToggle);
    document.addEventListener('keydown', onKey);
    return () => {
      element.removeEventListener('toggle', onToggle);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div
      ref={drawer}
      id={DRAWER_ID}
      // A manual popover: it does not light-dismiss, so the tap-outside and Escape handling are ours.
      popover="manual"
      className="drawer sidebar"
      // A click on the backdrop lands on the popover itself, not on anything inside it.
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <button
        type="button"
        onClick={close}
        aria-label="Close menu"
        className="absolute top-3 right-3 z-10 grid size-8 place-items-center rounded-lg text-[var(--side-muted)] hover:bg-[var(--side-hover)]"
      >
        <Icon name="close" size={16} />
      </button>
      <SidebarContent {...props} onNavigate={close} />
    </div>
  );
}
