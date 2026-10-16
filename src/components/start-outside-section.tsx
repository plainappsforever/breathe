import { useState } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import QuickTile from '../../modules/quick-tile/src/QuickTileModule';
import StartWidget from '../../modules/start-widget/src/StartWidgetModule';

const TILE_RESULT: Record<string, string> = {
  added: 'Added. Swipe down twice to find "Breathe" in Quick Settings.',
  alreadyAdded: 'The Breathe tile is already in Quick Settings.',
  notAdded: 'Not added. You can also add it by editing Quick Settings.',
};

const WIDGET_RESULT: Record<string, string> = {
  requested: 'Your home screen shows where the widget goes; confirm there.',
  alreadyAdded: 'The Breathe widget is already on your home screen.',
};

/**
 * v3 P7: Settings rows for the entry points outside the app (Android: Quick Settings tile on 13+, home-screen
 * widget). Nothing here runs on its own; the system dialogs appear only when a row is tapped.
 */
export function StartOutsideSection() {
  const theme = useTheme();
  const [tileNote, setTileNote] = useState('');
  const [widgetNote, setWidgetNote] = useState('');
  const canAddTile = Platform.OS === 'android' && QuickTile?.canRequestAddTile() === true;
  const canPinWidget = Platform.OS === 'android' && StartWidget?.canPinWidget() === true;

  if (!canAddTile && !canPinWidget) return null;

  function addWidget() {
    let result = 'unsupported';
    try {
      result = StartWidget!.requestPinWidget();
    } catch {
      // fall through to the manual hint
    }
    setWidgetNote(WIDGET_RESULT[result] ?? 'Long-press your home screen, choose Widgets and find Breathe Well.');
  }

  async function addTile() {
    const result = await QuickTile!.requestAddTile().catch(() => 'error');
    setTileNote(TILE_RESULT[result] ?? 'Could not add the tile. You can add it by editing Quick Settings.');
  }

  return (
    <>
      <ThemedText type="smallBold" style={styles.section}>
        Start without opening the app
      </ThemedText>
      {canAddTile && (
        <Pressable
          testID="add-tile"
          accessibilityRole="button"
          onPress={addTile}
          style={StyleSheet.flatten([styles.linkRow, { backgroundColor: theme.backgroundElement }])}>
          <ThemedText>Add the Breathe tile to Quick Settings</ThemedText>
        </Pressable>
      )}
      {canAddTile && (
        <ThemedText testID="tile-note" type="small" themeColor="textSecondary">
          {tileNote || 'One tap in Quick Settings starts your usual session.'}
        </ThemedText>
      )}
      {canPinWidget && (
        <Pressable
          testID="add-widget"
          accessibilityRole="button"
          onPress={addWidget}
          style={StyleSheet.flatten([styles.linkRow, { backgroundColor: theme.backgroundElement }])}>
          <ThemedText>Add the Breathe widget to your home screen</ThemedText>
        </Pressable>
      )}
      {canPinWidget && (
        <ThemedText testID="widget-note" type="small" themeColor="textSecondary">
          {widgetNote || 'Shows your minutes today; one tap starts your usual session.'}
        </ThemedText>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: Spacing.four,
  },
  linkRow: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
  },
});
