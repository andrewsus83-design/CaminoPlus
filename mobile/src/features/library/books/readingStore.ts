import { localStore } from '@/lib/localStore';
import { SIZE_NAME, packStep, parseStep, DEFAULT_STEP } from './readerType';
import { emptyReading, packReading, parseReading, type StoredReading } from './reading';

// Where the places of the reader are read from and written to: the phone's key-value store (lib/localStore.ts), and nothing else. What a place
// is, and what is done with one, is in reading.ts; useBooksReading.ts and useReadingWriter.ts hand this to React.
//
// Writes go one after the other, and a read waits for the writes before it. The reader of one chapter is left (and writes its place) while the
// reader of the next one is opened (and reads it): without the queue the second could read what was there before the first had written.
// Nothing here throws: a place that cannot be read is no place, a write that fails is dropped (a place is a convenience, never a reason for an error).

let queue: Promise<unknown> = Promise.resolve();

/** The places kept under this key (`u.<userId>.library.reading`), or none. Waits for every write made before. */
export async function loadReading(key: string): Promise<StoredReading> {
  await queue;
  return parseReading(await localStore.getJSON<unknown>(key)) ?? emptyReading();
}

/** Keeps these places under this key. Resolves when they are written (or could not be: a full disk). */
export function saveReading(key: string, reading: StoredReading): Promise<boolean> {
  const done = queue.then(() => localStore.setJSON(key, packReading(reading)));
  queue = done.catch(() => false);
  return done;
}

/** The text size chosen on this phone. It belongs to the phone and not to a person, so it is not under a `u.<userId>.` key and logging out does not wipe it. */
export async function loadSize(): Promise<number> {
  await queue;
  return parseStep(await localStore.getJSON<unknown>(SIZE_NAME)) ?? DEFAULT_STEP;
}

export function saveSize(step: number): Promise<boolean> {
  const done = queue.then(() => localStore.setJSON(SIZE_NAME, packStep(step)));
  queue = done.catch(() => false);
  return done;
}
