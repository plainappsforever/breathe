// v3.1 F1 (REVIEW_V3 #1): the keep-alive bed must really stop at the end of a session and after a long pause.
import { setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';

import { endBackgroundAudio, SessionCues } from './audio';

const mockPlayers: { source: unknown; playing: boolean; removed: boolean; play: jest.Mock; pause: jest.Mock; remove: jest.Mock; addListener: jest.Mock }[] = [];

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn((source: unknown) => {
    const player = {
      source,
      playing: false,
      removed: false,
      loop: false,
      volume: 1,
      play: jest.fn(() => {
        player.playing = true;
      }),
      pause: jest.fn(() => {
        player.playing = false;
      }),
      remove: jest.fn(() => {
        player.removed = true;
      }),
      seekTo: jest.fn(() => Promise.resolve()),
      addListener: jest.fn(() => ({ remove: jest.fn() })),
      setActiveForLockScreen: jest.fn(),
      clearLockScreenControls: jest.fn(),
    };
    mockPlayers.push(player);
    return player;
  }),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  setIsAudioActiveAsync: jest.fn(() => Promise.resolve()),
}));

beforeEach(() => {
  mockPlayers.length = 0;
  jest.clearAllMocks();
});

describe('SessionCues keep-alive bed', () => {
  it('stopAmbient pauses the looping bed before freeing it (remove alone left it playing)', () => {
    const cues = new SessionCues();
    cues.startAmbient('Breathe Well', 'Slow');
    const bed = mockPlayers[0];
    expect(bed.playing).toBe(true);
    cues.stopAmbient();
    expect(bed.pause).toHaveBeenCalled();
    expect(bed.playing).toBe(false);
    expect(bed.removed).toBe(true);
    expect(cues.hasAmbient).toBe(false);
  });

  it('resumeAmbient restarts a bed removed by a long pause, with the same interruption handler', () => {
    const cues = new SessionCues();
    const onInterrupted = jest.fn();
    cues.startAmbient('Breathe Well', 'Slow', onInterrupted);
    cues.stopAmbient();
    cues.resumeAmbient();
    expect(mockPlayers).toHaveLength(2);
    expect(mockPlayers[1].playing).toBe(true);
    expect(mockPlayers[1].addListener).toHaveBeenCalled();
    expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({ shouldPlayInBackground: true }));
  });

  it('release stops every player and forgets the bed, so a later resume starts nothing', () => {
    const cues = new SessionCues();
    cues.preload(1, 'bowl');
    cues.startAmbient('Breathe Well', 'Slow');
    cues.play('end');
    cues.release();
    expect(mockPlayers.every((p) => p.removed && !p.playing)).toBe(true);
    cues.resumeAmbient();
    expect(mockPlayers.filter((p) => !p.removed)).toHaveLength(0);
  });
});

describe('endBackgroundAudio', () => {
  it('returns to the foreground mode and deactivates the audio session', async () => {
    await endBackgroundAudio();
    expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({ shouldPlayInBackground: false }));
    expect(setIsAudioActiveAsync).toHaveBeenCalledWith(false);
  });
});
