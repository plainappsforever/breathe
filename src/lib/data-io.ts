// The only place that touches files and the share sheet (V3 P5). Kept thin: the content is built by
// `export.ts`, so everything worth testing is tested there.

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { withLockHeldOpen } from './history-lock';

export type FileKind = 'csv' | 'json';

const KINDS: Record<FileKind, { mimeType: string; uti: string }> = {
  csv: { mimeType: 'text/csv', uti: 'public.comma-separated-values-text' },
  json: { mimeType: 'application/json', uti: 'public.json' },
};

export type ShareResult = { shared: true } | { shared: false; savedAs: string };

/**
 * Writes `content` to a file in the app's cache and opens the share sheet for it. If sharing is not available
 * the file is kept in the app's documents folder instead and its name is returned.
 */
export async function shareTextFile(fileName: string, content: string, kind: FileKind): Promise<ShareResult> {
  const { mimeType, uti } = KINDS[kind];
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(content);
  if (await Sharing.isAvailableAsync()) {
    await withLockHeldOpen(() => Sharing.shareAsync(file.uri, { mimeType, UTI: uti, dialogTitle: 'Breathe Well' }));
    return { shared: true };
  }
  const kept = new File(Paths.document, fileName);
  kept.create({ overwrite: true });
  kept.write(content);
  return { shared: false, savedAs: fileName };
}

/** Opens the system file picker (any file; the content is checked afterwards). null = the user cancelled. */
export async function pickTextFile(): Promise<string | null> {
  const picked = await withLockHeldOpen(() => File.pickFileAsync());
  if (picked.canceled) return null;
  return picked.result.text();
}
