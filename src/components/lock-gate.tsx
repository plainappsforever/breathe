import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { getAppSettings } from '@/db/app-settings';
import { useTheme } from '@/hooks/use-theme';
import { initialGateState, lockHeldOpen } from '@/lib/history-lock';
import { confirmOwner, getLockCapability } from '@/lib/local-auth';

/**
 * Wraps History, a session's details and the data screen. With the History lock off (the default) it renders
 * the children at once. With it on, the children stay hidden until the phone confirms the owner (face,
 * fingerprint or passcode); leaving the app locks it again. It never wraps the session screen.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [state, setState] = useState<'checking' | 'open' | 'locked'>('checking');
  const enabledRef = useRef(false);
  const asking = useRef(false);

  async function unlock() {
    if (asking.current) return;
    asking.current = true;
    const ok = await confirmOwner('Unlock your history');
    asking.current = false;
    if (ok) setState('open');
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const settings = await getAppSettings(db);
      enabledRef.current = settings.historyLock;
      if (!settings.historyLock) {
        if (active) setState('open');
        return;
      }
      const gate = initialGateState(true, await getLockCapability());
      if (!active) return;
      setState(gate);
      if (gate === 'locked') unlock();
    })().catch(() => active && setState('open'));

    const sub = AppState.addEventListener('change', (next) => {
      // Not while the app's own file picker or share sheet is open (Android backgrounds the app for them).
      if (next === 'background' && enabledRef.current && !lockHeldOpen()) setState('locked');
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, [db]);

  if (state === 'open') return <>{children}</>;
  return (
    <View testID="history-locked" style={[styles.locked, { backgroundColor: theme.background }]}>
      {state === 'locked' && (
        <>
          <ThemedText type="subtitle">History is locked</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centered}>
            Only you can see it. Your breathing sessions never need this.
          </ThemedText>
          <Button testID="unlock-history" label="Unlock" onPress={unlock} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  locked: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  centered: {
    textAlign: 'center',
  },
});
