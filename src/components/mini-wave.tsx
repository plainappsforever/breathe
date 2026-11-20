import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import type { Phase } from '@/lib/patterns';
import { wavePath, waveSegments } from '@/lib/wave';

const WIDTH = 64;
const HEIGHT = 28;

/** A pattern's own breath wave, small: drawn in the Patterns list instead of text chips. Decoration only. */
export function MiniWave({ phases }: { phases: readonly Phase[] }) {
  const theme = useTheme();
  return (
    <Svg width={WIDTH} height={HEIGHT} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={wavePath(waveSegments(phases), WIDTH, HEIGHT, 3)} stroke={theme.tintText} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
