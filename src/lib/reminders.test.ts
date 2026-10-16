import {
  answerFor,
  buildPayload,
  contentData,
  describeWeekdays,
  DEFAULT_TAP,
  formatTime,
  isReminderRequestId,
  isValidTime,
  MAX_REMINDERS,
  normalizeWeekdays,
  parseWeekdays,
  readPayload,
  reminderBody,
  serializeWeekdays,
  snoozeRequestId,
  stepTime,
  toggleWeekday,
  triggerPlan,
} from './reminders';

describe('weekdays', () => {
  it('keeps 1-7, sorted and unique; all seven or none means every day', () => {
    expect(normalizeWeekdays([5, 3, 3, 9, 0, 1.5])).toEqual([3, 5]);
    expect(normalizeWeekdays([1, 2, 3, 4, 5, 6, 7])).toEqual([]);
    expect(normalizeWeekdays([])).toEqual([]);
  });

  it('round-trips through the stored text', () => {
    expect(parseWeekdays('')).toEqual([]);
    expect(parseWeekdays(null)).toEqual([]);
    expect(parseWeekdays('2, 4,6')).toEqual([2, 4, 6]);
    expect(parseWeekdays('x,2')).toEqual([2]);
    expect(serializeWeekdays([6, 2, 4])).toBe('2,4,6');
    expect(serializeWeekdays([1, 2, 3, 4, 5, 6, 7])).toBe('');
  });

  it('describes days in words, weeks starting Monday', () => {
    expect(describeWeekdays([])).toBe('Every day');
    expect(describeWeekdays([2, 3, 4, 5, 6])).toBe('Weekdays');
    expect(describeWeekdays([7, 1])).toBe('Weekends');
    expect(describeWeekdays([1, 4, 2])).toBe('Mon, Wed, Sun');
  });

  it('toggles a day; the last day cannot be removed; picking all seven means every day', () => {
    expect(toggleWeekday([], 1)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(toggleWeekday([2, 3], 3)).toEqual([2]);
    expect(toggleWeekday([2], 2)).toEqual([2]);
    expect(toggleWeekday([2, 3, 4, 5, 6, 7], 1)).toEqual([]);
  });
});

describe('time', () => {
  it('formats on a 24 hour clock', () => {
    expect(formatTime(8, 5)).toBe('08:05');
    expect(formatTime(0, 0)).toBe('00:00');
  });

  it('steps and wraps around midnight', () => {
    expect(stepTime(8, 0, 60)).toEqual({ hour: 9, minute: 0 });
    expect(stepTime(23, 30, 60)).toEqual({ hour: 0, minute: 30 });
    expect(stepTime(0, 0, -5)).toEqual({ hour: 23, minute: 55 });
    expect(stepTime(8, 58, 5)).toEqual({ hour: 9, minute: 3 });
    expect(stepTime(8, 0, -1)).toEqual({ hour: 7, minute: 59 });
  });

  it('validates', () => {
    expect(isValidTime(23, 59)).toBe(true);
    expect(isValidTime(24, 0)).toBe(false);
    expect(isValidTime(8, 60)).toBe(false);
    expect(isValidTime(8.5, 0)).toBe(false);
  });
});

describe('trigger plan', () => {
  it('is one DAILY trigger for every day', () => {
    expect(triggerPlan({ id: 3, hour: 8, minute: 30, weekdays: [] })).toEqual([{ identifier: 'reminder-3-d', hour: 8, minute: 30 }]);
  });

  it('is one WEEKLY trigger per chosen day (1 = Sunday)', () => {
    const plan = triggerPlan({ id: 4, hour: 21, minute: 0, weekdays: [2, 4, 1] });
    expect(plan.map((p) => p.weekday)).toEqual([1, 2, 4]);
    expect(plan.map((p) => p.identifier)).toEqual(['reminder-4-w1', 'reminder-4-w2', 'reminder-4-w4']);
  });

  it('stays inside the 64 pending notifications iOS allows, with a snooze per reminder', () => {
    const worst = MAX_REMINDERS * 6 + MAX_REMINDERS; // a reminder on 6 days (7 days = one DAILY) plus its snooze
    expect(MAX_REMINDERS * 7 + MAX_REMINDERS).toBeLessThanOrEqual(64);
    expect(worst).toBeLessThanOrEqual(64);
  });

  it('separates reminder requests from snoozes', () => {
    expect(isReminderRequestId('reminder-1-d')).toBe(true);
    expect(isReminderRequestId(snoozeRequestId(1))).toBe(false);
  });
});

describe('what a reminder carries and how it is answered', () => {
  const payload = buildPayload('breathe-dev', { id: 7, patternId: 'box' });

  it('carries a launch URL that needs no database', () => {
    expect(payload).toEqual({ reminderId: 7, patternId: 'box', url: 'breathe-dev://start?pattern=box' });
    expect(buildPayload('breathe', { id: 2, patternId: null }).url).toBe('breathe://start');
    expect(readPayload(payload)).toEqual(payload);
    expect(readPayload({ reminderId: 'x', url: 1 })).toBeNull();
    expect(readPayload(null)).toBeNull();
  });

  it('reads the data from the JSON string a headless Android run delivers', () => {
    expect(contentData({ data: payload })).toEqual(payload);
    expect(contentData({ data: {}, dataString: JSON.stringify(payload) })).toEqual(payload);
    expect(contentData({ dataString: JSON.stringify(payload) })).toEqual(payload);
    expect(contentData({ dataString: '{oops' })).toBeNull();
    expect(contentData({})).toBeNull();
    expect(answerFor('snooze', contentData({ dataString: JSON.stringify(payload) }))).toEqual({ kind: 'snooze', payload });
  });

  it('starts a session from a tap on the notification or the Start button, through the launch intent', () => {
    expect(answerFor(DEFAULT_TAP, payload)).toEqual({ kind: 'start', intent: { action: 'start', patternId: 'box' } });
    expect(answerFor('start', payload)).toEqual({ kind: 'start', intent: { action: 'start', patternId: 'box' } });
    expect(answerFor('start', buildPayload('breathe', { id: 1, patternId: null }))).toEqual({ kind: 'start', intent: { action: 'start' } });
  });

  it('snoozes and skips without starting anything', () => {
    expect(answerFor('snooze', payload)).toEqual({ kind: 'snooze', payload });
    expect(answerFor('skip', payload)).toEqual({ kind: 'skip', payload });
  });

  it('ignores anything it does not understand', () => {
    expect(answerFor('other', payload)).toEqual({ kind: 'ignore' });
    expect(answerFor('start', {})).toEqual({ kind: 'ignore' });
  });

  it('words the reminder calmly and without claims', () => {
    for (const text of [reminderBody(null), reminderBody('Slow')]) {
      expect(text).not.toMatch(/proven|clinical|treat|anxiety|insomnia|blood pressure|hrv|streak|miss/i);
    }
    expect(reminderBody('Slow')).toContain('Slow');
  });
});
