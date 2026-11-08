# Design rules for screens

The numbers of the design are in [`design/tokens.json`](../../design/tokens.json), and the page that shows them is `design/index.html`. This is the
short version for the person writing a screen. **The lint enforces it**: `python3 tools/design-audit/scan.py --check` runs in CI (the `design-lint` job) and
goes red when new code leaves a scale. [`tools/design-audit/README.md`](../../tools/design-audit/README.md) says what it counts and how to read a failure.

Everything below comes from one import:

```ts
import { c, fixed, fonts, icon, layout, radius, role, shadowStyle, space, text, textStyle } from '@/theme';
```

## Spacing: from `space`

Padding, margin and gap are steps of the scale. Write `space[4]`, not `16`.

| `space[n]` | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16 | 20 | 24 | 32 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| px | 0 | 4 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 64 | 80 | 96 | 128 |

There is no 2, 6, 10, 14 or 18: round to the step that looks right (6 to 4 or 8, 10 to 8 or 12, 14 to 12 or 16, 18 to 16 or 20). The named
layout numbers say what a space is for: `layout.screenMargin` (16, the side of every screen), `layout.screenTop`, `layout.sectionGap` (40),
`layout.stackGap` (16), `layout.cardPadding` (20), `layout.sheetPadding` (24). Offsets (`top`, `left` ...) and negative margins are for optical
alignment; the lint counts them but does not fail on them.

## Type: from the `AppText` variants

Write `<AppText variant="small">`, not `fontSize: 17`. A variant is a size, a line height, a letter spacing, a family and a weight that were chosen together.
Do not set `fontSize`, `lineHeight`, `letterSpacing` or `fontFamily` on an `AppText`. Where you cannot use an `AppText` (a `TextInput`), spread `textStyle('body')`.
Layout code that needs the numbers reads `text.body.size`, `text.body.lineHeight`.

**Nothing is smaller than 15** (the `caption` and `mono` variants). The audience includes older pilgrims; a 12 or a 13 is not a smaller caption, it is
too small for many readers. If a name does not fit at 15, the layout changes (fewer columns, a wrapped line), not the type.

## Icons: 18, 20, 24, 28 or 32

`<Icon name="pin" color={role.text} size={icon.md} />`. The sizes are `icon.sm` 18, `icon.smPlus` 20, `icon.md` 24 (the default), `icon.mdPlus` 28 and `icon.lg`
32. There is no 22, 26 or 30: use the step next to it. The line weight is `icon.stroke` (1.75) at every size.

## Tap targets: 48 hard, 56 for the main action

- **48 is the hard minimum** (`layout.touchHard`). Nothing tappable is drawn smaller, in width or in height. A `hitSlop` counts: a 40 px icon with
  `hitSlop={4}` all round is 48.
- **56 is the target for primary actions** (`layout.touchPrimary`): buttons, fields, list rows, the thing the screen is for. Between 48 and 55 is
  fine for a secondary control; the lint counts those apart and does not fail on them.
- `layout.touchMin` is the old name of `touchPrimary` and has the same value. Do not use it in new code.

## Colour: roles first

- **`role.*` first.** A role says what a colour means (`role.surface`, `role.text`, `role.muted`, `role.action`, `role.danger`), and it keeps its
  contrast in dark mode. Use a role whenever one fits.
- **`c.*` only where the meaning is the same in both modes** (a status wash such as `c.goldWash`, `c.red100`). `c.blue` is navy in light mode and light blue
  in dark mode: it is an action colour, never a card surface. The lint counts a `c.*` that has an identical role apart, and does not fail on it.
- **`fixed.*` / `FIXED.*`** for a surface that must not change with the mode (a photo, a pastel story card).
- **Never a raw colour**: no `#14365D`, no `rgba(...)`, no `'white'`. The lint names the role to use when the literal is a colour the design owns.

## Radius and shadow

`borderRadius` is `radius.*` (anything you tap is `radius.pill`; cards are `radius.lg`), or half the width of a circle. A shadow is `shadowStyle('md')`,
never `shadowColor`, `shadowOpacity` and `shadowRadius` written by hand.

## Insets: room between text and the edge

Text inside a box with a border or a fill keeps **8 px or more** from the outline on every side. A card holds its content at `layout.cardPadding` (20).
Do not cut the padding of a tile to fit one more word: if the word does not fit, change the layout (fewer columns, a wrapped line). A box that is a fixed
20 or 24 px (a count badge) is the rare case for an exception.

## When the lint is red

The message names the file, the line and the token to use. `python3 tools/design-audit/scan.py --explain <file>` lists every violation of a file.
Fix them, and if you lowered the numbers, lock that in with `--update-baseline` (it only lowers). A line that must break a rule on purpose takes a comment with
the reason:

```tsx
// design-lint-ignore: spacing the avatar ring is drawn 2 px off the photo on purpose
```

A new file starts clean: the lint fails a file that has no entry in the baseline and a violation. Code that you only moved from another file is not a new violation.
