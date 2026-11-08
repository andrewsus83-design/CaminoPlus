// The logic behind bookText.ts, with the index and the loaders handed in, so that plain node can test it without Metro (the real index and
// the real loaders are JSON assets that only Metro can require). Pure: no React, no React Native, no files.
import type { BookText, BookTextIndexEntry } from './bookTextTypes';

export type BookTextLoaders = Readonly<Record<string, () => BookText>>;

export type BookTextApi = {
  /** The books that have text, in the order of the catalogue. */
  index: readonly BookTextIndexEntry[];
  hasBookText: (id: string) => boolean;
  /** The whole text of a book. Synchronous (the text is in the app). Throws Error(`no text for ${id}`) for a book that has none. */
  loadBookText: (id: string) => BookText;
};

export function makeBookTextApi(index: readonly BookTextIndexEntry[], loaders: BookTextLoaders): BookTextApi {
  const ids = new Set(index.map((e) => e.id));
  const hasBookText = (id: string): boolean => ids.has(id) && Object.prototype.hasOwnProperty.call(loaders, id);
  const loadBookText = (id: string): BookText => {
    if (!hasBookText(id)) throw new Error(`no text for ${id}`);
    return loaders[id]();
  };
  return { index, hasBookText, loadBookText };
}
