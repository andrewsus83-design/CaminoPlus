// Plain-node checks of the rich text of a diary page (richtext.ts): the small Markdown-style subset that is kept in the body, how
// it is read for drawing and for previews, and what the toolbar above the keyboard does to a selection: bold and italic, heading,
// bullet and quote, and the Return key in a list. Hand-picked cases, then thousands of random strings that must never make any
// of it throw, change a word, or leave a selection in the middle of an emoji. No React Native. Run: npm run test:diary
import assert from 'node:assert/strict';
import { continueList, formatsAt, parseRich, plainText, toggleBlock, toggleInline, type Block, type Edit, type Sel } from '../richtext';

let n = 0;
const test = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };

const S = (start: number, end = start): Sel => ({ start, end });
/** The selection of `word` inside `text` (the first one). */
const on = (text: string, word: string): Sel => { const i = text.indexOf(word); assert.ok(i >= 0, `"${word}" is in "${text}"`); return S(i, i + word.length); };
const b = (spans: [string, string?][]) => spans.map(([text, f = '']) => ({ text, bold: f.includes('b'), italic: f.includes('i') }));
/** One block, written short: kind and spans, a span being [text, 'b' | 'i' | 'bi']. */
const blk = (kind: Block['kind'], ...spans: [string, string?][]): Block => ({ kind, spans: b(spans) });
const sliceSel = (e: Edit) => e.text.slice(e.selection.start, e.selection.end);
const must = (e: Edit | null): Edit => { assert.ok(e, 'an edit was expected'); return e as Edit; };

/* ------------------------------------------------------------------------------------------------ reading */

test('nothing, or something that is not text, reads as nothing and never throws', () => {
  for (const v of [undefined, null, 0, 42, true, {}, [], ['**a**'], () => 1, Symbol('x'), NaN, '']) {
    assert.deepEqual(parseRich(v), [], String(typeof v));
    assert.equal(plainText(v), '');
  }
});

test('bold, italic, both, and plain text around them', () => {
  assert.deepEqual(parseRich('a **b** c'), [blk('p', ['a '], ['b', 'b'], [' c'])]);
  assert.deepEqual(parseRich('a _b_ c'), [blk('p', ['a '], ['b', 'i'], [' c'])]);
  assert.deepEqual(parseRich('**_both_**'), [blk('p', ['both', 'bi'])]);
  assert.deepEqual(parseRich('_**both**_'), [blk('p', ['both', 'bi'])]);
  assert.deepEqual(parseRich('**bold _and italic_ more**'), [blk('p', ['bold ', 'b'], ['and italic', 'bi'], [' more', 'b'])]);
  assert.deepEqual(parseRich('_italic **and bold** more_'), [blk('p', ['italic ', 'i'], ['and bold', 'bi'], [' more', 'i'])]);
  assert.deepEqual(parseRich('**a** and **b**'), [blk('p', ['a', 'b'], [' and '], ['b', 'b'])]);
  assert.deepEqual(parseRich('**a****b**'), [blk('p', ['ab', 'b'])], 'two runs side by side read as one');
});

test('a pair of marks only counts when it hugs its text, closes on the same line and is not already open; anything else is plain text, kept as typed', () => {
  const plain = (s: string) => assert.deepEqual(parseRich(s), [blk('p', [s])], s);
  for (const s of ['** a**', '**a **', '**a', 'a**', '**', '****', '*', '***', '*a*', 'a * b * c', '_ a_', '_a _', '_a', 'a_', '_', '__', '__a', '_ _', '2 * 3 * 4', '**a **']) plain(s);
  assert.deepEqual(parseRich('**a\nb**'), [blk('p', ['**a']), blk('p', ['b**'])], 'a mark never crosses a line');
  assert.deepEqual(parseRich('**bold **x** end**'), [blk('p', ['bold **x', 'b'], [' end**'])], 'a mark of a kind already open is just text');
  assert.deepEqual(parseRich('**a _b** c_'), [blk('p', ['a _b', 'b'], [' c_'])], 'marks that cross: the first to close wins, the other stays text');
  assert.deepEqual(parseRich('_a_ _b'), [blk('p', ['a', 'i'], [' _b'])]);
  assert.deepEqual(parseRich('**x** _'), [blk('p', ['x', 'b'], [' _'])]);
});

