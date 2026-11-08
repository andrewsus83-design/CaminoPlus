// Plain-node checks of the pilgrim's notes: the anchors every note and bookmark is kept under, the note itself (what is stored, what is refused,
// what a damaged file does), the context a note is written with, the questions at the end of a day, the Notebook (grouping and search) and the
// Diary page a note grows into. No React, no React Native, no network. Run: npm run test:notes
import assert from 'node:assert/strict';
import {
  ANCHOR_MAX, blockAnchor, bookAnchor, bookLevel, bookPlaceOf, chapterAnchor, chapterOf, formatAnchor, parseAnchor, type Anchor,
} from '../anchor';
import { END_OF_DAY, isNotable, questionLines, quoteOf, reflectionPrompt } from '../blocks';
import { contextFor } from '../context';
import { diaryDraft } from '../diary';
import { groupNotes, noteRoute, noteWords, searchNotes, titlesOf, OTHER_NOTES_TITLE } from '../notebook';
import {
  NOTES_MAX, NOTES_TOTAL_MAX, NOTE_QUOTE_MAX, NOTE_TEXT_MAX, addNote, chapterNotes, clipQuote, editNote, localDate, normalizeContext, notesAt, packNotes, parseNote, parseNotes,
  reflectionAt, removeNote, type Note, type NewNote,
} from '../notes';
import {
  NOTEBOOK_EMPTY, NOTES_BLOCKED, NOTES_PRIVACY_LINE, NOTE_SHEET_PRIVACY, READER_HINT, noteDate, noteProblemMessage, notesLabel, notesResultsLine,
} from '../present';
import { BODY_MAX, TITLE_MAX } from '../../diary/store';
import type { Block, CatalogBook } from '../../library/books';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };

/* ================================================================ anchors */

check('a book, a chapter and a paragraph have anchors, and each parses back to what it was made of and formats back to the same text', () => {
  assert.equal(bookAnchor('camino-ingles-guide'), 'book:camino-ingles-guide');
  assert.equal(chapterAnchor('camino-ingles-guide', '02-is-this-camino-for-you'), 'book:camino-ingles-guide/02-is-this-camino-for-you');
  assert.equal(blockAnchor('imitation-of-christ-readings', '02-day-01-a-stranger-and-a-pilgrim', 7), 'book:imitation-of-christ-readings/02-day-01-a-stranger-and-a-pilgrim#7');
  assert.deepEqual(parseAnchor('book:camino-ingles-guide'), { kind: 'book', bookId: 'camino-ingles-guide', chapterId: null, block: null });
  assert.deepEqual(parseAnchor('book:a/00-welcome'), { kind: 'book', bookId: 'a', chapterId: '00-welcome', block: null });
  assert.deepEqual(parseAnchor('book:a/00-welcome#0'), { kind: 'book', bookId: 'a', chapterId: '00-welcome', block: 0 });
  assert.deepEqual(parseAnchor('book:a/00-welcome#1234'), { kind: 'book', bookId: 'a', chapterId: '00-welcome', block: 1234 });
  for (const s of ['book:a', 'book:a/00-x', 'book:a/00-x#0', 'book:a/00-x#42', 'book:camino-portugues-costero-guide/12-day-10-a-very-long-name-for-a-day#9999']) {
    const a = parseAnchor(s) as Anchor;
    assert.equal(a.kind, 'book', s);
    assert.equal(formatAnchor(a), s, `${s} round-trips`);
  }
});

check('an anchor of a kind this build does not know parses, is kept exactly as written, and is never taken for a place in a book', () => {
  const later = ['bible:web/john/3:16', 'daily:2026-11-08', 'stage:camino-frances/7', 'place:abc123', 'bible:psalms', 'music:chants', 'books:guide', 'future2:anything/at#all'];
  for (const s of later) {
    const a = parseAnchor(s);
    assert.deepEqual(a, { kind: 'other', raw: s }, s);
    assert.equal(formatAnchor(a as Anchor), s, `${s} comes back untouched`);
    assert.equal(bookPlaceOf(s), null, `${s} is not a place in a book`);
    assert.equal(chapterOf(s), s);
  }
  // a text that starts like a book anchor but is not one of its forms is kept as it is too, never "fixed"
  for (const s of ['book:x#3', 'book:x/y#03', 'book:X/y', 'book:a/b#', 'book:a/b/c', 'book:a//b', 'book:-a']) {
    assert.deepEqual(parseAnchor(s), { kind: 'other', raw: s }, s);
    assert.equal(formatAnchor(parseAnchor(s) as Anchor), s);
  }
});

