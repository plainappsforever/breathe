import { StyleSheet } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import type { VisualKind } from '@/db/app-settings';

export const ORB_SIZE = 220;
/** The breath level the session screen drives: the smallest and largest scale (empty and full lungs). */
export const ORB_SMALL = 0.85;
export const ORB_BIG = 1.3;

const BAR_WIDTH = 260;
const BAR_HEIGHT = 18;
const RING_WIDTH = 10;
/** Reduce motion: the shape stays put and fades between these opacities. */
const FADE_LOW = 0.3;

/** Breath progress 0 (empty) .. 1 (full) from the orb scale the session drives. */
export function breathProgress(scale: number): number {
  'worklet';
  return Math.min(1, Math.max(0, (scale - ORB_SMALL) / (ORB_BIG - ORB_SMALL)));
}

type Props = {
  kind: Exclude<VisualKind, 'text'>;
  /** Breath level, driven by the session screen (ORB_SMALL..ORB_BIG). */
  scale: SharedValue<number>;
  /** Overall opacity (the fade-in while settling). */
  opacity: SharedValue<number>;
  color: string;
  trackColor: string;
  /** Cross-fade instead of scaling or sliding (the OS setting or the app's own switch). */
  reduceMotion: boolean;
  /** Home (nothing breathing yet): with reduce motion the shape shows fully instead of at a breath level. */
  resting?: boolean;
  testID?: string;
};

/** The breathing shape: a filled orb, an outline ring, or a progress bar. ('text' is drawn by the screen.) */
export function BreathVisual({ kind, scale, opacity, color, trackColor, reduceMotion, resting = false, testID = 'orb' }: Props) {
  const shapeStyle = useAnimatedStyle(() => {
    const p = resting ? 1 : breathProgress(scale.value);
    return reduceMotion
      ? { transform: [{ scale: 1.05 }], opacity: opacity.value * (FADE_LOW + (1 - FADE_LOW) * p) }
      : { transform: [{ scale: scale.value }], opacity: opacity.value };
  });
  const fillStyle = useAnimatedStyle(() => {
    const p = resting ? 1 : breathProgress(scale.value);
    return reduceMotion ? { width: '100%', opacity: FADE_LOW + (1 - FADE_LOW) * p } : { width: `${Math.max(4, p * 100)}%`, opacity: 1 };
  });
  const barOpacity = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (kind === 'bar') {
    return (
      <Animated.View testID={testID} style={[styles.barTrack, barOpacity, { backgroundColor: trackColor }]}>
        <Animated.View style={[styles.barFill, fillStyle, { backgroundColor: color }]} />
      </Animated.View>
    );
  }

  return (
    <Animated.View
      testID={testID}
      style={[
        styles.orb,
        shapeStyle,
        kind === 'ring' ? { backgroundColor: 'transparent', borderColor: color, borderWidth: RING_WIDTH } : { backgroundColor: color, borderColor: color },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  orb: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
  },
  barTrack: {
    width: BAR_WIDTH,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    overflow: 'hidden',
    marginVertical: (ORB_SIZE - BAR_HEIGHT) / 2,
  },
  barFill: {
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
  },
});