test('an underscore beside a letter is an underscore: names, addresses and file names are not italic', () => {
  for (const s of ['ana_torres_88', 'snake_case_name', 'write to ana_torres_88@mail.com', 'IMG_2041_final.jpg', 'a_b_', '_a_b', 'x_y z_w', 'ñ_ñ_ñ']) assert.deepEqual(parseRich(s), [blk('p', [s])], s);
  assert.deepEqual(parseRich('(_a_)'), [blk('p', ['('], ['a', 'i'], [')'])]);
  assert.deepEqual(parseRich('_a_, _b_.'), [blk('p', ['a', 'i'], [', '], ['b', 'i'], ['.'])]);
  assert.deepEqual(parseRich('"_quoted_"'), [blk('p', ['"'], ['quoted', 'i'], ['"'])]);
  assert.deepEqual(parseRich('a**b**c'), [blk('p', ['a'], ['b', 'b'], ['c'])], 'bold may sit inside a word');
});

test('block marks: a heading, bullets (- and *), a quote, and gaps; a mark needs its space and the very start of the line', () => {
  assert.deepEqual(parseRich('# Roncesvalles\n- one\n* two\n> a quote\n\nplain'), [
    blk('h', ['Roncesvalles']), blk('li', ['one']), blk('li', ['two']), blk('q', ['a quote']), blk('gap'), blk('p', ['plain']),
  ]);
  for (const s of ['#nospace', '-nospace', '>quote', ' # indented', ' - indented', '#', '-', '>', '## two levels', '--', '- -', '1. one']) {
    const [only] = parseRich(s);
    assert.ok(parseRich(s).length === 1 && (only.kind === 'p' || (only.kind === 'li' && s === '- -')), `${s} -> ${only.kind}`);
  }
  assert.deepEqual(parseRich('## two'), [blk('p', ['## two'])]);
  assert.deepEqual(parseRich('> **bold quote**'), [blk('q', ['bold quote', 'b'])]);
  assert.deepEqual(parseRich('# _italic head_'), [blk('h', ['italic head', 'i'])]);
  assert.deepEqual(parseRich('- **x** y'), [blk('li', ['x', 'b'], [' y'])]);
  assert.deepEqual(parseRich('> - not a list'), [blk('q', ['- not a list'])], 'blocks do not nest');
  assert.deepEqual(parseRich('- \n# \n> \n-  \n'), [blk('gap'), blk('gap'), blk('gap'), blk('gap'), blk('gap')], 'a mark with nothing after it draws nothing');
  assert.deepEqual(parseRich('   \n\t'), [blk('gap'), blk('gap')]);
});

test('every line break is a line: one block per line, also with Windows line breaks', () => {
  assert.equal(parseRich('a\n\n\nb').length, 4);
  assert.equal(parseRich('a\r\nb\r\n').length, 3);
  assert.deepEqual(parseRich('**a**\r\n- b\r\n'), [blk('p', ['a', 'b']), blk('li', ['b']), blk('gap')]);
  for (const t of ['a\nb', 'a\r\nb', '\n', '\n\n', 'x\n']) for (const bl of parseRich(t)) for (const s of bl.spans) assert.doesNotMatch(s.text, /[\r\n]/);
});

test('emoji and every script read through the marks untouched', () => {
  assert.deepEqual(parseRich('**🙏**'), [blk('p', ['🙏', 'b'])]);
  assert.deepEqual(parseRich('_café_ **naïve**'), [blk('p', ['café', 'i'], [' '], ['naïve', 'b'])]);
  assert.deepEqual(parseRich('**日本語** と _ひらがな_'), [blk('p', ['日本語', 'b'], [' と '], ['ひらがな', 'i'])]);
  assert.deepEqual(parseRich('**שלום** _مرحبا_'), [blk('p', ['שלום', 'b'], [' '], ['مرحبا', 'i'])]);
  assert.deepEqual(parseRich('**👨‍👩‍👧 family**'), [blk('p', ['👨‍👩‍👧 family', 'b'])]);
  assert.deepEqual(parseRich('é**é**'), [blk('p', ['é'], ['é', 'b'])]);
  const lone = `a${String.fromCharCode(0xd83d)}**b**${String.fromCharCode(0xde4f)}c`; // broken pairs: still no throw, no lost letter
  assert.equal(plainText(lone), `a${String.fromCharCode(0xd83d)}b${String.fromCharCode(0xde4f)}c`);
});

test('plain text: the page without marks, a line for a line; a title or preview made from it never shows a mark', () => {
  assert.equal(plainText('# Hontanas\n\n**Cold** and _clear_.\n- soup\n- bread\n> "slow down"'), 'Hontanas\n\nCold and clear.\nsoup\nbread\n"slow down"');
  assert.equal(plainText('plain text, no marks at all'), 'plain text, no marks at all');
  assert.equal(plainText('a\r\nb'), 'a\nb');
  assert.equal(plainText('**a**\n\n\n_b_'), 'a\n\n\nb');
  assert.equal(plainText('- \n# '), '\n', 'empty marks leave empty lines');
  const long = 'word '.repeat(20_000);
  assert.equal(plainText(long, 50).length >= 50 && plainText(long, 50).length < long.length, true, 'with a limit it stops reading early (one line here, so it reads that one)');
  const many = Array.from({ length: 5000 }, (_, i) => `- **line ${i}**`).join('\n');
  assert.equal(plainText(many, 100).split('\n').length < 40, true, 'and does not read the whole page for a preview');
  assert.equal(plainText(many).split('\n').length, 5000);
});

