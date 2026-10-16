/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ACCENTS, useAccent } from '@/lib/accent';

/** The palette for the current appearance, with `tint` following the chosen accent colour. */
export function useTheme() {
  const scheme = useColorScheme();
  const accent = useAccent();
  const theme = scheme === 'unspecified' ? 'light' : scheme;

  return { ...Colors[theme], tint: ACCENTS[accent][theme] };
}
