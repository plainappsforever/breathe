// What the session screen does when the app leaves the screen (v3.1). Pure, so the rules are tested apart from
// the screen (REVIEW_V3 #4, #5).

export type LeaveAction = 'pause' | 'confirm' | 'restartCountdown' | 'none';

/**
 * The app went to the background while a session runs (or its countdown). With "Keep guiding when locked" the guidance goes on (iOS
 * background audio, Android native runner): confirm the progress for crash recovery. Without it nothing guides
 * any more, so the session pauses instead of counting unguided time (it used to "finish" in the background).
 */
export function leaveAction(screenPhase: string, guidesInBackground: boolean): LeaveAction {
  // During the get-ready countdown (REVIEW_V3 #5): with locked mode the guidance is already armed and starts on
  // time; without it nothing could guide, so the countdown is stopped and starts again when the app comes back.
  if (screenPhase === 'settling') return guidesInBackground ? 'none' : 'restartCountdown';
  if (screenPhase !== 'running') return 'none';
  return guidesInBackground ? 'confirm' : 'pause';
}