/* ------------------------------------------------------------------------------------------------ bold and italic */

test('bold on a selected word wraps it, the selection stays on the word, and again takes it off', () => {
  const t = 'We walked far';
  const e = must(toggleInline(t, on(t, 'walked'), 'bold'));
  assert.equal(e.text, 'We **walked** far');
  assert.equal(sliceSel(e), 'walked');
  const back = must(toggleInline(e.text, e.selection, 'bold'));
  assert.equal(back.text, t);
  assert.equal(sliceSel(back), 'walked');
  const i = must(toggleInline(t, on(t, 'walked'), 'italic'));
  assert.equal(i.text, 'We _walked_ far');
  assert.equal(sliceSel(i), 'walked');
  assert.equal(must(toggleInline(i.text, i.selection, 'italic')).text, t);
});

test('bold and italic together nest the same way every time, and each comes off alone', () => {
  const t = 'a word here';
  const bold = must(toggleInline(t, on(t, 'word'), 'bold'));
  const both = must(toggleInline(bold.text, bold.selection, 'italic'));
  assert.equal(both.text, 'a **_word_** here');
  assert.equal(sliceSel(both), 'word');
  assert.equal(must(toggleInline(both.text, both.selection, 'bold')).text, 'a _word_ here');
  assert.equal(must(toggleInline(both.text, both.selection, 'italic')).text, 'a **word** here');
  const other = must(toggleInline(must(toggleInline(t, on(t, 'word'), 'italic')).text, S(3, 9), 'bold'));
  assert.deepEqual(parseRich(other.text), parseRich(both.text), 'italic first, then bold: the same page');
});

test('the marks hug the text: white space at the edge of the selection stays outside them', () => {
  const t = 'one two three';
  assert.equal(must(toggleInline(t, S(3, 8), 'bold')).text, 'one **two** three', '" two " selected');
  assert.equal(must(toggleInline(t, S(0, 3), 'bold')).text, '**one** two three');
  assert.equal(must(toggleInline(t, S(0, t.length), 'bold')).text, '**one two three**');
  assert.equal(must(toggleInline('  x  ', S(0, 5), 'bold')).text, '  **x**  ');
  assert.equal(toggleInline('   ', S(0, 3), 'bold'), null, 'only white space selected: nothing to mark');
  assert.equal(toggleInline('a b', S(1, 2), 'bold'), null, 'a space alone');
});

test('nothing selected: the word at the caret (the caret stays where it was), or an empty pair with the caret inside, and that pair goes again', () => {
  const t = 'We walked far';
  const mid = must(toggleInline(t, S(6), 'bold')); // inside "walked"
  assert.equal(mid.text, 'We **walked** far');
  assert.deepEqual(mid.selection, S(8 + 1), 'still after "w" (the caret moved over the marks that came in front of it)');
  const end = must(toggleInline(t, S(9), 'bold')); // right after "walked"
  assert.equal(end.text, 'We **walked** far');
  assert.equal(end.selection.start, 'We **walked'.length, 'at the end of a word the caret stays inside the marks, so typing goes on in bold');
  const start = must(toggleInline(t, S(3), 'italic'));
  assert.equal(start.text, 'We _walked_ far');
  assert.equal(start.selection.start, 4, 'before the first letter, inside the marks');
  const gap = must(toggleInline('We  far', S(3), 'bold'));
  assert.equal(gap.text, 'We **** far');
  assert.deepEqual(gap.selection, S(5));
  const again = must(toggleInline(gap.text, gap.selection, 'bold'));
  assert.equal(again.text, 'We  far');
  assert.deepEqual(again.selection, S(3));
  assert.equal(must(toggleInline('', S(0), 'italic')).text, '__');
  assert.deepEqual(must(toggleInline('', S(0), 'italic')).selection, S(1));
  const prefixed = must(toggleInline('- ', S(0), 'bold'));
  assert.equal(prefixed.text, '- ****', 'a caret in front of a bullet mark does not break the mark');
});

