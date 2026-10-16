import { leaveAction } from './session-lifecycle';

describe('leaveAction (REVIEW_V3 #4)', () => {
  it('pauses a running session that cannot guide in the background (locked mode off, the default)', () => {
    expect(leaveAction('running', false)).toBe('pause');
  });

  it('keeps a locked-mode session running and confirms its progress', () => {
    expect(leaveAction('running', true)).toBe('confirm');
  });

  it('countdown: locked mode keeps the armed guidance; without it the countdown restarts on return (REVIEW_V3 #5)', () => {
    expect(leaveAction('settling', true)).toBe('none');
    expect(leaveAction('settling', false)).toBe('restartCountdown');
  });

  it('does nothing outside a running session or countdown', () => {
    for (const phase of ['idle', 'paused', 'ended']) {
      expect(leaveAction(phase, false)).toBe('none');
      expect(leaveAction(phase, true)).toBe('none');
    }
  });
});
