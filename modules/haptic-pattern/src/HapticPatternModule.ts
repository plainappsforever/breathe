import { NativeModule, requireNativeModule } from 'expo';

import type { HapticCapabilities, HapticCueKind } from './HapticPattern.types';

declare class HapticPatternModule extends NativeModule<{}> {
  play(kind: HapticCueKind, durationMs: number, strength: number): void;
  stop(): void;
  capabilities(): HapticCapabilities;
}

export default requireNativeModule<HapticPatternModule>('HapticPattern');