test('a selection that reaches across marks that are already there: all of it gets the format, or all of it loses it', () => {
  const t = '**hello** world';
  const more = must(toggleInline(t, S(5, 13), 'bold')); // "lo** wor"
  assert.equal(more.text, '**hello wor**ld');
  assert.equal(plainText(more.text), 'hello world');
  assert.equal(must(toggleInline(t, S(0, t.length), 'bold')).text, '**hello world**');
  const withMarks = must(toggleInline(t, S(0, 9), 'bold')); // "|**hello**|": the marks are inside the selection
  assert.equal(withMarks.text, 'hello world');
  const middle = must(toggleInline(t, on(t, 'ell'), 'bold'));
  assert.equal(middle.text, '**h**ell**o** world');
  assert.equal(sliceSel(middle), 'ell');
  assert.deepEqual(parseRich(middle.text), [blk('p', ['h', 'b'], ['ell'], ['o', 'b'], [' world'])]);
  const tail = must(toggleInline('**hello world**', on('**hello world**', 'world'), 'bold'));
  assert.equal(tail.text, '**hello** world', 'the space that was inside the run moves outside its marks');
  const head = must(toggleInline('**hello world**', on('**hello world**', 'hello'), 'bold'));
  assert.equal(head.text, 'hello **world**');
});

test('marks typed by hand are marks: select the word and the button takes them off', () => {
  const t = 'say **hi** now';
  assert.equal(must(toggleInline(t, on(t, 'hi'), 'bold')).text, 'say hi now');
  assert.equal(must(toggleInline(t, on(t, 'say **hi**'), 'bold')).text, 'say hi now');
  assert.equal(must(toggleInline('typed _by hand_ here', S(6, 14), 'italic')).text, 'typed by hand here');
  const stray = 'a * b';
  assert.equal(must(toggleInline(stray, on(stray, 'b'), 'bold')).text, 'a * **b**');
  const star = '2 * 3 * 4';
  assert.equal(must(toggleInline(star, S(0, star.length), 'bold')).text, '**2 * 3 * 4**');
  assert.equal(plainText('**2 * 3 * 4**'), '2 * 3 * 4');
});

test('italic reaches out to whole words (an underscore inside a word would not be italic); bold may start inside one', () => {
  const t = 'abcdef ghi';
  assert.equal(must(toggleInline(t, S(2, 4), 'italic')).text, '_abcdef_ ghi');
  assert.equal(sliceSel(must(toggleInline(t, S(2, 4), 'italic'))), 'abcdef');
  assert.equal(must(toggleInline(t, S(2, 4), 'bold')).text, 'ab**cd**ef ghi');
  const it = '_hello_ there';
  assert.equal(must(toggleInline(it, S(2, 4), 'italic')).text, 'hello there', 'taking it off works on the whole word as well');
});

test('a selection over several lines is done line by line: block marks stay, blank lines are skipped, a selection ending at a line start leaves that line alone', () => {
  const t = 'first line\n\n- a bullet\n> a quote\nlast';
  const all = must(toggleInline(t, S(0, t.length), 'bold'));
  assert.equal(all.text, '**first line**\n\n- **a bullet**\n> **a quote**\n**last**');
  assert.equal(sliceSel(all), all.text, 'the selection still covers everything');
  assert.equal(must(toggleInline(all.text, all.selection, 'bold')).text, t, 'and one more press takes it all off again');
  const endsAtStart = 'one\ntwo';
  assert.equal(must(toggleInline(endsAtStart, S(0, 4), 'bold')).text, '**one**\ntwo', 'the caret is at the start of line two, so line two is not touched');
  assert.equal(toggleInline('\n\n', S(0, 2), 'bold'), null);
  const some = must(toggleInline('**a**\nb', S(0, 7), 'bold'));
  assert.equal(some.text, '**a**\n**b**', 'one line already had it, the other did not: all of it gets it');
  const crlf = must(toggleInline('one\r\ntwo', S(0, 8), 'bold'));
  assert.equal(crlf.text, '**one**\r\n**two**');
});

test('a toggle never changes a word and answers null (nothing changes) rather than a mark that would not read back', () => {
  for (const [t, s] of [['a_b_c', S(2, 3)], ['**x**y**z**', S(2, 9)], ['_a_b_', S(0, 5)], ['a__b__c', S(0, 7)], ['**', S(0, 2)], ['***', S(0, 3)]] as [string, Sel][]) {
    for (const f of ['bold', 'italic'] as const) {
      const e = toggleInline(t, s, f);
      if (e) assert.equal(plainText(e.text), plainText(t), `${t} ${f}`);
    }
  }
});

