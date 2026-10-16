import { NativeModule, registerWebModule } from 'expo';

import type { HapticCapabilities, HapticCueKind } from './HapticPattern.types';

class HapticPatternModule extends NativeModule<{}> {
  play(_kind: HapticCueKind, _durationMs: number, _strength: number): void {
    // No Web Vibration ramp API; the app falls back to no haptics on web (not a shipped target).
  }
  stop(): void {}
  capabilities(): HapticCapabilities {
    return { ramps: false };
  }
}

export default registerWebModule(HapticPatternModule, 'HapticPatternModule');
