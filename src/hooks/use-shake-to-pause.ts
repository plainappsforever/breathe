import { Accelerometer } from 'expo-sensors';
import { useEffect, useRef } from 'react';

import { ShakeDetector } from '@/lib/shake';

const UPDATE_INTERVAL_MS = 100;

/**
 * Calls onShake when the phone is shaken (two hard jolts within half a second). Subscribes to the
 * accelerometer only while `active` (a running session with the setting on), so nothing listens the
 * rest of the time. The accelerometer needs no permission on either platform (V3 P3 pinned additions);
 * on a device without one, or in the iOS simulator, it simply never fires.
 */
export function useShakeToPause(active: boolean, onShake: () => void): void {
  const onShakeRef = useRef(onShake);
  useEffect(() => {
    onShakeRef.current = onShake;
  }, [onShake]);

  useEffect(() => {
    if (!active) return;
    const detector = new ShakeDetector();
    Accelerometer.setUpdateInterval(UPDATE_INTERVAL_MS);
    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      if (detector.push(x, y, z, Date.now())) onShakeRef.current();
    });
    return () => subscription.remove();
  }, [active]);
}
