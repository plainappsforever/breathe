import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class StartWidgetModule extends NativeModule {
  /** Stores today's minutes (for the local day starting at dayStartMs) and redraws placed widgets. */
  setTodayMinutes(dayStartMs: number, minutes: number): void;
  widgetCount(): number;
  canPinWidget(): boolean;
  requestPinWidget(): 'requested' | 'alreadyAdded' | 'unsupported';
}

/** Android only; null on iOS and in tests. */
export default requireOptionalNativeModule<StartWidgetModule>('StartWidget');