test('text and selection are checked: whole numbers, in range, the right way round, never inside an emoji', () => {
  const t = 'a🙏b';
  for (const sel of [S(-5, 99), S(NaN, NaN), S(Infinity, -Infinity), S(3, 1), S(2, 2), { start: 1.9, end: 2.2 }, {} as Sel, null as unknown as Sel]) {
    const e = toggleInline(t, sel, 'bold');
    if (e) {
      assert.ok(e.selection.start >= 0 && e.selection.end <= e.text.length && e.selection.start <= e.selection.end);
      assert.equal(plainText(e.text), t);
    }
  }
  const inside = must(toggleInline(t, S(2, 3), 'bold')); // from the middle of the emoji to the end of it
  assert.equal(inside.text, 'a**🙏**b', 'the selection grows to the whole emoji');
  assert.equal(must(toggleInline('x👨‍👩‍👧y', S(3, 6), 'bold')).text, 'x**👨‍👩‍👧**y', 'and to the whole family, not a piece of it');
  assert.equal(must(toggleInline('aéb', S(2, 3), 'bold')).text, 'a**é**b', 'a letter and its accent stay together');
  assert.equal(toggleInline(undefined as unknown as string, S(0), 'bold'), null);
  assert.equal(toggleBlock(7 as unknown as string, S(0), 'heading'), null);
});

test('the page limit: a toggle that would not fit answers null, one that makes the text no longer is always allowed', () => {
  const t = 'word';
  assert.equal(toggleInline(t, S(0, 4), 'bold', 7), null);
  assert.equal(must(toggleInline(t, S(0, 4), 'bold', 8)).text, '**word**');
  assert.equal(toggleInline('', S(0), 'bold', 3), null, 'an empty pair is four characters');
  assert.equal(must(toggleInline('**word**', S(2, 6), 'bold', 4)).text, 'word', 'taking marks off needs no room');
  assert.equal(toggleBlock('a', S(0), 'heading', 2), null);
  assert.equal(must(toggleBlock('a', S(0), 'heading', 3)).text, '# a');
  assert.equal(must(toggleBlock('# a', S(0), 'heading', 1)).text, 'a');
});

/* ------------------------------------------------------------------------------------------------ headings, bullets, quotes */

test('a heading, bullet or quote goes on the line of the caret, the caret ends up after the mark, and the button takes it off again', () => {
  const t = 'Hontanas\nsecond';
  for (const [f, mark] of [['heading', '# '], ['bullet', '- '], ['quote', '> ']] as const) {
    const e = must(toggleBlock(t, S(3), f));
    assert.equal(e.text, `${mark}Hontanas\nsecond`);
    assert.deepEqual(e.selection, S(3 + 2), f);
    const back = must(toggleBlock(e.text, e.selection, f));
    assert.equal(back.text, t);
    assert.deepEqual(back.selection, S(3), f);
  }
  const start = must(toggleBlock(t, S(0), 'bullet'));
  assert.deepEqual(start.selection, S(2), 'a caret at the start of the line goes behind the new mark, so typing does not land in front of it');
  const second = must(toggleBlock(t, S(12), 'heading'));
  assert.equal(second.text, 'Hontanas\n# second');
  assert.deepEqual(second.selection, S(14));
});

test('block marks on several lines: all of them get it unless all have it; another mark is replaced; blank lines are skipped', () => {
  const t = 'one\ntwo\n\nthree';
  const all = must(toggleBlock(t, S(0, t.length), 'bullet'));
  assert.equal(all.text, '- one\n- two\n\n- three');
  assert.equal(sliceSel(all), all.text);
  assert.equal(must(toggleBlock(all.text, all.selection, 'bullet')).text, t);
  const mixed = '- one\ntwo';
  assert.equal(must(toggleBlock(mixed, S(0, mixed.length), 'bullet')).text, '- one\n- two', 'one line had it, one did not: it goes on both');
  assert.equal(must(toggleBlock('> a\n- b', S(0, 7), 'quote')).text, '> a\n> b', 'a bullet line becomes a quote line');
  assert.equal(must(toggleBlock('- a', S(0), 'heading')).text, '# a', 'a bullet becomes a heading');
  assert.equal(must(toggleBlock('* star', S(3), 'bullet')).text, 'star', 'a star bullet counts as a bullet and goes');
  assert.equal(must(toggleBlock('one\ntwo', S(0, 4), 'quote')).text, '> one\ntwo', 'a selection ending at a line start leaves that line alone');
  assert.equal(must(toggleBlock('', S(0), 'heading')).text, '# ');
  assert.deepEqual(must(toggleBlock('', S(0), 'heading')).selection, S(2));
  assert.equal(must(toggleBlock('# ', S(2), 'heading')).text, '', 'the empty mark goes again');
  assert.equal(must(toggleBlock('\n\n', S(0, 2), 'bullet')).text, '- \n- \n', 'nothing but blank lines: all of them');
  assert.equal(must(toggleBlock('a\r\nb', S(0, 4), 'bullet')).text, '- a\r\n- b');
  assert.equal(toggleBlock('- a', S(0), 'bullet', Infinity)?.text, 'a');
});

