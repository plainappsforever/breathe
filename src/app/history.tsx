import { Link, Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { BackButton } from '@/components/back-button';
import { LockGate } from '@/components/lock-gate';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ColumnStyle, Spacing } from '@/constants/theme';
import { getAppSettings } from '@/db/app-settings';
import { listAllSessions, type SessionRecord } from '@/db/sessions';
import { useTheme } from '@/hooks/use-theme';
import { formatSessionSummary } from '@/lib/format';
import {
  filterSessions,
  isFiltering,
  NO_FILTER,
  parseTags,
  patternChoices,
  tagChoices,
  type HistoryFilter,
} from '@/lib/history-filter';
import {
  currentRun,
  dailyMinutes,
  daysPracticedInLast,
  heatmap,
  longestSession,
  milestones,
  mostUsedPattern,
  totalsForPeriod,
  type Period,
} from '@/lib/stats';

const PERIOD_CHOICES: { value: Period; label: string }[] = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All' },
];

const HEAT_OPACITY = [0, 0.25, 0.45, 0.7, 1] as const;
const BAR_DAYS = 14;
// The filter chips wrap onto several lines; more than this is what search is for.
const MAX_PATTERN_CHIPS = 12;
const MAX_TAG_CHIPS = 16;
const BAR_HEIGHT = 72;

function minutesText(minutes: number): string {
  return `${minutes} min`;
}

function secondsText(seconds: number): string {
  return seconds < 60 ? `${Math.round(seconds)} s` : `${Math.round((seconds / 60) * 10) / 10} min`;
}

function daysText(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

function dayLabel(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'narrow' });
}

function moodText(s: SessionRecord): string | null {
  if (s.moodBefore === null && s.moodAfter === null) return null;
  return `Mood ${s.moodBefore ?? '–'} → ${s.moodAfter ?? '–'}`;
}

export default function HistoryScreen() {
  return (
    <>
      <Stack.Screen options={{ headerLeft: () => <BackButton /> }} />
      <LockGate>
        <HistoryContent />
      </LockGate>
    </>
  );
}

