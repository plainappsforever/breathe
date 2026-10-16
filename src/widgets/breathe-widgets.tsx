/**
 * v3 P7.4/P7.5 (iOS only): SwiftUI layouts for the "Breathe" home-screen / Lock Screen widget and the session
 * Live Activity, built with expo-widgets + @expo/ui (the eye-app approach, D67 there). Functions marked
 * `'widget'` are turned into strings at build time and run inside the widget extension, where every
 * @expo/ui/swift-ui component and modifier is a global: they may use only their arguments and those globals
 * (no other imports, no module constants). Import this file only on iOS, through `ios-surfaces.ts`.
 * Props come from the pure builders in `src/lib/entry-points.ts`.
 */
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, monospacedDigit, padding, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { SessionActivityProps, StartWidgetProps } from '@/lib/entry-points';

/** Must match the widget `name` in the expo-widgets plugin config (app.config.ts). */
export const START_WIDGET = 'StartWidget';
export const SESSION_ACTIVITY = 'SessionActivity';

function StartWidgetLayout(props: StartWidgetProps, environment: WidgetEnvironment) {
  'widget';
  const secondary = foregroundStyle({ type: 'hierarchical', style: 'secondary' });
  const today = `${props.minutes} min today`;
  if (environment.widgetFamily === 'accessoryCircular') {
    return (
      <VStack spacing={0} modifiers={[widgetURL(props.url)]}>
        <Image systemName="wind" />
        <Text modifiers={[font({ size: 12, weight: 'semibold' })]}>{`${props.minutes}m`}</Text>
      </VStack>
    );
  }
  if (environment.widgetFamily === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={1} modifiers={[widgetURL(props.url)]}>
        <HStack spacing={4}>
          <Image systemName="wind" />
          <Text modifiers={[font({ size: 15, weight: 'semibold' })]}>Breathe</Text>
        </HStack>
        <Text modifiers={[font({ size: 13 })]}>{today}</Text>
      </VStack>
    );
  }
  return (
    <VStack alignment="leading" spacing={6} modifiers={[widgetURL(props.url)]}>
      <Text modifiers={[font({ size: 13 }), secondary]}>Breathe Well</Text>
      <Text modifiers={[font({ size: 22, weight: 'semibold' })]}>{today}</Text>
      <Spacer />
      <HStack spacing={6}>
        <Image systemName="wind" />
        <Text modifiers={[font({ size: 17, weight: 'semibold' })]}>Breathe</Text>
      </HStack>
    </VStack>
  );
}

function SessionActivityLayout(props: SessionActivityProps) {
  'widget';
  const secondary = foregroundStyle({ type: 'hierarchical', style: 'secondary' });
  const clock = (size: number) =>
    props.paused ? (
      <Text modifiers={[monospacedDigit(), font({ size, weight: 'semibold' })]}>{props.pausedClock}</Text>
    ) : (
      <Text
        timerInterval={{ lower: new Date(props.startAt), upper: new Date(props.endAt) }}
        countsDown={props.countsDown}
        modifiers={[monospacedDigit(), font({ size, weight: 'semibold' })]}
      />
    );
  return {
    banner: (
      <HStack modifiers={[padding({ all: 16 })]}>
        <Image systemName="wind" />
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 13 }), secondary]}>{props.subtitle}</Text>
          <Text modifiers={[font({ size: 17, weight: 'semibold' })]}>{props.title}</Text>
        </VStack>
        <Spacer />
        {clock(28)}
      </HStack>
    ),
    compactLeading: <Image systemName="wind" />,
    compactTrailing: clock(15),
    minimal: <Image systemName="wind" />,
    expandedLeading: <Text modifiers={[font({ size: 15 }), padding({ leading: 8 })]}>{props.title}</Text>,
    expandedTrailing: clock(22),
  };
}

export const StartWidget = createWidget<StartWidgetProps>(START_WIDGET, StartWidgetLayout);
export const SessionActivity = createLiveActivity<SessionActivityProps>(SESSION_ACTIVITY, SessionActivityLayout);