check('what is not an anchor at all is null (never a throw): no kind, blanks, control characters, capitals in the kind, too long, not a string', () => {
  for (const junk of ['', 'garbage', 'bible', ':x', 'book:', 'a b:c', 'book:a b', 'Bible:x', '1book:x', 'book:a\n', 'book:a\u0000', ' book:a', 'x'.repeat(ANCHOR_MAX + 1), `book:${'a'.repeat(ANCHOR_MAX)}`, 5, null, undefined, {}, [], true]) {
    assert.equal(parseAnchor(junk), null, JSON.stringify(junk));
  }
  assert.ok(parseAnchor(`x:${'a'.repeat(ANCHOR_MAX - 2)}`), 'exactly the limit is an anchor');
  // the law: whatever parses formats back to the same text
  for (const s of ['book:a/b#1', 'bible:x', 'a:b', 'book:a/b#01', 'book:a/b#10000']) {
    const a = parseAnchor(s);
    if (a) assert.equal(formatAnchor(a), s);
  }
});

check('the level of a place, and the chapter a paragraph is in', () => {
  assert.equal(bookLevel(bookPlaceOf('book:a')!), 'book');
  assert.equal(bookLevel(bookPlaceOf('book:a/00-x')!), 'chapter');
  assert.equal(bookLevel(bookPlaceOf('book:a/00-x#3')!), 'paragraph');
  assert.equal(chapterOf('book:a/00-x#3'), 'book:a/00-x');
  assert.equal(chapterOf('book:a/00-x'), 'book:a/00-x');
  assert.equal(chapterOf('book:a'), 'book:a');
});

/* ================================================================ notes */

const NOW = new Date(2026, 10, 8, 20, 30, 0); // 8 November 2026, in the phone's own time zone
const later = (min: number) => new Date(NOW.getTime() + min * 60_000);
const input = (over: Partial<NewNote> = {}): NewNote => ({ id: 'n1', anchor: 'book:a/00-x#3', quote: 'The words it was made on.', text: 'My own words.', type: 'note', context: { date: '2026-11-08' }, ...over });
const mk = (over: Partial<Note> = {}): Note => ({ id: 'n1', anchor: 'book:a/00-x#3', quote: 'q', text: 't', type: 'note', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), context: { date: '2026-11-08' }, ...over });
const added = (list: Note[], over: Partial<NewNote> = {}, when = NOW): Note[] => {
  const res = addNote(list, input(over), when);
  assert.ok(res.ok, JSON.stringify(res));
  return res.ok ? res.notes : list;
};

check('a note is added in front with its anchor, its quote, its words, its time and its context; the list it was given is not changed', () => {
  const none: Note[] = [];
  const res = addNote(none, input({ text: '  My own words.  \n', quote: '  The   words\nit was made on.  ' }), NOW);
  assert.ok(res.ok);
  if (!res.ok) return;
  assert.deepEqual(none, [], 'the original list is untouched');
  assert.deepEqual(res.note, { id: 'n1', anchor: 'book:a/00-x#3', quote: 'The words it was made on.', text: 'My own words.', type: 'note', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), context: { date: '2026-11-08' } });
  const two = added(res.notes, { id: 'n2' }, later(5));
  assert.deepEqual(two.map((x) => x.id), ['n2', 'n1'], 'the newest in front');
});

check('a note is refused with a reason, never a throw: no words, too long, an anchor that is none, a list that is full, an id that is not fresh', () => {
  const reason = (list: Note[], over: Partial<NewNote>) => { const r = addNote(list, input(over), NOW); return r.ok ? 'ok' : r.reason; };
  assert.equal(reason([], { text: '' }), 'empty');
  assert.equal(reason([], { text: '   \n\t ' }), 'empty');
  assert.equal(reason([], { text: 'x'.repeat(NOTE_TEXT_MAX + 1) }), 'too-long');
  assert.equal(reason([], { text: 'x'.repeat(NOTE_TEXT_MAX) }), 'ok', 'exactly the limit is fine');
  assert.equal(reason([], { text: `${' '.repeat(50)}${'x'.repeat(NOTE_TEXT_MAX)}${' '.repeat(50)}` }), 'ok', 'blanks around the words do not count');
  assert.equal(reason([], { anchor: 'not an anchor' }), 'bad-anchor');
  assert.equal(reason([], { anchor: '' }), 'bad-anchor');
  assert.equal(reason([mk({ id: 'n1' })], { id: 'n1' }), 'not-saved');
  assert.equal(reason([], { id: '' }), 'not-saved');
  const many = Array.from({ length: NOTES_MAX }, (_, i) => mk({ id: `m${i}` }));
  assert.equal(reason(many, { id: 'extra' }), 'too-many');
  const heavy = Array.from({ length: Math.ceil(NOTES_TOTAL_MAX / NOTE_TEXT_MAX) }, (_, i) => mk({ id: `h${i}`, text: 'x'.repeat(NOTE_TEXT_MAX), quote: '' }));
  assert.equal(reason(heavy, { id: 'extra' }), 'full');
  assert.equal(reason(heavy, { id: 'extra', text: 'x' }) , 'full', 'a list past the cap takes nothing more, however small');
});

