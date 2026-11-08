# design-lint: does the app stay inside the design tokens?

`scan.py` reads every `.ts` and `.tsx` file of `mobile/app` and `mobile/src` and counts the places where the code leaves
`design/tokens.json`: a padding that is not on the space scale, a font size under 15, an icon size that is not an icon size, a tap
target under 48, a raw colour. CI runs it on every pull request (the `design-lint` job), and it fails when the count goes up. The count
may only go down. Python 3, standard library only; it reads the whole app in about a second.

```
python3 tools/design-audit/scan.py --check              what CI runs: red when a total goes up, or when a file that has no baseline entry gets a violation
python3 tools/design-audit/scan.py --explain <file>     every violation of one file, with the token to use instead
python3 tools/design-audit/scan.py --report             markdown report: totals, % conforming, kinds, top files, exceptions
python3 tools/design-audit/scan.py --report --json out.json     the same, and every violation as JSON
python3 tools/design-audit/scan.py --update-baseline    lock in what you fixed (it never raises a total; --allow-increase does)
```

The rules in plain words, for the person writing a screen, are in [`mobile/docs/DESIGN-RULES.md`](../../mobile/docs/DESIGN-RULES.md).

## What it counts

The allowed values are read from `design/tokens.json` every time it runs (never copied into the scanner), and the roles and fonts the code can use
from `mobile/src/theme/index.ts`. Change a scale in the tokens and the verdict changes with it. A value is only judged when the scanner can read it: a
number, a named constant (`const SIDE = 14`), a token (`space[4]`, `layout.screenMargin`), a simple sum (`layout.touchMin - 8`). A computed value
(`insets.bottom + 8`, a prop) is not judged, and a zero is not judged.

Five categories fail the check. Each is a total in `baseline.json`.

| Category | Kind | A violation is | Use instead |
|---|---|---|---|
| `color` | `raw` | a hex, `rgb(a)` or CSS colour name outside `mobile/src/theme` (`#E9C987`, `rgba(0,0,0,0.5)`, `'white'`); `transparent` is not a colour choice | a role (`role.surface`), a palette colour (`c.goldWash`), `FIXED.*` for a colour that must not change with the mode; the message names the role when the colour is one |
| `font` | `size`, `small` | a literal `fontSize` that is not a text size (15, 17, 19, 22, 24, 28, 30, 36, 48, 64); `small` is one under 15, the smallest | an `AppText` variant (`<AppText variant="small">`), or `textStyle('small')`, or `text.small.size` |
| | `line-height`, `letter-spacing` | a literal `lineHeight` or `letterSpacing` that is not the one of a variant | the same |
| | `family` | a `fontFamily` that is not a brand font | `fonts.body`, or an `AppText` variant |
| | `system-font` | a `<Text>` in a file with no `AppText`, or a `<TextInput>` with no `fontFamily`: it draws the system font | `AppText`; `fontFamily: fonts.body` |
| `spacing` | `padding`, `margin`, `gap` | a value that is not a step of `space` (0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128), including one read through a constant | `space[3]`, `space[4]` ... the message names the two steps around the value |
| `size` | `radius` | a `borderRadius` that is not a radius token and not a circle (half the width or height) | `radius.md`, `radius.pill` |
| | `icon` | an icon `size` that is not 18, 20, 24, 28 or 32; a `MapIcon` with no size (its default is 22) | `icon.sm`, `icon.smPlus`, `icon.md`, `icon.mdPlus`, `icon.lg` |
| | `touch` | an interactive element (`Pressable`, `Touchable*`, `IconButton`, `Pill`, `Chip` ...) drawn under `layout.touchHard` (48) in width or height, **with its `hitSlop` added** | `layout.touchHard` at the least, `layout.touchPrimary` (56) for a primary action |
| | `shadow` | a shadow written by hand (`shadowColor`, `shadowOpacity` ... or an `elevation` that is not 0) | `shadowStyle('md')` |
| `inset` | `text-near-edge` | a `View` or `Pressable` with a border or a fill (a fill needs a radius) whose direct text is under 8 px from the outline: the padding on some side is under 8, or absent; where the content is centred in a box of known height the room is (height - line height) / 2 | padding of 8 or more; cards use `layout.cardPadding` (20) |
| `ignore` | `no-reason`, `unknown-category`, `unused` | a `design-lint-ignore` comment that has no reason, names no category, or excuses nothing | see "How to add an exception" |

**% conforming** is the share of the values the scanner could read that are inside the standard: `(checked - violations) / checked` per category.
Checked values are, per category: colour uses (raw literals, `role.*`, `c.*`, `FIXED.*`); font literals and `AppText` elements left as they are; padding,
margin and gap values; radius values, icon sizes, tap targets with a known size and shadows; containers that hold text and have an outline or a fill.

### Counted apart: reported, never failing

Shown in `--report` and `--check` (a note when one goes up), and stored in `baseline.json`, but not violations:

| What | Why it is not a violation |
|---|---|
| `color/role-first`: `c.*` where an identical `role.*` exists (`c.sand200` is `role.sunken`) | it works and flips with dark mode; the role says what the colour means |
| `spacing/offset`: `top`, `left`, `right`, `bottom`, `start`, `end` off the space scale | optical alignment and overlays |
| `spacing/negative`: negative margins | optical alignment |
| `size/touch-below-primary`: tap targets drawn 48 to 55 | above the hard minimum; which ones are primary actions cannot be told from the code |

### Hand-made components: a heuristic, report only

