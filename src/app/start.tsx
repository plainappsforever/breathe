import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { intentFromParams, setPendingIntent } from '@/lib/launch-intent';

/**
 * Landing route for `breathe://start?pattern=<id>&target=m:3` (any scheme variant). It hands the parsed
 * intent to the session screen and returns to Home, which starts the session exactly once.
 * The same parser (`src/lib/launch-intent.ts`) serves every other entry point built later.
 */
export default function StartRoute() {
  const params = useLocalSearchParams<{ pattern?: string; target?: string }>();
  const router = useRouter();
  const theme = useTheme();

  useEffect(() => {
    setPendingIntent(intentFromParams(params));
    router.dismissTo('/');
    // Runs once per arrival; the params identify that arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <View style={{ flex: 1, backgroundColor: theme.background }} />;
}