check('the quote is one line, at most NOTE_QUOTE_MAX characters, cut at a word with an ellipsis, and never cuts an emoji in half', () => {
  assert.equal(clipQuote('  a  b\n c '), 'a b c');
  assert.equal(clipQuote(''), '');
  assert.equal(clipQuote('x'.repeat(NOTE_QUOTE_MAX)), 'x'.repeat(NOTE_QUOTE_MAX), 'exactly the limit is not cut');
  const long = clipQuote(`${'word '.repeat(200)}`);
  assert.ok(long.length <= NOTE_QUOTE_MAX && long.endsWith('…') && !long.endsWith(' …'), long.slice(-20));
  const emoji = clipQuote(`${'a'.repeat(NOTE_QUOTE_MAX - 2)}😀😀😀`);
  assert.ok(emoji.length <= NOTE_QUOTE_MAX);
  assert.doesNotMatch(emoji, /[\ud800-\udbff](?![\udc00-\udfff])/, 'no half of a pair');
});

check('the context is a date that reads, a Camino slug that is one and a stage that is a whole number; anything else is dropped, never guessed', () => {
  assert.equal(localDate(NOW), '2026-11-08');
  assert.equal(localDate(new Date(2026, 0, 5)), '2026-01-05');
  assert.deepEqual(normalizeContext({ date: '2026-02-30x', caminoSlug: 'camino-frances', stage: 7 }, '2026-11-08'), { date: '2026-11-08', caminoSlug: 'camino-frances', stage: 7 });
  assert.deepEqual(normalizeContext({ date: '2026-11-01', caminoSlug: 'Not A Slug', stage: 0 }, '2026-11-08'), { date: '2026-11-01' });
  assert.deepEqual(normalizeContext({ date: '2026-11-01', stage: 1.5 }, 'f'), { date: '2026-11-01' });
  assert.deepEqual(normalizeContext({ date: '2026-11-01', stage: '7' }, 'f'), { date: '2026-11-01' });
  assert.deepEqual(normalizeContext({ date: '2026-11-01', stage: 1000 }, 'f'), { date: '2026-11-01' });
  for (const junk of [null, undefined, 'x', 5, [], {}]) assert.deepEqual(normalizeContext(junk, '2026-11-08'), { date: '2026-11-08' }, JSON.stringify(junk));
});

check('the context of a note written now: the day, and the Camino of the current journey when it has one; a stage is never filled in', () => {
  assert.deepEqual(contextFor(NOW, { route: { slug: 'camino-frances' } }), { date: '2026-11-08', caminoSlug: 'camino-frances' });
  assert.deepEqual(contextFor(NOW, null), { date: '2026-11-08' });
  assert.deepEqual(contextFor(NOW, undefined), { date: '2026-11-08' });
  assert.deepEqual(contextFor(NOW, {}), { date: '2026-11-08' });
  assert.deepEqual(contextFor(NOW, { route: null }), { date: '2026-11-08' });
  assert.deepEqual(contextFor(NOW, { route: { slug: null } }), { date: '2026-11-08' });
  assert.deepEqual(contextFor(NOW, { route: { slug: 'x y' } }), { date: '2026-11-08' }, 'a slug that is not one is left out');
  const withStageInJourney = { route: { slug: 'camino-frances' }, start_stage: { stage_number: 5, name: 'Somewhere' }, planned_start_date: '2026-11-01' } as never;
  assert.equal('stage' in contextFor(NOW, withStageInJourney), false, 'a start stage and a start date are not "the stage the pilgrim is on"');
});

check('a note is changed in place: its words and the time it was changed, never its anchor, quote, context or place in the list', () => {
  const list = added(added([], { id: 'a' }, NOW), { id: 'b', text: 'second' }, later(10));
  const res = editNote(list, 'a', '  New words.  ', later(60));
  assert.ok(res.ok);
  if (!res.ok) return;
  assert.deepEqual(res.notes.map((x) => x.id), ['b', 'a']);
  const a = res.notes[1];
  assert.equal(a.text, 'New words.');
  assert.equal(a.createdAt, NOW.toISOString());
  assert.equal(a.updatedAt, later(60).toISOString());
  assert.equal(a.anchor, 'book:a/00-x#3');
  assert.equal(a.quote, 'The words it was made on.');
  assert.deepEqual(a.context, { date: '2026-11-08' });
  assert.equal(list[1].text, 'My own words.', 'the list it was given is not changed');
  const same = editNote(list, 'a', 'My own words.', later(90));
  assert.ok(same.ok && same.note.updatedAt === NOW.toISOString(), 'the same words are not a change');
});

