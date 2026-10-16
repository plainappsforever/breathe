import { useRef, useState } from 'react';
import { type GestureResponderEvent, type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Snaps to the step and keeps the value inside [min, max]; rounds away float noise (0.1 + 0.2). */
export function snapToStep(value: number, min: number, max: number, step: number): number {
  const snapped = min + Math.round((value - min) / step) * step;
  return Math.round(Math.min(max, Math.max(min, snapped)) * 1000) / 1000;
}

type SliderProps = {
  testID: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Shown to the right of the track, e.g. "45%". */
  display: string;
  onChange: (value: number) => void;
  /** Called once when the finger lifts or a step button is pressed (save, play a sample). */
  onCommit?: (value: number) => void;
};

/**
 * A horizontal slider without a native dependency: drag or tap the track, or use the - / + buttons
 * (also the way to reach it with a screen reader or a test). Values snap to `step`.
 */
export function Slider({ testID, label, value, min, max, step, display, onChange, onCommit }: SliderProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  // A touch that starts on the slider is only a drag once it moves sideways; a vertical swipe belongs to
  // the page (so scrolling Settings never changes a value).
  const gesture = useRef({ startX: 0, dragging: false });
  const fraction = max > min ? (value - min) / (max - min) : 0;

  function valueAt(event: GestureResponderEvent): number {
    if (width <= 0) return value;
    const ratio = Math.min(1, Math.max(0, event.nativeEvent.locationX / width));
    return snapToStep(min + ratio * (max - min), min, max, step);
  }

  function nudge(direction: 1 | -1) {
    const next = snapToStep(value + direction * step, min, max, step);
    if (next === value) return;
    onChange(next);
    onCommit?.(next);
  }

  return (
    <View style={styles.row}>
      <Pressable testID={`${testID}-down`} accessibilityRole="button" accessibilityLabel={`${label} lower`} hitSlop={8} onPress={() => nudge(-1)} style={styles.stepButton}>
        <ThemedText type="default">−</ThemedText>
      </Pressable>
      <View
        testID={testID}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: value, text: display }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => nudge(event.nativeEvent.actionName === 'increment' ? 1 : -1)}
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onResponderTerminationRequest={() => !gesture.current.dragging}
        onResponderGrant={(event) => {
          gesture.current = { startX: event.nativeEvent.pageX, dragging: false };
        }}
        onResponderMove={(event) => {
          if (!gesture.current.dragging && Math.abs(event.nativeEvent.pageX - gesture.current.startX) < DRAG_SLOP) return;
          gesture.current.dragging = true;
          onChange(valueAt(event));
        }}
        onResponderRelease={(event) => {
          // A tap (no drag) sets the value where it landed; a drag ends where the finger lifted.
          const next = valueAt(event);
          onChange(next);
          onCommit?.(next);
        }}
        style={styles.touch}>
        <View pointerEvents="none" style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
          <View style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: theme.tint }]} />
        </View>
        <View pointerEvents="none" style={[styles.thumb, { left: `${fraction * 100}%`, backgroundColor: theme.tint, borderColor: theme.background }]} />
      </View>
      <Pressable testID={`${testID}-up`} accessibilityRole="button" accessibilityLabel={`${label} higher`} hitSlop={8} onPress={() => nudge(1)} style={styles.stepButton}>
        <ThemedText type="default">+</ThemedText>
      </Pressable>
      <ThemedText testID={`${testID}-value`} type="small" themeColor="textSecondary" style={styles.display}>
        {display}
      </ThemedText>
    </View>
  );
}

const THUMB = 22;
const DRAG_SLOP = 6;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
  },
  stepButton: {
    width: 32,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  touch: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
    marginHorizontal: THUMB / 2,
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 2,
    marginLeft: -THUMB / 2,
  },
  display: {
    width: 44,
    textAlign: 'right',
  },
});
