import * as Brightness from 'expo-brightness';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

const FADED_BRIGHTNESS = 0.05;

/**
 * Back to the brightness from before the fade. Android: hand the screen back to the system, so auto-brightness keeps
 * working in the app (setting the read value pinned it, REVIEW_V3 #12). iOS has no such override: set the value back.
 */
function restoreBrightness(previous: number) {
  if (Platform.OS === 'android') Brightness.restoreSystemBrightnessAsync().catch(() => {});
  else Brightness.setBrightnessAsync(previous).catch(() => {});
}

/**
 * Fades the screen to near-black after `delaySeconds` (3-30, default 5) of no interaction, and restores the original brightness on
 * wake, pause, background or unmount. Needs no permission on either platform (SPEC "Fade to dark", D10).
 */
export function useFadeToDark(enabled: boolean, active: boolean, delaySeconds = 5): { dimmed: boolean; poke: () => void } {
  const [dimmed, setDimmed] = useState(false);
  const originalBrightness = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef(delaySeconds);
  useEffect(() => {
    delayRef.current = delaySeconds;
  }, [delaySeconds]);

  const restore = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setDimmed(false);
    if (originalBrightness.current != null) {
      const previous = originalBrightness.current;
      originalBrightness.current = null;
      restoreBrightness(previous);
    }
  }, []);

  const poke = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setDimmed(false);
    if (originalBrightness.current != null) restoreBrightness(originalBrightness.current);
    timer.current = setTimeout(async () => {
      try {
        if (originalBrightness.current == null) {
          originalBrightness.current = await Brightness.getBrightnessAsync();
        }
        await Brightness.setBrightnessAsync(FADED_BRIGHTNESS);
        setDimmed(true);
      } catch {
        // No brightness permission/support: session continues at normal brightness.
      }
    }, delayRef.current * 1000);
  }, []);

  useEffect(() => {
    // Bridges React state to the native brightness API; poke/restore's own setState calls are the
    // deliberate sync point, not a derived-state loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (enabled && active) poke();
    else restore();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // poke/restore are stable (empty deps); only enabled/active should retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, active]);

  // Leaving the screen restores the brightness; coming back to a running session arms the fade again
  // (v3.1 F4, REVIEW_V3 #6: it used to stay bright, held awake, for the rest of the session).
  const armed = useRef(false);
  useEffect(() => {
    armed.current = enabled && active;
  }, [enabled, active]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') restore();
      else if (armed.current) poke();
    });
    return () => sub.remove();
  }, [restore, poke]);

  useEffect(() => restore, [restore]);

  return { dimmed, poke };
}