check('a change is refused with a reason: no such note, no words, too long, the list full (a note that is shortened can always be saved)', () => {
  const list = added([], { id: 'a' });
  const reason = (id: string, text: string, l: Note[] = list) => { const r = editNote(l, id, text, NOW); return r.ok ? 'ok' : r.reason; };
  assert.equal(reason('zzz', 'x'), 'not-found');
  assert.equal(reason('a', '  '), 'empty');
  assert.equal(reason('a', 'x'.repeat(NOTE_TEXT_MAX + 1)), 'too-long');
  const heavy = Array.from({ length: Math.ceil(NOTES_TOTAL_MAX / NOTE_TEXT_MAX) + 1 }, (_, i) => mk({ id: `h${i}`, text: 'x'.repeat(NOTE_TEXT_MAX), quote: '' }));
  assert.equal(reason('h0', 'y'.repeat(NOTE_TEXT_MAX), heavy), 'ok', 'as long as it was: allowed');
  assert.equal(reason('h0', 'short', heavy), 'ok', 'shorter: always allowed');
  const nearly = [mk({ id: 'p', text: 'x'.repeat(10), quote: '' }), ...Array.from({ length: Math.floor(NOTES_TOTAL_MAX / NOTE_TEXT_MAX) }, (_, i) => mk({ id: `h${i}`, text: 'x'.repeat(NOTE_TEXT_MAX), quote: '' }))];
  assert.equal(reason('p', 'x'.repeat(NOTE_TEXT_MAX), nearly), 'full', 'longer, and past the cap: refused');
});

check('a note is removed, and the list it was given is not changed', () => {
  const list = added(added([], { id: 'a' }), { id: 'b' }, later(1));
  assert.deepEqual(removeNote(list, 'a').map((x) => x.id), ['b']);
  assert.deepEqual(removeNote(list, 'nope').map((x) => x.id), ['b', 'a']);
  assert.equal(list.length, 2);
});

/* ---------------- what is stored */

check('what was packed reads back as it was, also through JSON as it is stored, and a note of an anchor kind this build does not know survives untouched', () => {
  const list = [
    mk({ id: 'a', anchor: 'bible:web/john/3:16', quote: 'For God so loved the world', text: 'On the Meseta.', createdAt: later(3).toISOString(), updatedAt: later(3).toISOString() }),
    mk({ id: 'b', anchor: 'book:a/00-x', type: 'reflection', context: { date: '2026-11-08', caminoSlug: 'camino-frances', stage: 12 }, createdAt: later(2).toISOString(), updatedAt: later(2).toISOString() }),
    mk({ id: 'c', anchor: 'stage:camino-frances/12', createdAt: later(1).toISOString(), updatedAt: later(1).toISOString() }),
  ];
  const stored = JSON.parse(JSON.stringify(packNotes(list)));
  assert.equal(stored.v, 1);
  assert.deepEqual(parseNotes(stored), list);
  assert.deepEqual(parseNotes(packNotes([])), []);
});

check('anything that is not a stored list is "start empty and do not write over it" (null), never a throw', () => {
  for (const junk of [undefined, null, 0, 1, 'x', true, [], { v: 2, items: [] }, { v: 1 }, { v: 1, items: 'x' }, { v: 1, items: {} }, { items: [] }, { v: '1', items: [] }]) assert.equal(parseNotes(junk), null, JSON.stringify(junk));
  assert.deepEqual(parseNotes({ v: 1, items: [] }), []);
});