test('block marks leave the inline marks and the words alone, and the selection follows the text', () => {
  const t = 'say **hi** to _all_';
  const e = must(toggleBlock(t, on(t, 'hi'), 'quote'));
  assert.equal(e.text, `> ${t}`);
  assert.equal(sliceSel(e), 'hi');
  assert.deepEqual(parseRich(e.text), [blk('q', ['say '], ['hi', 'b'], [' to '], ['all', 'i'])]);
  const multi = 'a\nb\nc';
  const m = must(toggleBlock(multi, S(2, 5), 'heading'));
  assert.equal(m.text, 'a\n# b\n# c');
  assert.equal(sliceSel(m), 'b\n# c');
});

/* ------------------------------------------------------------------------------------------------ the Return key in a list */

test('Return at the end of a bullet starts the next bullet with the caret behind its mark; the mark is the one the line uses', () => {
  const e = must(continueList('- milk', '- milk\n', 6));
  assert.equal(e.text, '- milk\n- ');
  assert.deepEqual(e.selection, S(9));
  assert.equal(must(continueList('* milk', '* milk\n')).text, '* milk\n* ', 'found without a hint too');
  const mid = must(continueList('- milk and eggs', '- milk\n and eggs', 6));
  assert.equal(mid.text, '- milk\n-  and eggs', 'in the middle it splits the bullet: the rest goes to a bullet of its own');
  assert.deepEqual(mid.selection, S(9));
  const later = must(continueList('title\n- a\n- b\nafter', 'title\n- a\n- b\n\nafter', 15));
  assert.equal(later.text, 'title\n- a\n- b\n- \nafter');
  assert.deepEqual(later.selection, S(18));
});

test('Return on an empty bullet ends the list: the mark goes and no line break is added', () => {
  const e = must(continueList('- milk\n- ', '- milk\n- \n', 9));
  assert.equal(e.text, '- milk\n');
  assert.deepEqual(e.selection, S(7));
  const alone = must(continueList('- ', '- \n', 2));
  assert.equal(alone.text, '');
  assert.deepEqual(alone.selection, S(0));
  const spaces = must(continueList('- a\n-   ', '- a\n-   \n', 8));
  assert.equal(spaces.text, '- a\n');
  const between = must(continueList('- a\n- \n- b', '- a\n- \n\n- b', 7));
  assert.equal(between.text, '- a\n\n- b', 'in the middle of a list it ends the list at that line');
});

test('Return is left to the field everywhere else: plain lines, headings, quotes, in front of the mark, any other change of the text', () => {
  assert.equal(continueList('plain', 'plain\n', 5), null);
  assert.equal(continueList('# head', '# head\n', 6), null);
  assert.equal(continueList('> quote', '> quote\n', 7), null);
  assert.equal(continueList('- milk', '\n- milk', 0), null, 'at the very start of the line, before the mark');
  assert.equal(continueList('- milk', '-\n milk', 1), null, 'inside the mark');
  assert.equal(continueList('- milk', '- milk!', 6), null, 'a letter, not a line break');
  assert.equal(continueList('- milk', '- mil', 5), null, 'a deletion');
  assert.equal(continueList('- milk', '- milkk\n', 6), null, 'more than one character');
  assert.equal(continueList('- a', '- b\n', 3), null);
  assert.equal(continueList('', '\n', 0), null);
  assert.equal(continueList(1 as unknown as string, 'x'), null);
});

test('Return finds its place when the same line break could have gone in two spots, and uses the page limit', () => {
  const prev = '- a\n\n- b';
  const next = '- a\n\n\n- b';
  // the caret was on the blank line (index 4): a blank line is not a bullet, so this is left to the field
  assert.equal(continueList(prev, next, 4), null);
  const e = must(continueList('- a', '- a\n', 3));
  assert.equal(e.text, '- a\n- ');
  assert.equal(continueList('- a', '- a\n', 3, 5), null, 'the mark would not fit on the page');
  assert.equal(must(continueList('- a', '- a\n', 3, 6)).text, '- a\n- ');
  assert.equal(must(continueList('- a\n- ', '- a\n- \n', 6, 1)).text, '- a\n', 'ending a list makes the text shorter, so it always fits');
});

/* ------------------------------------------------------------------------------------------------ which buttons look pressed */