function HistoryContent() {
  const db = useSQLiteContext();
  const router = useRouter();
  const theme = useTheme();
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null);
  // The moment the list was loaded: charts and "last 7 days" are relative to it (and stay stable while rendering).
  const [now, setNow] = useState(0);
  const [showMilestones, setShowMilestones] = useState(false);
  const [period, setPeriod] = useState<Period>('week');
  const [filter, setFilter] = useState<HistoryFilter>(NO_FILTER);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([listAllSessions(db), getAppSettings(db)]).then(([rows, settings]) => {
        if (!active) return;
        setSessions(rows);
        setNow(Date.now());
        setShowMilestones(settings.milestones);
      });
      return () => {
        active = false;
      };
    }, [db])
  );

  const all = useMemo(() => sessions ?? [], [sessions]);
  const visible = useMemo(() => filterSessions(all, filter), [all, filter]);
  const patterns = useMemo(() => patternChoices(all), [all]);
  const tags = useMemo(() => tagChoices(all), [all]);

  if (sessions === null) return null;

  const empty = all.length === 0;
  const totals = totalsForPeriod(all, period, now);
  const longest = longestSession(all);
  const favourite = mostUsedPattern(all);
  const run = currentRun(all, now);
  const grid = heatmap(all, now, 12);
  const bars = dailyMinutes(all, now, BAR_DAYS);
  const tallest = Math.max(0, ...bars.map((b) => b.minutes));
  const barMax = Math.max(1, tallest);
  const reached = showMilestones ? milestones(all) : [];
  const heatDays = grid.flat().filter((c) => c.sessions > 0).length;

  const card = [styles.card, { backgroundColor: theme.backgroundElement }];

  const header = empty ? null : (
    <View style={styles.header}>
      <Segmented options={PERIOD_CHOICES} value={period} onChange={setPeriod} testIdPrefix="period" />
      <View testID="totals" style={card}>
        <ThemedText type="title">{minutesText(totals.minutes)}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {totals.sessions} {totals.sessions === 1 ? 'session' : 'sessions'}
          {totals.sessions > 0
            ? ` · ${secondsText(totals.avgSessionSeconds)} each · ${totals.avgBreathsPerSession} breaths each`
            : ''}
        </ThemedText>
        {totals.sessions > 0 && period !== 'day' && (
          <ThemedText type="small" themeColor="textSecondary">
            About {secondsText(totals.avgSecondsPerDay)} a day
          </ThemedText>
        )}
      </View>

      <View style={styles.cardRow}>
        <View style={[card, styles.half]}>
          <ThemedText type="smallBold">Last 7 days</ThemedText>
          <ThemedText themeColor="textSecondary">{daysText(daysPracticedInLast(all, now, 7))} practised</ThemedText>
        </View>
        <View style={[card, styles.half]}>
          <ThemedText type="smallBold">Last 30 days</ThemedText>
          <ThemedText themeColor="textSecondary">{daysText(daysPracticedInLast(all, now, 30))} practised</ThemedText>
        </View>
      </View>
      <View style={styles.cardRow}>
        <View style={[card, styles.half]}>
          <ThemedText type="smallBold">Most used</ThemedText>
          <ThemedText themeColor="textSecondary">{favourite ? `${favourite.name} (${favourite.sessions})` : '–'}</ThemedText>
        </View>
        <View style={[card, styles.half]}>
          <ThemedText type="smallBold">Longest</ThemedText>
          <ThemedText themeColor="textSecondary">{longest ? secondsText(longest.actualSeconds) : '–'}</ThemedText>
        </View>
      </View>
      {run > 0 && (
        <View testID="current-run" style={card}>
          <ThemedText type="smallBold">Current run</ThemedText>
          <ThemedText themeColor="textSecondary">
            {daysText(run)} practised · one day off is fine
          </ThemedText>
        </View>
      )}

      <View testID="heatmap" accessible accessibilityLabel={`Activity over the last 12 weeks: ${heatDays} days practised`} style={card}>
        <ThemedText type="smallBold">Last 12 weeks</ThemedText>
        <View style={styles.heat}>
          {grid.map((column) => (
            <View key={column[0].dayStart} style={styles.heatColumn}>
              {column.map((cell) => (
                <View
                  key={cell.dayStart}
                  style={[
                    styles.heatCell,
                    { backgroundColor: theme.backgroundSelected },
                    cell.future && { opacity: 0 },
                    !cell.future && cell.level > 0 && { backgroundColor: theme.tint, opacity: HEAT_OPACITY[cell.level] },
                  ]}
                />
              ))}
            </View>
          ))}
        </View>
      </View>

      <View testID="bars" accessible accessibilityLabel={`Minutes per day, last ${BAR_DAYS} days`} style={card}>
        <ThemedText type="smallBold">Minutes per day</ThemedText>
        <View style={styles.bars}>
          {bars.map((b) => (
            <View key={b.dayStart} style={styles.barColumn}>
              <View
                style={[
                  styles.bar,
                  { height: Math.max(2, (b.minutes / barMax) * BAR_HEIGHT), backgroundColor: b.minutes > 0 ? theme.tint : theme.backgroundSelected },
                ]}
              />
              <ThemedText type="small" themeColor="textSecondary" style={styles.barLabel}>
                {dayLabel(b.dayStart)}
              </ThemedText>
            </View>
          ))}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Last {BAR_DAYS} days · tallest {minutesText(Math.round(tallest * 10) / 10)}
        </ThemedText>
      </View>

      {reached.length > 0 && (
        <View testID="milestones" style={card}>
          <ThemedText type="smallBold">Milestones</ThemedText>
          {reached.map((m) => (
            <View key={m.id} style={styles.milestone}>
              <ThemedText>{m.label}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {new Date(m.reachedAt).toLocaleDateString()}
              </ThemedText>
            </View>
          ))}
        </View>
      )}

      <ThemedText type="smallBold" style={styles.listTitle}>
        Sessions
      </ThemedText>
      <TextInput
        testID="history-search"
        value={filter.query}
        onChangeText={(query) => setFilter((f) => ({ ...f, query }))}
        placeholder="Search notes and tags"
        placeholderTextColor={theme.textSecondary}
        accessibilityLabel="Search notes and tags"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
        style={[styles.search, { backgroundColor: theme.backgroundElement, color: theme.text }]}
      />
      {(patterns.length > 1 || tags.length > 0) && (
        <View style={styles.chips}>
          {patterns.length > 1 &&
            patterns.slice(0, MAX_PATTERN_CHIPS).map((p) => (
              <Chip
                key={p.key}
                testID={`filter-pattern-${p.key}`}
                label={p.name}
                selected={filter.pattern === p.key}
                onPress={() => setFilter((f) => ({ ...f, pattern: f.pattern === p.key ? null : p.key }))}
              />
            ))}
          {tags.slice(0, MAX_TAG_CHIPS).map((t) => (
            <Chip
              key={t.tag}
              testID={`filter-tag-${t.tag}`}
              label={`#${t.tag}`}
              selected={filter.tag === t.tag}
              onPress={() => setFilter((f) => ({ ...f, tag: f.tag === t.tag ? null : t.tag }))}
            />
          ))}
        </View>
      )}
      {isFiltering(filter) && (
        <View style={styles.filterLine}>
          <ThemedText testID="filter-count" type="small" themeColor="textSecondary">
            {visible.length} of {all.length} sessions
          </ThemedText>
          <Pressable testID="filter-clear" accessibilityRole="button" hitSlop={12} onPress={() => setFilter(NO_FILTER)}>
            <ThemedText type="small" themeColor="tint">
              Clear filters
            </ThemedText>
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <FlatList
      testID="history-screen"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, ColumnStyle]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      data={visible}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <ThemedText testID="history-empty" themeColor="textSecondary" style={styles.empty}>
          {empty ? 'No sessions yet.' : 'No sessions match.'}
        </ThemedText>
      }
      ListFooterComponent={
        <Link href="/data" asChild>
          <Pressable testID="open-data" accessibilityRole="button" style={StyleSheet.flatten([styles.linkRow, { backgroundColor: theme.backgroundElement }])}>
            <ThemedText>Export, back up or delete</ThemedText>
          </Pressable>
        </Link>
      }
      renderItem={({ item }) => {
        const mood = moodText(item);
        const itemTags = parseTags(item.tags);
        return (
          <Pressable
            testID={`session-row-${item.id}`}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/session', params: { id: String(item.id) } })}
            style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">{item.patternName}</ThemedText>
            <ThemedText themeColor="textSecondary">{formatSessionSummary(item.actualSeconds, item.breaths)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {new Date(item.startedAt).toLocaleString()}
              {mood ? ` · ${mood}` : ''}
            </ThemedText>
            {itemTags.length > 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                {itemTags.map((t) => `#${t}`).join(' ')}
              </ThemedText>
            )}
            {item.note !== '' && (
              <ThemedText type="small" numberOfLines={2}>
                {item.note}
              </ThemedText>
            )}
          </Pressable>
        );
      }}
    />
  );
}

function Chip({ testID, label, selected, onPress }: { testID: string; label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement }, selected && { borderColor: theme.tint }]}>
      <ThemedText type={selected ? 'smallBold' : 'small'}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  header: {
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  card: {
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  cardRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  half: {
    flex: 1,
  },
  heat: {
    flexDirection: 'row',
    gap: 3,
    marginTop: Spacing.one,
  },
  heatColumn: {
    flex: 1,
    gap: 3,
  },
  heatCell: {
    aspectRatio: 1,
    borderRadius: 3,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: BAR_HEIGHT + 20,
    marginTop: Spacing.one,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  bar: {
    width: '100%',
    borderRadius: 3,
  },
  barLabel: {
    fontSize: 11,
    lineHeight: 14,
  },
  milestone: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  listTitle: {
    marginTop: Spacing.two,
  },
  search: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    minHeight: 36,
    borderRadius: 18,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filterLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  row: {
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  linkRow: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
    marginTop: Spacing.three,
  },
});