`duplicates` counts hand-made pills, icon buttons, cards, notices, sub-tab items, floating buttons and segments that look like a shared component
(`Pill`, `IconButton`, `Card` ...). It guesses from the style, it is wrong sometimes, and it never fails anything. It is the work list for the
component phase.

## How to read a failure

```
design-lint: FAILED  (981 violations in 314 files: color 196, font 218, spacing 394, ...)
FAIL  spacing went up: 391 -> 394 (+3). Rule: padding, margin and gap from the space scale.
      app/foo.tsx:41  spacing/padding: padding: 14 is not on the space scale: use space[3] (12) or space[4] (16)
          <View style={{ padding: 14, ...
FAIL  src/features/x/New.tsx has no baseline entry (it is new, or it was clean) and has 2 violation(s): a file without an entry must be clean.
```

Two things fail the check, in this order:

1. **A category total went up** against `baseline.json`. The lines listed are the new violations of files that already had some (found by
   fingerprint, see below).
2. **A file with no entry in `baseline.json` has a violation.** That is a new file, or a file that was clean. New files must be clean. Lines that
   were already in the baseline somewhere else (code that you moved into the new file) do not count.

Moving code between files is not punished: the totals do not change, a move into a file that already has an entry changes nothing, and a move into
a new or a clean file is recognised, because each violation is fingerprinted by its rule, its value and its source line (never its line number or its
file). Rewriting a line while you move it makes it a new violation: fix it instead.

Also red: a file the scanner cannot read (unbalanced brackets, a construct `lexer.py` does not know), because its violations cannot be counted. Fix
the file or `lexer.py`.

`--explain <file>` shows every violation of a file, in any state. The path can be `app/(tabs)/me.tsx`, `mobile/app/(tabs)/me.tsx` or the end of it.

## How to lower the baseline

Fix violations, then lock the new, lower numbers in, in the same pull request:

```
python3 tools/design-audit/scan.py --update-baseline
git add tools/design-audit/baseline.json
```

It prints what changed (each total old -> new, the kinds that moved, the files that gained or lost an entry) and writes `baseline.json`. It **refuses**
when any category total would go up (exit 1, nothing written): that is what makes it a ratchet. Equal is fine, so it also accepts a refactor that
moved violations between files. `--allow-increase` writes it anyway; use it only when the owner has accepted the rise, and say so in the pull request.

`--check` passes when the code is cleaner than the baseline, and says so in a note. If you do not lock it in, the difference is room that anyone can
fill with new violations, so lock it in.

`baseline.json` is generated, never edited by hand. It holds the totals per category and kind, the counted-apart totals, and for each file with
violations its count per category and one short fingerprint per violation. A merge conflict in it is solved by merging the code and running
`--update-baseline` again (after `--check` is green).

## How to add an exception

Some lines must break a rule on purpose: a count badge that is 20 px wide by design, the tint of a sample photo, a colour a partner's brand mark
mandates. Put a comment on the line, or alone on the line above it:

```tsx
<View style={{ width: 20, height: 20, padding: 2 }} />  {/* design-lint-ignore: spacing,inset a count badge is as small as its number */}

// design-lint-ignore: color a sample photo tint, not a colour of the interface
const tint = '#9DB4CC';
```

`design-lint-ignore: <category> <reason>`: the category is one of `color`, `font`, `spacing`, `size`, `inset`, `duplicates` (several with commas, no
spaces); the reason is required and is read by the next person. The comment excuses that one line (the next line that has code, when the comment is alone). The
exception is counted and listed in `--report`. It is itself a violation (category `ignore`) when it has no reason, names no category, or excuses
nothing (the line is clean, or it is on the wrong line), so a stale exception cannot stay behind.

An exception is for a decision, not for a deadline: when a rule is wrong for many places, change the token (`design/tokens.json`) or ask the owner.

## What it can and cannot see

It reads the code, not the screen. It does not see a size that is computed, a style built in another file, a width that comes from the parent, or the
real size of a tap target that grows with its text. Measuring every element of every screen in a browser, light and dark, is a different tool.
The scanner skips what is not app UI code: tests (`__tests__`, `*.test.*`), `mobile/src/theme`, `*.d.ts`, and the generated or sample-data files
listed in `EXCLUDE_FILES` at the top of `scan.py`. The one built-in exception: the four colours of the Google G in `GoogleButton.tsx`.

How exact is it? It reads TypeScript with its own small tokenizer (`lexer.py`), not with the compiler, so it is checked against the compiler:
`oracle.js` counts the same things from the TypeScript AST, and `tools/tests/test_design_audit.py` compares the two file by file (on the tree of 8 November 2026:
5,651 of 5,652 counts agree; the one difference is the `<Text>` inside `AppText.tsx`, skipped on purpose). That test runs where node and
`mobile/node_modules` are installed; the rest of the tests are offline fixtures: one for each category, the ignore comment, the ratchet up and down, a
new file, a move, and the audit's self-test of the cases the app's own code does not have (a module-scope colour read, an apostrophe in JSX text, a constant,
a `hitSlop`).

```
python3 -m unittest tools/tests/test_design_audit.py -v            the tests (CI runs them with the other tools tests)
node tools/design-audit/oracle.js mobile > oracle.json             the compiler's count, to compare by hand
```

## When the tokens change

`--check` reads `design/tokens.json` as it is. Add a step to a scale (the icon sizes 20 and 28 were added this way) and the violations that it
legalises disappear; the check passes and says the baseline can be lowered. Remove a step or raise the smallest text size and the totals go up and
the check fails until the code follows or the owner accepts the rise (`--update-baseline --allow-increase`). Roles are read from
`mobile/src/theme/index.ts`; a role that the theme does not export is not suggested.