test('which formats are on at the caret, or all through the selection', () => {
  const none = { bold: false, italic: false, heading: false, bullet: false, quote: false };
  assert.deepEqual(formatsAt('', S(0)), none);
  assert.deepEqual(formatsAt('plain', S(2)), none);
  const t = 'a **b** _c_';
  assert.equal(formatsAt(t, S(5)).bold, true, 'inside the bold word (the letter before the caret decides)');
  assert.equal(formatsAt(t, S(6)).bold, true, 'right after it, so typing there would continue it');
  assert.equal(formatsAt(t, S(2)).bold, false);
  assert.equal(formatsAt(t, S(3)).bold, true, 'in front of the first letter of a bold word: it is bold');
  assert.equal(formatsAt(t, S(10)).italic, true);
  assert.equal(formatsAt(t, on(t, 'b')).bold, true);
  assert.equal(formatsAt(t, S(0, t.length)).bold, false, 'only some of what is selected');
  assert.equal(formatsAt('**a** **b**', S(0, 11)).bold, true, 'all of it, with a space between');
  assert.deepEqual(formatsAt('**_x_**', S(3, 4)), { ...none, bold: true, italic: true });
  assert.deepEqual(formatsAt('# Head', S(4)), { ...none, heading: true });
  assert.deepEqual(formatsAt('- a\n- b', S(0, 7)), { ...none, bullet: true });
  assert.deepEqual(formatsAt('- a\nb', S(0, 5)), none, 'one line is not a bullet');
  assert.deepEqual(formatsAt('> q', S(3)), { ...none, quote: true });
  assert.deepEqual(formatsAt('- a\n\n- b', S(0, 8)), { ...none, bullet: true }, 'a blank line between bullets does not count against it');
  assert.deepEqual(formatsAt('x', S(NaN)), none);
  assert.deepEqual(formatsAt(null as unknown as string, S(0)), none);
});

/* ------------------------------------------------------------------------------------------------ lots of random text */

function prng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const PIECES = ['a', 'b', 'word', 'x y', ' ', '  ', '\n', '\n', '\r\n', '*', '**', '_', '__', '# ', '- ', '* ', '> ', '#', '-', '>', '**bold**', '_it_', '**_both_**', 'é', '🙏', '👨‍👩‍👧', 'é', '日本', 'שלום', '‍', '️', '_x', 'y_', '**z', 'w**', String.fromCharCode(0xd83d), String.fromCharCode(0xde4f), 'ana_torres_88', '1', '.', ',', '\t', ' '];
const randomText = (rnd: () => number, maxPieces = 14) => Array.from({ length: Math.floor(rnd() * maxPieces) }, () => PIECES[Math.floor(rnd() * PIECES.length)]).join('');
const splitsPair = (t: string, i: number) => i > 0 && i < t.length && t.charCodeAt(i - 1) >= 0xd800 && t.charCodeAt(i - 1) <= 0xdbff && t.charCodeAt(i) >= 0xdc00 && t.charCodeAt(i) <= 0xdfff;
const validSel = (e: Edit) => Number.isInteger(e.selection.start) && Number.isInteger(e.selection.end) && e.selection.start >= 0 && e.selection.start <= e.selection.end && e.selection.end <= e.text.length;

