import { NativeModule, requireOptionalNativeModule } from 'expo';

export type AddTileResult = 'added' | 'alreadyAdded' | 'notAdded' | 'unsupported' | `error:${number}`;

declare class QuickTileModule extends NativeModule {
  /** Android 13+ can show the system "Add tile" dialog. */
  canRequestAddTile(): boolean;
  requestAddTile(): Promise<AddTileResult>;
}

/** Android only; null on iOS and in tests. */
export default requireOptionalNativeModule<QuickTileModule>('QuickTile');
