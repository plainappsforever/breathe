import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { VisualKind } from '@/db/app-settings';
import type { Phase } from '@/lib/patterns';
import { waveLevel, wavePath, waveSegments } from '@/lib/wave';

export const ORB_SIZE = 220;
/** The breath level the session screen drives: the smallest and largest scale (empty and full lungs). */
export const ORB_SMALL = 0.85;
export const ORB_BIG = 1.3;

const WAVE_HEIGHT = 150;
const WAVE_STROKE = 3;
const DOT = 14;
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
  /** Wave only: the pattern's phases and the position (0..1) along one breath, driven by the session screen. */
  phases?: readonly Phase[];
  wavePos?: SharedValue<number>;
};

/** The breathing shape: a filled orb, an outline ring, or a progress bar. ('text' is drawn by the screen.) */
export function BreathVisual({ kind, scale, opacity, color, trackColor, reduceMotion, resting = false, testID = 'orb', phases, wavePos }: Props) {
  const shapeStyle = useAnimatedStyle(() => {
    const p = resting ? 1 : breathProgress(scale.value);
    return reduceMotion
      ? { transform: [{ scale: 1.05 }], opacity: opacity.value * (FADE_LOW + (1 - FADE_LOW) * p) }
      : { transform: [{ scale: scale.value }], opacity: opacity.value };
  });
  if (kind === 'bar') {
    return <WaveVisual testID={testID} phases={phases ?? []} wavePos={wavePos} scale={scale} opacity={opacity} color={color} trackColor={trackColor} reduceMotion={reduceMotion} resting={resting} />;
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
  dot: {
    position: 'absolute',
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
});

type WaveProps = {
  testID: string;
  phases: readonly Phase[];
  wavePos?: SharedValue<number>;
  scale: SharedValue<number>;
  opacity: SharedValue<number>;
  color: string;
  trackColor: string;
  reduceMotion: boolean;
  resting: boolean;
};

/** The pattern drawn as one breath wave (3 pt accent line); a dot travels it while the session runs. */
function WaveVisual({ testID, phases, wavePos, scale, opacity, color, reduceMotion, resting }: WaveProps) {
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.min(windowWidth, MaxContentWidth) - Spacing.four * 2;
  const pad = DOT / 2 + 2;
  const segs = waveSegments(phases.length > 0 ? phases : [{ kind: 'inhale', seconds: 4 }, { kind: 'exhale', seconds: 6 }]);
  const usable = width - 2 * pad;
  const inner = WAVE_HEIGHT - 2 * pad;

  const lineStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const dotStyle = useAnimatedStyle(() => {
    // Reduce motion: the dot stays at the start and fades with the breath instead of travelling.
    const pos = reduceMotion || resting || !wavePos ? 0 : wavePos.value;
    const level = reduceMotion || resting || !wavePos ? 0 : waveLevel(segs, pos);
    const fade = reduceMotion && !resting ? 0.3 + 0.7 * breathProgress(scale.value) : 1;
    return {
      opacity: opacity.value * fade,
      transform: [{ translateX: pad + pos * usable - DOT / 2 }, { translateY: pad + (1 - level) * inner - DOT / 2 }],
    };
  });

  return (
    <View testID={testID} style={{ width, height: WAVE_HEIGHT }}>
      <Animated.View style={lineStyle}>
        <Svg width={width} height={WAVE_HEIGHT}>
          <Path d={wavePath(segs, width, WAVE_HEIGHT, pad)} stroke={color} strokeWidth={WAVE_STROKE} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.dot, { backgroundColor: color }, dotStyle]} />
    </View>
  );
}