test('random text: reading never throws, has one block per line, and plain text has no line break the text did not have', () => {
  const rnd = prng(1);
  for (let k = 0; k < 4000; k++) {
    const t = randomText(rnd);
    const blocks = parseRich(t);
    assert.equal(blocks.length, t === '' ? 0 : t.split('\n').length, JSON.stringify(t));
    for (const bl of blocks) for (const s of bl.spans) assert.ok(s.text.length > 0 && !/\n/.test(s.text));
    const plain = plainText(t);
    assert.equal(plain.split('\n').length, t === '' ? 1 : t.split('\n').length);
    assert.ok(plain.length <= t.length, JSON.stringify(t));
    if (!/[*_#>\-]/.test(t)) assert.equal(plain, t.replace(/\r\n/g, '\n'), `text without marks reads as it is: ${JSON.stringify(t)}`);
  }
});

test('random text and selections: bold and italic never change a word, keep the selection valid, and one more press goes back to the same page', () => {
  const rnd = prng(2);
  let edits = 0;
  let refused = 0;
  for (let k = 0; k < 6000; k++) {
    const t = randomText(rnd);
    const a = Math.floor(rnd() * (t.length + 2)) - 1;
    const z = rnd() < 0.3 ? a : Math.floor(rnd() * (t.length + 2)) - 1;
    for (const f of ['bold', 'italic'] as const) {
      const e = toggleInline(t, S(a, z), f);
      if (!e) { refused += 1; continue; }
      edits += 1;
      assert.equal(plainText(e.text), plainText(t), `${f} changed a word: ${JSON.stringify(t)} ${a},${z} -> ${JSON.stringify(e.text)}`);
      assert.ok(validSel(e), `${JSON.stringify(t)} ${a},${z} -> ${JSON.stringify(e.selection)}`);
      assert.ok(!splitsPair(e.text, e.selection.start) && !splitsPair(e.text, e.selection.end), 'selection inside an emoji');
      assert.ok(!(e.text === t), 'an edit that changes nothing is null instead');
      const again = toggleInline(e.text, e.selection, f);
      if (again && z !== a) assert.deepEqual(parseRich(again.text), parseRich(t), `pressing twice is not the same page: ${JSON.stringify(t)} ${a},${z} -> ${JSON.stringify(e.text)} -> ${JSON.stringify(again.text)}`);
    }
  }
  assert.ok(edits > 3000 && refused > 100, `the random cases must both edit (${edits}) and refuse (${refused})`);
});

test('random text and selections: block marks never change a word, keep the selection valid, and the pressed look agrees with what was done', () => {
  const rnd = prng(3);
  let edits = 0;
  for (let k = 0; k < 6000; k++) {
    const t = randomText(rnd);
    const a = Math.floor(rnd() * (t.length + 2)) - 1;
    const z = rnd() < 0.5 ? a : Math.floor(rnd() * (t.length + 2)) - 1;
    for (const f of ['heading', 'bullet', 'quote'] as const) {
      const e = toggleBlock(t, S(a, z), f);
      if (!e) continue;
      edits += 1;
      assert.equal(plainText(e.text), plainText(t), `${f} changed a word: ${JSON.stringify(t)} ${a},${z} -> ${JSON.stringify(e.text)}`);
      assert.ok(validSel(e), JSON.stringify(e));
      assert.ok(!splitsPair(e.text, e.selection.start) && !splitsPair(e.text, e.selection.end));
      const f2 = formatsAt(t, S(a, z))[f];
      const now = formatsAt(e.text, e.selection)[f];
      if (!/^\s*$/.test(t)) assert.equal(now, !f2 || t.split('\n').some((l) => /\S/.test(l) === false), `${f}: ${JSON.stringify(t)} ${a},${z}`);
    }
  }
  assert.ok(edits > 3000, `${edits} edits`);
});

test('random typing in lists: the Return key never changes a word and never leaves a caret outside the text', () => {
  const rnd = prng(4);
  let continued = 0;
  for (let k = 0; k < 6000; k++) {
    const prev = randomText(rnd, 10);
    const at = Math.floor(rnd() * (prev.length + 1));
    const next = `${prev.slice(0, at)}\n${prev.slice(at)}`;
    const e = continueList(prev, next, rnd() < 0.7 ? at : undefined);
    if (!e) continue;
    continued += 1;
    assert.ok(validSel(e), JSON.stringify([prev, at, e]));
    assert.equal(plainText(e.text).replace(/\s+/g, ' ').trim().length >= 0, true);
    const wordsBefore = plainText(prev).replace(/\s+/g, '');
    const wordsAfter = plainText(e.text).replace(/\s+/g, '');
    assert.equal(wordsAfter, wordsBefore, `Return changed a word: ${JSON.stringify([prev, at, e.text])}`);
  }
  assert.ok(continued > 200, `${continued} continued`);
});

test('a page of twenty thousand characters (and five times that) is read, toggled and previewed in a blink, whatever it is made of', () => {
  const heavy: [string, string][] = [
    ['unclosed bold', '**a '.repeat(7000)],
    ['unclosed italic', '_a '.repeat(7000)],
    ['only stars', '*'.repeat(20_000)],
    ['only underscores', '_'.repeat(20_000)],
    ['pairs', '**a** _b_ '.repeat(2000)],
    ['one long bold', `**${'word '.repeat(4000)}end**`],
    ['nested', `**_${'x'.repeat(19_990)}_**`],
    ['many lines', Array.from({ length: 6000 }, (_, i) => (i % 3 ? `- **line** ${i}` : `# h _${i}_`)).join('\n')],
    ['emoji', '🙏**👨‍👩‍👧**_é_ '.repeat(2500)],
    ['stray marks', '** _ * _a **b _c* '.repeat(1500)],
  ];
  for (const [name, text] of [...heavy, ...heavy.map(([k, v]) => [`${k} x5`, v.repeat(5)] as [string, string])]) {
    const t0 = Date.now();
    const blocks = parseRich(text);
    plainText(text);
    plainText(text, 300);
    const mid = Math.floor(text.length / 2);
    toggleInline(text, S(mid, mid + 40), 'bold');
    toggleInline(text, S(mid, mid + 40), 'italic');
    toggleInline(text, S(0, text.length), 'bold');
    toggleBlock(text, S(0, text.length), 'bullet');
    formatsAt(text, S(0, text.length));
    formatsAt(text, S(mid));
    assert.ok(blocks.length >= 1);
    const ms = Date.now() - t0;
    assert.ok(ms < 3000, `${name} (${text.length} characters) took ${ms} ms`);
  }
});

console.log(`${n} of ${n} passed`);
