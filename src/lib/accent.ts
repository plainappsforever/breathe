import { useSyncExternalStore } from 'react';

import { Brand } from '@/constants/theme';

/** Five accent colours (V3 P3). The first ('blue' is the stored key of v1) is now the brand's dusk indigo (R1, 2026-11). Each is chosen for at least 4.5:1 against the page background. */
export type AccentKey = 'blue' | 'teal' | 'green' | 'violet' | 'rose';

export const ACCENTS: Record<AccentKey, { label: string; light: string; dark: string }> = {
  blue: { label: 'Dusk', light: Brand.light.accent, dark: Brand.dark.accent },
  teal: { label: 'Teal', light: '#0B7A75', dark: '#4FD1C5' },
  green: { label: 'Green', light: '#2A7A2E', dark: '#7BD88F' },
  violet: { label: 'Violet', light: '#6A4CC7', dark: '#B79CFF' },
  rose: { label: 'Rose', light: '#C2185B', dark: '#FF8FB3' },
};

export const ACCENT_KEYS = Object.keys(ACCENTS) as AccentKey[];
export const DEFAULT_ACCENT: AccentKey = 'blue';

export function parseAccent(value: string | null): AccentKey {
  return value !== null && value in ACCENTS ? (value as AccentKey) : DEFAULT_ACCENT;
}

// A tiny external store: the accent is read once at start-up and changed from Settings; every screen
// re-renders through useTheme() without a provider.
let current: AccentKey = DEFAULT_ACCENT;
const listeners = new Set<() => void>();

export function getAccent(): AccentKey {
  return current;
}

export function setAccent(next: AccentKey): void {
  if (next === current) return;
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAccent(): AccentKey {
  return useSyncExternalStore(subscribe, getAccent, getAccent);
}