check('a note that does not read is skipped, an id twice is kept once, the newest are first, and a missing or odd field is put right, not trusted', () => {
  const ok = { id: 'a', anchor: 'book:a/b#1', quote: 'q', text: 'words', type: 'note', createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z', context: { date: '2026-11-01' } };
  const list = parseNotes({ v: 1, items: [
    null, 7, 'x', {}, { ...ok, id: '' }, { ...ok, id: 5 }, { ...ok, id: 'x'.repeat(81) },
    { ...ok, id: 'e1', text: '' }, { ...ok, id: 'e2', text: '   ' }, { ...ok, id: 'e3', text: 7 },
    { ...ok, id: 'e4', anchor: 'nope' }, { ...ok, id: 'e5', anchor: 5 },
    { ...ok, id: 'e6', createdAt: 'soon', updatedAt: 'later' },
    ok, { ...ok, text: 'second copy of a' },
    { ...ok, id: 'b', createdAt: '2026-11-03T10:00:00.000Z', updatedAt: 'later', type: 'diary', quote: 9, context: 'x' },
    { ...ok, id: 'c', createdAt: 'x', updatedAt: '2026-11-02T10:00:00.000Z', type: 'reflection' },
  ] })!;
  assert.deepEqual(list.map((x) => x.id), ['b', 'c', 'a']);
  assert.equal(list[2].text, 'words', 'the first copy of an id is the one kept');
  assert.equal(list[0].type, 'note', 'a type that is not known is a note');
  assert.equal(list[0].quote, '');
  assert.equal(list[0].updatedAt, list[0].createdAt, 'a time that does not read is the other one');
  assert.deepEqual(list[0].context, { date: localDate(new Date('2026-11-03T10:00:00.000Z')) }, 'no context: the day it was written');
  assert.equal(list[1].createdAt, '2026-11-02T10:00:00.000Z');
  assert.equal(list[1].type, 'reflection');
  assert.equal(parseNote({ ...ok, text: 'x'.repeat(NOTE_TEXT_MAX + 50) })!.text.length, NOTE_TEXT_MAX, 'text from a damaged file is cut to the limit');
  assert.equal(parseNotes({ v: 1, items: Array.from({ length: NOTES_MAX + 40 }, (_, i) => ({ ...ok, id: `i${i}` })) })!.length, NOTES_MAX, 'a file that is too long is cut when it is read');
});

/* ---------------- choosing */

check('the notes of a place are the ones on exactly that anchor, oldest first (the order they were written is the order they read), of the kind asked for', () => {
  const list = [
    mk({ id: '3', anchor: 'book:a/00-x#3', createdAt: later(30).toISOString() }),
    mk({ id: '2', anchor: 'book:a/00-x#3', createdAt: later(20).toISOString() }),
    mk({ id: 'r', anchor: 'book:a/00-x', type: 'reflection', createdAt: later(25).toISOString() }),
    mk({ id: '4', anchor: 'book:a/00-x#31', createdAt: later(10).toISOString() }),
  ];
  assert.deepEqual(notesAt(list, 'book:a/00-x#3').map((x) => x.id), ['2', '3']);
  assert.deepEqual(notesAt(list, 'book:a/00-x', 'reflection').map((x) => x.id), ['r']);
  assert.deepEqual(notesAt(list, 'book:a/00-x', 'note'), []);
  assert.equal(reflectionAt(list, 'book:a/00-x')?.id, 'r');
  assert.equal(reflectionAt(list, 'book:a/00-y'), null);
  const two = [...list, mk({ id: 'r2', anchor: 'book:a/00-x', type: 'reflection', createdAt: later(99).toISOString() })];
  assert.equal(reflectionAt(two, 'book:a/00-x')?.id, 'r2', 'a day with two reflections shows the newest');
});

check('what a chapter shows: the notes on the whole chapter, the reflection of the day, and the notes of each paragraph by block, for that book and that chapter only', () => {
  const list = [
    mk({ id: 'p1', anchor: 'book:a/00-x#3', createdAt: later(2).toISOString() }),
    mk({ id: 'p0', anchor: 'book:a/00-x#3', createdAt: later(1).toISOString() }),
    mk({ id: 'p9', anchor: 'book:a/00-x#9' }),
    mk({ id: 'c', anchor: 'book:a/00-x' }),
    mk({ id: 'r', anchor: 'book:a/00-x', type: 'reflection', createdAt: later(5).toISOString() }),
    mk({ id: 'other-chapter', anchor: 'book:a/01-y#3' }),
    mk({ id: 'other-book', anchor: 'book:b/00-x#3' }),
    mk({ id: 'bible', anchor: 'bible:web/john/3:16' }),
  ];
  const here = chapterNotes(list, 'a', '00-x');
  assert.deepEqual(here.chapter.map((x) => x.id), ['c']);
  assert.equal(here.reflection?.id, 'r');
  assert.deepEqual(Object.keys(here.blocks).sort(), ['3', '9']);
  assert.deepEqual(here.blocks[3].map((x) => x.id), ['p0', 'p1']);
  assert.deepEqual(chapterNotes(list, 'a', '99-none'), { chapter: [], reflection: null, blocks: {} });
});

/* ================================================================ blocks and the questions of a day */

const sp = (t: string) => [{ t }];
const P = (t: string): Block => ({ t: 'p', spans: sp(t) });
const H = (t: string, level = 2): Block => ({ t: 'h', level, spans: sp(t) });
const UL = (...items: string[]): Block => ({ t: 'ul', items: items.map(sp) });

const DAY: Block[] = [
  P('*What do you carry?*'), H('The passage'), { t: 'quote', paras: [sp('If thou wilt stand fast.')], cite: sp('Thomas à Kempis') },
  H('Reflection'), P('There is a moment.'), H('For the walk'), UL('One question for the hour.', 'One small practice.'),
  H(END_OF_DAY), P('You have arrived somewhere.'), P('Three small questions:'), UL('Where did I feel like a guest?', 'What did I carry that I did not need?', 'What was given to me?'), P('An honest word about tiredness.'),
  H('A short prayer'), P('Tonight I am a guest.'),
];

check('a paragraph, a quote and a list can carry a note; a heading and a break cannot', () => {
  assert.equal(isNotable(P('Words.')), true);
  assert.equal(isNotable(DAY[2]), true);
  assert.equal(isNotable(UL('a')), true);
  assert.equal(isNotable({ t: 'ol', items: [sp('a')] }), true);
  assert.equal(isNotable(H('A heading')), false);
  assert.equal(isNotable({ t: 'hr' }), false);
  assert.equal(isNotable(P('   ')), false, 'no words: nothing to anchor a note on');
  assert.equal(isNotable(undefined), false);
});

check('the quote of a block is its words on one line, cut short', () => {
  assert.equal(quoteOf(P('A  short\nparagraph.')), 'A short paragraph.');
  assert.equal(quoteOf({ t: 'quote', paras: [sp('First.'), sp('Second.')], cite: sp('Someone') }), 'First. Second.', 'a quote is its own words, not the attribution');
  assert.equal(quoteOf(UL('one', 'two')), 'one two');
  assert.equal(quoteOf(undefined), '');
  assert.ok(quoteOf(P('word '.repeat(300))).length <= NOTE_QUOTE_MAX);
});

check('the end of a day: its heading, its last list as the questions, and where the part stops; a chapter without it has no prompt', () => {
  const p = reflectionPrompt(DAY)!;
  assert.equal(p.headingIndex, 7);
  assert.equal(p.listIndex, 10, 'the list of the evening, not the one "For the walk"');
  assert.equal(p.endIndex, 12, 'the part stops at the next heading, "A short prayer"');
  assert.equal(p.questions.length, 3);
  assert.deepEqual(questionLines(p), ['Where did I feel like a guest?', 'What did I carry that I did not need?', 'What was given to me?']);
  assert.equal(reflectionPrompt([P('A guide.'), H('Chapter'), UL('a', 'b')]), null);
  assert.equal(reflectionPrompt([]), null);
  assert.equal(reflectionPrompt([H(END_OF_DAY, 3), UL('a')]), null, 'only the level 2 heading of the day counts');
  assert.deepEqual(reflectionPrompt([H('AT THE END OF THE DAY'), UL('q?')])?.questions.length, 1, 'case does not matter');
  const none = reflectionPrompt([H(END_OF_DAY), P('Only words.'), H('A short prayer'), UL('not a question of the evening')])!;
  assert.equal(none.listIndex, null, 'a list after the next heading is not the questions');
  assert.equal(none.endIndex, 2, 'a part without its list still has an end, where the button goes');
  assert.equal(reflectionPrompt([H(END_OF_DAY), P('Only words.')])!.endIndex, 2, 'a last part ends with the chapter');
  assert.deepEqual(none.questions, []);
  const numbered = reflectionPrompt([H(END_OF_DAY), { t: 'ol', items: [sp('one?'), sp('two?')] }])!;
  assert.equal(numbered.questions.length, 2, 'a numbered list is a list too');
});

/* ================================================================ the Notebook */

const book = (id: string, order: number, title: string, chapters: [string, string][]): CatalogBook => ({
  id, kind: 'guide', order, title, subtitle: `The subtitle of ${title}`, description: 'D', words: 100, minutes: 1, cover: { colour: 'goldSoft', icon: 'library' },
  chapters: chapters.map(([cid, t]) => ({ id: cid, title: t, minutes: 1 })),
});
const CATALOG: CatalogBook[] = [
  book('second', 2, 'Second Book', [['00-start', 'Start'], ['01-end', 'End']]),
  book('first', 1, 'First Book', [['00-welcome', 'Welcome'], ['01-road', 'The road'], ['02-day-01-x', 'Day 1. Setting out']]),
];

check('the Notebook groups by book in the order of the catalog, then by chapter in the order of the book, the whole chapter first, then paragraphs from the top; no dates in the order', () => {
  const list = [
    mk({ id: 'b-end', anchor: 'second:x' }),
    mk({ id: 'a1', anchor: 'book:first/01-road#9', createdAt: later(1).toISOString() }),
    mk({ id: 'a2', anchor: 'book:first/01-road#2', createdAt: later(50).toISOString() }),
    mk({ id: 'a3', anchor: 'book:first/01-road', createdAt: later(99).toISOString() }),
    mk({ id: 'a4', anchor: 'book:first/00-welcome#0', createdAt: later(30).toISOString() }),
    mk({ id: 'a5', anchor: 'book:first/02-day-01-x', type: 'reflection', createdAt: later(31).toISOString() }),
    mk({ id: 's1', anchor: 'book:second/01-end#1', createdAt: later(2).toISOString() }),
    mk({ id: 's2', anchor: 'book:second' }),
    mk({ id: 'gone', anchor: 'book:withdrawn/00-x#1' }),
    mk({ id: 'bible', anchor: 'bible:web/john/3:16', createdAt: later(7).toISOString() }),
  ];
  const groups = groupNotes(list, CATALOG);
  assert.deepEqual(groups.map((g) => g.title), ['First Book', 'Second Book', OTHER_NOTES_TITLE], 'catalog order (order 1 before 2), the notes that cannot be placed last');
  const first = groups[0];
  assert.deepEqual(first.chapters.map((c) => c.title), ['Welcome', 'The road', 'Day 1. Setting out'], 'the order of the book, not of the time');
  assert.deepEqual(first.chapters[1].notes.map((x) => x.id), ['a3', 'a2', 'a1'], 'the whole chapter first, then the paragraphs from the top of the text down');
  assert.equal(first.subtitle, 'The subtitle of First Book');
  const second = groups[1];
  assert.deepEqual(second.chapters.map((c) => c.title), ['The whole book', 'End']);
  assert.deepEqual(second.chapters[0].notes.map((x) => x.id), ['s2']);
  const other = groups[2];
  assert.equal(other.bookId, null);
  assert.deepEqual(other.chapters[0].notes.map((x) => x.id), ['b-end', 'gone', 'bible'], 'in the order they were written (a tie by id)');
  assert.deepEqual(groupNotes([], CATALOG), []);
  assert.equal(list.length, 10, 'the notes it was given are not changed');
});

check('a note on a chapter that a new edition does not have stays visible, after the chapters it does have', () => {
  const groups = groupNotes([mk({ id: 'x', anchor: 'book:first/09-old-chapter#1' }), mk({ id: 'y', anchor: 'book:first/00-welcome#1' })], CATALOG);
  assert.deepEqual(groups[0].chapters.map((c) => c.title), ['Welcome', 'A chapter that is not in this edition']);
});

check('searching the Notebook uses the Library\'s words: its own words, the words it was made on, the book and the chapter; case, accents and punctuation do not matter', () => {
  const list = [
    mk({ id: 'a', anchor: 'book:first/01-road#2', quote: 'Keep thine heart free', text: 'Open hand, not clenched fist.' }),
    mk({ id: 'b', anchor: 'book:second/00-start#1', quote: 'Q', text: 'Nájera was lovely.' }),
    mk({ id: 'c', anchor: 'book:first/02-day-01-x', type: 'reflection', quote: 'Day 1. Setting out', text: 'Tired and glad.' }),
  ];
  const ids = (q: string) => searchNotes(list, q, CATALOG).map((x) => x.id);
  assert.deepEqual(ids('clenched'), ['a']);
  assert.deepEqual(ids('CLENCH'), ['a'], 'a word that is started counts');
  assert.deepEqual(ids('najera'), ['b'], 'accents do not matter');
  assert.deepEqual(ids('heart'), ['a'], 'the words it was made on');
  assert.deepEqual(ids('second book'), ['b'], 'the book');
  assert.deepEqual(ids('the road'), ['a'], 'the chapter');
  assert.deepEqual(ids('reflection'), ['c'], 'a reflection is found by that word');
  assert.deepEqual(ids('open hand'), ['a'], 'every word has to start a word of the note');
  assert.deepEqual(ids('open nonsense'), []);
  assert.deepEqual(ids('hand ray'), [], 'the middle of a word is not the start of one');
  for (const q of ['', '   ', '...', '“”']) assert.deepEqual(ids(q), [], JSON.stringify(q));
  assert.ok(noteWords(list[0], CATALOG).includes('road'));
});

check('where a note is: the reader at its chapter and paragraph, the book\'s own screen for a note on the book, and nowhere for what the app does not have', () => {
  assert.equal(noteRoute({ anchor: 'book:first/01-road#2' }, CATALOG), '/library/book/first/01-road?block=2');
  assert.equal(noteRoute({ anchor: 'book:first/01-road' }, CATALOG), '/library/book/first/01-road');
  assert.equal(noteRoute({ anchor: 'book:first' }, CATALOG), '/library/book/first');
  assert.equal(noteRoute({ anchor: 'book:first/09-gone#1' }, CATALOG), null);
  assert.equal(noteRoute({ anchor: 'book:gone/00-x#1' }, CATALOG), null);
  assert.equal(noteRoute({ anchor: 'bible:web/john/3:16' }, CATALOG), null);
  assert.deepEqual(titlesOf({ anchor: 'book:first/01-road#2' }, CATALOG), { book: 'First Book', chapter: 'The road' });
  assert.deepEqual(titlesOf({ anchor: 'book:first' }, CATALOG), { book: 'First Book', chapter: null });
  assert.deepEqual(titlesOf({ anchor: 'daily:2026-11-08' }, CATALOG), { book: null, chapter: null });
});

/* ================================================================ the Diary page a note grows into */

check('a note grows into a Diary page: the chapter or day as its title, the words it was made on as a quote line, then the pilgrim\'s words, within the Diary\'s limits', () => {
  const note = { quote: 'There is a moment, somewhere between your door and the first arrow.', text: 'This is how I felt.\nExactly.', type: 'note' as const };
  assert.deepEqual(diaryDraft(note, { book: 'The Quiet Road', chapter: 'Day 1. A stranger and a pilgrim' }), {
    title: 'Day 1. A stranger and a pilgrim',
    body: '> There is a moment, somewhere between your door and the first arrow.\n\nThis is how I felt.\nExactly.',
  });
  assert.equal(diaryDraft(note, { book: 'The Quiet Road' }).title, 'The Quiet Road');
  assert.equal(diaryDraft(note, {}).title, 'A note from a book');
  assert.equal(diaryDraft({ ...note, type: 'reflection' }, { chapter: 'Day 1. A stranger' }).title, 'Reflection: Day 1. A stranger');
  assert.equal(diaryDraft({ ...note, type: 'reflection', quote: 'Day 1. A stranger' }, { chapter: 'Day 1. A stranger' }).body, 'This is how I felt.\nExactly.', 'a reflection has no quote line: the title already names the day');
  assert.equal(diaryDraft({ ...note, quote: '' }, {}).body, 'This is how I felt.\nExactly.', 'no quote, no quote line');
  assert.ok(diaryDraft(note, { chapter: 'x'.repeat(500) }).title.length <= TITLE_MAX);
  const huge = diaryDraft({ quote: 'q'.repeat(NOTE_QUOTE_MAX), text: 'x'.repeat(BODY_MAX), type: 'note' }, {});
  assert.ok(huge.body.length <= BODY_MAX, 'never longer than a page of the Diary holds');
  assert.equal(huge.body, 'x'.repeat(BODY_MAX), 'it is the quote that gives way, never the pilgrim\'s words');
});

/* ================================================================ the words */

check('the words say what the app does: only on this phone, nothing uploaded or shared, what clears them; plain, calm, and "pilgrim", never "user"', () => {
  assert.match(NOTES_PRIVACY_LINE, /^Only on this phone\./);
  assert.match(NOTES_PRIVACY_LINE, /not uploaded and not shared/);
  assert.match(NOTES_PRIVACY_LINE, /Logging out clears them/);
  assert.match(NOTES_PRIVACY_LINE, /lose this phone, they are gone/);
  assert.match(NOTE_SHEET_PRIVACY, /Only on this phone/);
  assert.match(NOTE_SHEET_PRIVACY, /Logging out clears your notes/);
  assert.match(READER_HINT, /Notes stay on this phone/);
  const all = [NOTES_PRIVACY_LINE, NOTE_SHEET_PRIVACY, READER_HINT, NOTEBOOK_EMPTY, NOTES_BLOCKED,
    ...(['empty', 'too-long', 'too-many', 'full', 'bad-anchor', 'not-found', 'blocked', 'not-saved'] as const).map(noteProblemMessage)];
  for (const t of all) {
    assert.doesNotMatch(t, /\b(users?|customers?)\b/i, t);
    assert.doesNotMatch(t, /!/, `no shouting: ${t}`);
    assert.doesNotMatch(t, /\b(revolutionary|game-changing|amazing|awesome|ai-powered)\b/i, t);
    assert.doesNotMatch(t, /\b(likes|followers|feed|timeline)\b/i, `nothing social: ${t}`);
  }
  assert.match(noteProblemMessage('too-long'), new RegExp(String(NOTE_TEXT_MAX).replace(/(\d)(?=(\d{3})+$)/g, '$1,')));
  assert.match(noteProblemMessage('not-saved'), /Your words are still here/);
  assert.equal(notesLabel(1), '1 note');
  assert.equal(notesLabel(3), '3 notes');
  assert.equal(notesResultsLine(2, 'road'), '2 notes for “road”');
  assert.equal(notesResultsLine(1, 'road'), '1 note for “road”');
  assert.equal(notesResultsLine(0, '  zzz   qqq '), 'Nothing found for “zzz qqq”');
  assert.ok(notesResultsLine(0, 'q'.repeat(300)).length < 80);
  assert.equal(noteDate('2026-11-08T10:00:00', new Date(2026, 5, 1)), 'Sunday 8 November');
  assert.equal(noteDate('2025-11-08T10:00:00', new Date(2026, 5, 1)), 'Saturday 8 November 2025');
  assert.equal(noteDate('not a date'), '');
});

console.log(`${n} of ${n} passed`);
