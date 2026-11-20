import { StyleSheet, useColorScheme } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

/** Share of the accent at the bottom edge of Home: 18 % in light, 22 % in dark (sheet 9). */
const BOTTOM_ACCENT = { light: 0.18, dark: 0.22 };

/** Home background: the page colour at the top fading to the accent at the bottom. Sits behind everything. */
export function HomeBackdrop() {
  const theme = useTheme();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" pointerEvents="none">
      <Defs>
        <LinearGradient id="home-dusk" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={theme.tint} stopOpacity={0} />
          <Stop offset="1" stopColor={theme.tint} stopOpacity={BOTTOM_ACCENT[scheme]} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#home-dusk)" />
    </Svg>
  );
}
