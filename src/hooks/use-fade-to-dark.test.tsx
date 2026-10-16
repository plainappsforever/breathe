// v3.1 F4 (REVIEW_V3 #6): coming back to a running session arms fade-to-dark again.
import { act, useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import * as Brightness from 'expo-brightness';

import { useFadeToDark } from './use-fade-to-dark';

jest.mock('expo-brightness', () => ({
  getBrightnessAsync: jest.fn(() => Promise.resolve(0.8)),
  setBrightnessAsync: jest.fn(() => Promise.resolve()),
  restoreSystemBrightnessAsync: jest.fn(() => Promise.resolve()),
}));

const mockAppStateListeners: ((state: AppStateStatus) => void)[] = [];
const probe: { latest: { dimmed: boolean; poke: () => void } | null } = { latest: null };

function Probe({ enabled, active }: { enabled: boolean; active: boolean }) {
  const result = useFadeToDark(enabled, active, 3);
  useEffect(() => {
    probe.latest = result;
  });
  return null;
}

async function flush(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function sendAppState(state: AppStateStatus) {
  act(() => {
    for (const listener of mockAppStateListeners) listener(state);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockAppStateListeners.length = 0;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    mockAppStateListeners.push(listener as (state: AppStateStatus) => void);
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  (Brightness.setBrightnessAsync as jest.Mock).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useFadeToDark', () => {
  it('fades after the delay, restores on leaving, and fades again after coming back to a running session', async () => {
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(<Probe enabled active />);
    });
    await flush(3100);
    expect(probe.latest?.dimmed).toBe(true);
    expect(Brightness.setBrightnessAsync).toHaveBeenLastCalledWith(0.05);

    sendAppState('background');
    expect(probe.latest?.dimmed).toBe(false);
    expect(Brightness.setBrightnessAsync).toHaveBeenLastCalledWith(0.8);

    sendAppState('active');
    await flush(3100);
    expect(probe.latest?.dimmed).toBe(true);
    act(() => renderer?.unmount());
  });

  it('does not arm the fade on return when no session runs', async () => {
    act(() => {
      create(<Probe enabled active={false} />);
    });
    sendAppState('background');
    sendAppState('active');
    await flush(5000);
    expect(probe.latest?.dimmed).toBe(false);
    expect(Brightness.setBrightnessAsync).not.toHaveBeenCalledWith(0.05);
  });
});
