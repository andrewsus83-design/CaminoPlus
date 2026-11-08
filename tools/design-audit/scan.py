#!/usr/bin/env python3
"""design-lint: does the app code stay inside the design tokens? (tools/design-audit/scan.py). Python 3, standard library only.

    python3 tools/design-audit/scan.py --check               CI: fail when the code leaves the tokens more than the baseline allows
    python3 tools/design-audit/scan.py --report [--json F]   markdown report on stdout, and the JSON with every violation in F
    python3 tools/design-audit/scan.py --update-baseline     write baseline.json (it only lowers or keeps the totals; --allow-increase raises them)
    python3 tools/design-audit/scan.py --explain <file>      every violation of one file and what to use instead

What it reads. The allowed values come from design/tokens.json (the space scale, the text sizes, line heights and tracking, the radius
scale, the icon sizes, the two tap-target numbers, the palette and the roles) and from the exports of mobile/src/theme/index.ts (which roles
exist, which fonts). It scans every .ts and .tsx file of mobile/app and mobile/src except tests, mobile/src/theme and the generated or
sample-data files listed in EXCLUDE_FILES. tools/design-audit/README.md says what each category counts.

How it reads. lexer.py turns a file into tokens (JSX aware, brackets balanced, comments kept apart). This file indexes the tokens (bracket
matching, JSX elements and attributes, function scope, style "records": the key: value pairs of object literals and JSX attributes whose key
is a style property), classifies the VALUE of each record (a literal number or string, a token reference such as space[4] or role.text, a
named constant it can resolve, or something computed, which is never a violation), and turns the events into violations. It matched the
TypeScript compiler's own AST on 5,633 of 5,634 counts (tools/design-audit/oracle.js, tools/tests/test_design_audit.py).

Exceptions. A comment `design-lint-ignore: <category> <reason>` on the line, or alone on the line above it, lets one line leave the rule. The
reason is required; an ignore without one, with an unknown category, or that excuses nothing is a violation of its own.
"""
import argparse
import bisect
import collections
import hashlib
import json
import os
import posixpath
import re
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lexer import lex, match_brackets  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_REPO = os.path.dirname(os.path.dirname(HERE))
BASELINE_NAME = 'baseline.json'

# --------------------------------------------------------------------------------------------------------------
# Which files are scanned
# --------------------------------------------------------------------------------------------------------------
EXCLUDE_DIRS = {'node_modules', '__tests__', '.cache'}
EXCLUDE_PREFIXES = ('src/theme/',)   # where the tokens are defined
EXCLUDE_FILES = {                    # path below mobile/ -> why
    'src/components/fixedColors.ts': 'defines the FIXED palette (a token file)',
    'src/data/mock.ts': 'sample data: only tint hex strings for sample photos',
    'src/features/library/bookBundle.ts': 'generated bundle (tools/build_books.py)',
    'src/features/library/bible/webc.generated.ts': 'generated data',
}
GOOGLE_G_FILE = 'GoogleButton.tsx'   # the four colours of the Google G are mandated by Google: not a violation
GOOGLE_G_HEX = ('#4285F4', '#34A853', '#FBBC05', '#EA4335')

# --------------------------------------------------------------------------------------------------------------
# Style property vocabulary
# --------------------------------------------------------------------------------------------------------------
COLOR_KEYS = {
    'color', 'backgroundColor', 'borderColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor',
    'borderStartColor', 'borderEndColor', 'shadowColor', 'textShadowColor', 'tintColor', 'textDecorationColor',
    'placeholderTextColor', 'selectionColor', 'underlayColor', 'overlayColor', 'thumbColor', 'trackColor', 'fill', 'stroke',
    'ios_backgroundColor', 'outlineColor', 'cursorColor', 'selectionHandleColor', 'activeTintColor', 'inactiveTintColor',
}
FONT_KEYS = {'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'fontWeight', 'fontStyle'}
PAD_KEYS = {'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'paddingHorizontal', 'paddingVertical',
            'paddingStart', 'paddingEnd'}
MARGIN_KEYS = {'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical',
               'marginStart', 'marginEnd'}
GAP_KEYS = {'gap', 'rowGap', 'columnGap'}
SPACING_KEYS = PAD_KEYS | MARGIN_KEYS | GAP_KEYS
OFFSET_KEYS = {'top', 'left', 'right', 'bottom', 'start', 'end', 'inset'}
RADIUS_KEYS = {'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius',
               'borderTopStartRadius', 'borderTopEndRadius', 'borderBottomStartRadius', 'borderBottomEndRadius'}
BORDERW_KEYS = {'borderWidth', 'borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth', 'borderStartWidth',
                'borderEndWidth', 'outlineWidth'}
SHADOW_KEYS = {'shadowColor', 'shadowOpacity', 'shadowRadius', 'shadowOffset', 'elevation', 'boxShadow', 'textShadowRadius',
               'textShadowOffset'}
SIZE_KEYS = {'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight'}
LAYOUT_KEYS = {'flex', 'flexDirection', 'alignItems', 'justifyContent', 'alignSelf', 'position', 'overflow', 'flexWrap', 'flexGrow',
               'flexShrink', 'flexBasis', 'zIndex', 'aspectRatio', 'textAlign', 'textTransform', 'opacity', 'borderStyle',
               'textDecorationLine', 'resizeMode', 'objectFit'}
ALL_KEYS = (COLOR_KEYS | FONT_KEYS | SPACING_KEYS | OFFSET_KEYS | RADIUS_KEYS | BORDERW_KEYS | SHADOW_KEYS | SIZE_KEYS | LAYOUT_KEYS)
MAPLIBRE_COLOR = re.compile(r'^[a-z-]*-color$')

INTERACTIVE = re.compile(r'^(Pressable|Touchable\w*|IconButton|IconTap|Button|\w+Button|Chip|Fab|Pill|\w*Toggle)$')
ICON_TAG = re.compile(r'^(Icon|MapIcon|\w+Icon)$')
NAMED_COLORS = {
    'white', 'black', 'red', 'green', 'blue', 'gray', 'grey', 'yellow', 'orange', 'purple', 'pink', 'brown', 'silver', 'gold',
    'navy', 'teal', 'cyan', 'magenta', 'maroon', 'lime', 'olive', 'aqua', 'fuchsia', 'violet', 'indigo', 'beige', 'ivory', 'tan',
    'coral', 'salmon', 'crimson', 'whitesmoke', 'lightgray', 'lightgrey', 'darkgray', 'darkgrey', 'darkblue', 'lightblue',
}

HEX_FULL = re.compile(r'^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$')
HEX_ANY = re.compile(r'#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z])')
FUNC_COLOR = re.compile(r'\b(rgba?|hsla?)\(\s*[^)]*\)', re.I)

CONTROL_KW = {'if', 'for', 'while', 'switch', 'catch', 'with'}


# --------------------------------------------------------------------------------------------------------------
# The standard, read from the repo (never hard-coded)
# --------------------------------------------------------------------------------------------------------------
class Standard:
    """The allowed values. design/tokens.json is the single source of truth; mobile/src/theme/index.ts says which roles and fonts the code can use."""

    def __init__(self, repo, mobile):
        with open(os.path.join(repo, 'design', 'tokens.json'), encoding='utf-8') as f:
            T = json.load(f)
        self.T = T
        self.palette = dict(T['color'])
        self.dark_palette = {**T['color'], **T['dark']['color']}
        self.space = dict(T['space'])
        self.space_vals = sorted(set(self.space.values()))
        self.space_key = {v: k for k, v in self.space.items()}   # 16 -> '4': the step to write as space[4]
        self.layout = dict(T['layout'])
        self.radius = dict(T['radius'])
        self.radius_vals = sorted(set(self.radius.values()))
        self.text = {k: v for k, v in T['text'].items() if isinstance(v, dict)}
        self.font_sizes = sorted({v['size'] for v in self.text.values()})
        self.line_heights = sorted({v['lineHeight'] for v in self.text.values()})
        self.letter_spacings = sorted({v.get('letterSpacing', 0) for v in self.text.values() if v.get('letterSpacing', 0) != 0})
        self.smallest_font = min(self.font_sizes)
        self.icon = {k: v for k, v in T['icon'].items() if isinstance(v, (int, float))}
        self.icon_sizes = sorted({v for k, v in self.icon.items() if k != 'stroke'})   # every size of the scale: sm, smPlus, md, mdPlus, lg
        self.icon_name = {v: k for k, v in self.icon.items() if k != 'stroke'}
        self.border = dict(T['border'])
        self.border_vals = sorted(set(self.border.values()))
        self.touch_hard = self.layout.get('touchHard', 48)                                # the hard minimum
        self.touch_primary = self.layout.get('touchPrimary', self.layout.get('touchMin', 56))   # the target for primary actions
        self.card_padding = self.layout.get('cardPadding', 20)
        self.inset_min = self.space['2']                                                   # room between text and the outline of a card, a pill, a tile
        self.shadow = dict(T['shadow'])
        # what the theme exports: parsed from theme/index.ts so the list is the code's, not a copy
        with open(os.path.join(mobile, 'src/theme/index.ts'), encoding='utf-8') as f:
            theme_src = f.read()
        self.theme_src = theme_src
        self.exported_roles = {}
        for m in re.finditer(r"^\s{2}(\w+): pick\('(\w+)', k, scheme\),", theme_src, re.M):
            self.exported_roles[m.group(1)] = m.group(2)
        fonts_block = theme_src.split('export const fonts')[1].split('} as const')[0] if 'export const fonts' in theme_src else ''
        self.font_values = {m.group(2): m.group(1) for m in re.finditer(r"^\s{2}(\w+): '([A-Za-z0-9_]+)',", fonts_block, re.M)}
        # light hex of every exported role
        self.role_light_hex = {}
        for name, tokname in self.exported_roles.items():
            val = T['role'][tokname]
            self.role_light_hex[name] = (val if val.startswith('#') else self.palette[val]).upper()
        self.hex_to_roles = collections.defaultdict(list)
        for r, h in self.role_light_hex.items():
            if r.startswith('tab'):
                continue  # tabActive / tabInactive / tabBar / tabBarBorder: "only the tab bar uses it", never a general replacement for a palette colour
            self.hex_to_roles[h].append(r)
        # palette name -> exported roles with the same light value
        self.palette_roles = {n: sorted(self.hex_to_roles.get(h.upper(), [])) for n, h in self.palette.items()}
        self.hex_to_names = collections.defaultdict(list)
        for n, h in self.palette.items():
            self.hex_to_names[h.upper()].append(n)
        # every colour value the standard owns (light, dark, role literals, shadows; FIXED and scrim below)
        self.standard_hexes = set(h.upper() for h in self.dark_palette.values()) | set(h.upper() for h in self.palette.values())
        for v in T['dark']['role'].values():
            if v.startswith('#'):
                self.standard_hexes.add(v.upper())
        for v in T['shadow'].values():
            self.standard_hexes.add(v['color'].upper())
        # FIXED (src/components/fixedColors.ts) and scrim (theme/index.ts): colours the app owns besides tokens.json
        self.fixed_values = {}   # name -> (hex, alpha)
        fp = os.path.join(mobile, 'src/components/fixedColors.ts')
        if os.path.exists(fp):
            with open(fp, encoding='utf-8') as f:
                fsrc = f.read()
            for m in re.finditer(r"^\s+(\w+): t\.(\w+),", fsrc, re.M):
                if m.group(2) in self.palette:
                    self.fixed_values[m.group(1)] = (self.palette[m.group(2)].upper(), None)
            for m in re.finditer(r"^\s+(\w+): rgba\(t\.(\w+), ([\d.]+)\),", fsrc, re.M):
                if m.group(2) in self.palette:
                    self.fixed_values[m.group(1)] = (self.palette[m.group(2)].upper(), float(m.group(3)))
            if 'export const FIXED' in fsrc:
                for m in re.finditer(r"^\s+(\w+): '([^']+)',", fsrc.split('export const FIXED')[1], re.M):
                    hx, alpha, kind = parse_color(m.group(2))
                    if hx:
                        self.fixed_values[m.group(1)] = (hx, alpha)
        mscrim = re.search(r"export const scrim = '([^']+)'", theme_src)
        if mscrim:
            hx, alpha, kind = parse_color(mscrim.group(1))
            self.fixed_values['scrim'] = (hx, alpha)
        self.fixed_hex_names = collections.defaultdict(list)
        for nm, (hx, al) in self.fixed_values.items():
            self.fixed_hex_names[hx].append(nm)
        self.owned_hexes = set(self.standard_hexes) | set(self.fixed_hex_names)


# --------------------------------------------------------------------------------------------------------------
# Colour helpers
# --------------------------------------------------------------------------------------------------------------
def norm_hex(h):
    h = h.lstrip('#').upper()
    if len(h) in (3, 4):
        h = ''.join(ch * 2 for ch in h)
    return '#' + h


def rgb_hex(r, g, b):
    return '#%02X%02X%02X' % (max(0, min(255, int(round(r)))), max(0, min(255, int(round(g)))), max(0, min(255, int(round(b)))))


def parse_color(text):
    """Return (hex_rgb or None, alpha or None, kind) for a colour literal."""
    t = text.strip()
    if HEX_FULL.match(t):
        h = norm_hex(t)
        alpha = None
        if len(h) == 9:
            alpha = int(h[7:9], 16) / 255
            h = h[:7]
        return h, alpha, 'hex'
    m = re.match(r'(?i)^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$', t)
    if m:
        a = m.group(4)
        alpha = None
        if a:
            alpha = float(a[:-1]) / 100 if a.endswith('%') else float(a)
        return rgb_hex(float(m.group(1)), float(m.group(2)), float(m.group(3))), alpha, 'rgba' if alpha is not None else 'rgb'
    if re.match(r'(?i)^hsla?\(', t):
        return None, None, 'hsl'
    return None, None, 'other'


# --------------------------------------------------------------------------------------------------------------
# One file, indexed
# --------------------------------------------------------------------------------------------------------------
class Rec:
    __slots__ = ('key', 'kidx', 'vs', 've', 'obj', 'line', 'attr', 'elem', 'infn', 'is_attr', 'strkey')

    def __init__(self, key, kidx, vs, ve, obj, line, is_attr=False):
        self.key = key
        self.kidx = kidx
        self.vs = vs
        self.ve = ve
        self.obj = obj
        self.line = line
        self.attr = None  # (elem index, attr name) of the innermost JSX attribute around the key
        self.elem = None
        self.infn = True
        self.is_attr = is_attr


class Elem:
    __slots__ = ('i', 'name', 'open', 'end_open', 'selfclose', 'close', 'parent', 'attrs', 'kids', 'line')

    def __init__(self, i, name, open_idx, line):
        self.i = i
        self.name = name
        self.open = open_idx
        self.end_open = None
        self.selfclose = False
        self.close = None
        self.parent = None
        self.attrs = {}   # name -> (attr token idx, value start, value end) ; value range is empty for strings/booleans
        self.kids = []
        self.line = line


class FileIdx:
    def __init__(self, root, path, std):
        self.path = path
        self.rel = os.path.relpath(path, root).replace(os.sep, '/')
        with open(path, encoding='utf-8') as f:
            self.src = f.read()
        self.src_lines = self.src.split('\n')
        self.nlines = len(self.src_lines) - (1 if self.src.endswith('\n') else 0)
        self.is_tsx = path.endswith('.tsx')
        self.toks, self.lex_errors, self.comments = lex(self.src, self.is_tsx)
        self.match, self.parent, self.bad = match_brackets(self.toks)
        self.std = std
        self.imports = self._imports()
        self.elems = []
        self.attr_at = {}
        self._build_elems()
        self.infn = self._fn_scope()
        self.recs = []
        self.recs_by_obj = collections.defaultdict(list)
        self._build_records()
        self.consts = self._local_consts()

    # ---- helpers on tokens --------------------------------------------------------------------------------
    def tv(self, i):
        return self.toks[i].v if 0 <= i < len(self.toks) else None

    def line_text(self, line, width=170):
        if 1 <= line <= len(self.src_lines):
            return self.src_lines[line - 1].strip()[:width]
        return ''

    def _imports(self):
        out = {}
        for m in re.finditer(r"import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*'([^']+)'", self.src):
            for part in m.group(1).split(','):
                part = part.strip()
                if not part:
                    continue
                part = re.sub(r'^type\s+', '', part)
                if ' as ' in part:
                    orig, local = [x.strip() for x in part.split(' as ')]
                else:
                    orig = local = part
                out[local] = (orig, m.group(2))
        for m in re.finditer(r"import\s+(\w+)\s*(?:,\s*\{[^}]*\})?\s*from\s*'([^']+)'", self.src):
            out[m.group(1)] = ('default', m.group(2))
        return out

    def theme_names(self):
        """local names bound to the theme exports ('c', 'role', 'layout', ...) in this file."""
        names = {}
        for local, (orig, mod) in self.imports.items():
            if mod in ('@/theme', '@/theme/index') or (mod.endswith('/theme') and mod.startswith('.')):
                names[local] = orig
            if mod.endswith('fixedColors') and orig == 'FIXED':
                names[local] = 'FIXED'
        return names

    # ---- JSX elements ----------------------------------------------------------------------------------------
    def _build_elems(self):
        toks = self.toks
        tag_stack = []
        elem_stack = []
        for i, t in enumerate(toks):
            tt = t.t
            if tt == 'jsx_open':
                e = Elem(len(self.elems), t.v, i, t.line)
                e.parent = elem_stack[-1] if elem_stack else None
                self.elems.append(e)
                tag_stack.append(e)
                elem_stack.append(e)
            elif tt == 'jsx_attr':
                if tag_stack:
                    e = tag_stack[-1]
                    nxt = toks[i + 1] if i + 1 < len(toks) else None
                    if nxt is not None and nxt.t == 'p' and nxt.v == '{' and nxt.flag == 'jsxexpr':
                        e.attrs[t.v] = (i, i + 2, self.match.get(i + 1, i + 2))
                    elif nxt is not None and nxt.t == 'str' and nxt.flag == 'jsxattrval':
                        e.attrs[t.v] = (i, i + 1, i + 1)
                    else:
                        e.attrs[t.v] = (i, i, i)
            elif tt == 'jsx_gt':
                if tag_stack:
                    tag_stack.pop().end_open = i
            elif tt == 'jsx_selfclose':
                if tag_stack:
                    e = tag_stack.pop()
                    e.end_open = i
                    e.selfclose = True
                    e.close = i
                    if elem_stack:
                        elem_stack.pop()
            elif tt == 'jsx_close':
                if elem_stack:
                    e = elem_stack.pop()
                    e.close = i
        for e in self.elems:
            if e.parent is not None and e.parent.end_open is not None and e.open > e.parent.end_open:
                e.parent.kids.append(e)
        # attribute context per token (innermost attribute value that contains the token)
        for e in self.elems:
            for name, (ai, vs, ve) in e.attrs.items():
                if ve > vs and toks[ai + 1].t == 'p':
                    for k in range(vs, ve):
                        self.attr_at[k] = (e.i, name)
        self.elem_at_open = {e.open: e for e in self.elems}

    def desc_elems(self, e):
        if e.end_open is None or e.close is None or e.selfclose:
            return []
        return [x for x in self.elems if e.end_open < x.open < e.close]

    # ---- function scope: is token i inside any function (arrow, function, method)? -----------------------
    def _fn_scope(self):
        toks, match = self.toks, self.match
        n = len(toks)
        infn = [False] * n
        brk = []
        arrow_levels = []
        fn_count = 0
        pending_arrow = False
        for i in range(n):
            t = toks[i]
            if pending_arrow and not (t.t == 'p' and t.v == '{'):
                arrow_levels.append(len(brk))
                pending_arrow = False
            infn[i] = fn_count > 0 or bool(arrow_levels)
            if t.t != 'p':
                continue
            v = t.v
            if v == '=>':
                pending_arrow = True
            elif v == '{':
                isfn = pending_arrow or self._is_fn_brace(i)
                pending_arrow = False
                brk.append(isfn)
                if isfn:
                    fn_count += 1
            elif v == '(':
                m = match.get(i)
                isfn = False
                if m is not None and m + 1 < n and toks[m + 1].t == 'p' and toks[m + 1].v == '=>':
                    isfn = True
                elif i >= 1 and toks[i - 1].t == 'id' and toks[i - 1].v == 'function':
                    isfn = True
                elif i >= 2 and toks[i - 2].t == 'id' and toks[i - 2].v == 'function':
                    isfn = True
                brk.append(isfn)
                if isfn:
                    fn_count += 1
            elif v == '[':
                brk.append(False)
            elif v in ('}', ')', ']'):
                if brk:
                    if brk.pop():
                        fn_count -= 1
                while arrow_levels and arrow_levels[-1] > len(brk):
                    arrow_levels.pop()
            elif v in (',', ';'):
                while arrow_levels and arrow_levels[-1] == len(brk):
                    arrow_levels.pop()
        return infn

    def _is_fn_brace(self, i):
        toks = self.toks
        p = toks[i - 1] if i > 0 else None
        if p is None:
            return False
        j = i - 1
        # `): Type {` (a TypeScript return type): walk back over the type to the ':' and then to ')'
        if p.t != 'p' or p.v in ('>', ']', '}'):
            k = i - 1
            steps = 0
            while k > 0 and steps < 14:
                tk = toks[k]
                if tk.t == 'p' and tk.v == ':':
                    if toks[k - 1].t == 'p' and toks[k - 1].v == ')':
                        j = k - 1
                        p = toks[j]
                    break
                if tk.t == 'p' and tk.v in (';', '{', '=', '=>', '(', ',', '}'):
                    break
                k -= 1
                steps += 1
        if p.t == 'p' and p.v == ')':
            o = self.match.get(j)
            if o is None or o < 1:
                return False
            q = toks[o - 1]
            if q.t == 'id' and q.v in CONTROL_KW:
                return False
            if q.t == 'id':
                return True
            if q.t == 'p' and q.v in ('>', '>>'):
                return True  # function Name<T extends X>(...) {
        return False

    # ---- style records ---------------------------------------------------------------------------------------
    def is_object_brace(self, o):
        """Is the '{' at token index o an object literal (not a block, a class/interface body ...)?"""
        toks = self.toks
        t = toks[o]
        if t.flag in ('tplopen', 'jsxexpr'):
            return False
        p = toks[o - 1] if o > 0 else None
        if p is None:
            return False
        if p.t == 'p':
            return p.v in ('(', ',', '=', ':', '?', '[', '{', '&&', '||', '??', '...', '!')
        if p.t == 'id':
            return p.v in ('return', 'default', 'yield', 'await', 'as')
        return False

    def _build_records(self):
        toks, match, parent = self.toks, self.match, self.parent
        n = len(toks)
        for i in range(n - 1):
            t = toks[i]
            nxt = toks[i + 1]
            # JSX attribute records: size={..}, color={..}, strokeWidth={..} ...
            if t.t == 'jsx_attr':
                continue
            if t.t in ('id', 'str') and nxt.t == 'p' and nxt.v == ':' and i > 0:
                key = t.v
                strkey = t.t == 'str'
                if strkey:
                    if not MAPLIBRE_COLOR.match(key):
                        continue
                elif key not in ALL_KEYS:
                    continue
                pv = toks[i - 1]
                if not (pv.t == 'p' and pv.v in ('{', ',')):
                    continue
                o = parent[i]
                if o < 0 or toks[o].t != 'p' or toks[o].v != '{':
                    continue
                if not self.is_object_brace(o):
                    continue
                vs = i + 2
                ve = self._value_end(vs, o)
                r = Rec(key, i, vs, ve, o, t.line)
                r.strkey = strkey
                a = self.attr_at.get(i)
                r.attr = a
                r.elem = self.elems[a[0]] if a else None
                r.infn = self.infn[i]
                self.recs.append(r)
                self.recs_by_obj[o].append(r)
        # JSX attribute records (as Rec with is_attr)
        for e in self.elems:
            for name, (ai, vs, ve) in e.attrs.items():
                r = Rec(name, ai, vs, ve, -1, self.toks[ai].line, is_attr=True)
                r.attr = (e.i, name)
                r.elem = e
                r.infn = self.infn[ai]
                r.strkey = False
                self.recs.append(r)

    def _value_end(self, vs, o):
        """index one past the last token of the value that starts at vs inside the object opened at o."""
        toks, match = self.toks, self.match
        end_obj = match.get(o, len(toks))
        j = vs
        while j < end_obj:
            t = toks[j]
            if t.t == 'p':
                if t.v in ('{', '(', '['):
                    j = match.get(j, j) + 1
                    continue
                if t.v == ',':
                    return j
            j += 1
        return end_obj

    # ---- leaves of a value ------------------------------------------------------------------------------------
    def leaves(self, vs, ve):
        """Flat list of (kind, value, idx, neg) for a value expression.
        kind: num | str | ref (theme token chain) | id (other identifier chain) | call (function call name)"""
        toks, match = self.toks, self.match
        out = []
        j = vs
        tn = self.theme_names()
        while j < ve:
            t = toks[j]
            if t.t == 'num':
                prev = toks[j - 1] if j > vs else None
                nxt = toks[j + 1] if j + 1 < ve else None
                scale = (prev is not None and prev.t == 'p' and prev.v in ('*', '/', '%')) or (nxt is not None and nxt.t == 'p' and nxt.v in ('*', '/', '%'))
                index = (prev is not None and prev.t == 'p' and prev.v == '[')
                if not scale and not index:
                    neg = False
                    if prev is not None and prev.t == 'p' and prev.v == '-':
                        pp = toks[j - 2] if j - 2 >= vs else None
                        if pp is None or (pp.t == 'p' and pp.v not in (')', ']')):
                            neg = True
                    out.append(('num', t.n, j, neg))
                j += 1
            elif t.t == 'str':
                out.append(('str', t.v, j, False))
                j += 1
            elif t.t == 'id':
                if t.v in ('true', 'false', 'null', 'undefined', 'typeof', 'as', 'const', 'void', 'new'):
                    j += 1
                    continue
                chain = [t.v]
                k = j + 1
                while k + 1 < ve and toks[k].t == 'p' and toks[k].v in ('.', '?.') and toks[k + 1].t == 'id':
                    chain.append(toks[k + 1].v)
                    k += 2
                name = '.'.join(chain)
                if k < ve and toks[k].t == 'p' and toks[k].v in ('?', '&&', '===', '!==', '==', '!=', '<', '>', '<=', '>='):
                    j = k  # an operand of a condition (cond ? a : b, x && a, x === 0): not a value
                    continue
                if k < ve and toks[k].t == 'p' and toks[k].v == '(':
                    close = match.get(k, k)
                    if name.startswith('Math.'):
                        j = k + 1  # descend into the arguments
                        continue
                    out.append(('call', name, j, False))
                    j = close + 1
                    continue
                if k < ve and toks[k].t == 'p' and toks[k].v == '[':
                    close = match.get(k, k)
                    if len(chain) == 1 and tn.get(chain[0]) == 'space':
                        # space[4]: a step of the spacing scale, a token use; space[step] with a variable is one too
                        step = toks[k + 1] if k + 2 == close else None
                        key = None
                        if step is not None and step.t == 'num' and float(step.n).is_integer():
                            key = str(int(step.n))
                        elif step is not None and step.t == 'str' and step.v.isdigit():
                            key = step.v   # space['2'], the way the tile grid writes it
                        out.append(('ref', 'space.' + (key if key is not None else '?'), j, False))
                    else:
                        out.append(('id', name + '[]', j, False))  # indexing: a lookup, not a value we can read
                    j = close + 1
                    continue
                if chain[0] in tn and len(chain) >= 1:
                    orig = tn[chain[0]]
                    out.append(('ref', orig + ('.' + '.'.join(chain[1:]) if len(chain) > 1 else ''), j, False))
                else:
                    out.append(('id', name, j, False))
                j = k
            elif t.t == 'p' and t.v in ('{', '['):
                j = match.get(j, j) + 1
            else:
                j += 1
        return out

    # ---- constants ---------------------------------------------------------------------------------------------
    def _local_consts(self):
        """const NAME = <number>  (also  -N, and  N ? ... no). Returns name -> (value, line)."""
        out = {}
        toks = self.toks
        for i in range(len(toks) - 3):
            if toks[i].t == 'id' and toks[i].v in ('const', 'let') and toks[i + 1].t == 'id' and toks[i + 2].t == 'p' and toks[i + 2].v == '=':
                j = i + 3
                neg = False
                if toks[j].t == 'p' and toks[j].v == '-':
                    neg = True
                    j += 1
                if toks[j].t == 'num' and (toks[j + 1].t == 'p' and toks[j + 1].v in (';', ',') or toks[j + 1].line != toks[j].line or toks[j + 1].t == 'id'):
                    out[toks[i + 1].v] = (-toks[j].n if neg else toks[j].n, toks[i + 1].line)
        return out

    # ---- tiny expression evaluator -------------------------------------------------------------------------------
    def param_defaults(self, comp):
        """`size = 44` defaults in the destructured props of component `comp` -> {name: value}."""
        cache = self.__dict__.setdefault('_pd', {})
        if comp in cache:
            return cache[comp]
        out = {}
        toks = self.toks
        for i in range(len(toks) - 2):
            if toks[i].t == 'id' and toks[i].v == comp and i > 0 and toks[i - 1].t == 'id' and toks[i - 1].v in ('function', 'const'):
                j = i + 1
                while j < len(toks) and not (toks[j].t == 'p' and toks[j].v == '('):
                    if toks[j].t == 'p' and toks[j].v in (';', '{') or j - i > 8:
                        break
                    j += 1
                if j < len(toks) and toks[j].v == '(':
                    e = self.match.get(j, j)
                    for k in range(j, e - 2):
                        if toks[k].t == 'id' and toks[k + 1].t == 'p' and toks[k + 1].v == '=' and toks[k + 2].t == 'num' and toks[k - 1].v in ('{', ','):
                            out[toks[k].v] = toks[k + 2].n
                break
        cache[comp] = out
        return out

    def eval_expr(self, vs, ve, project=None, comp=None):
        """Evaluate a numeric expression. Returns a frozenset of possible values, or None when anything is not resolvable.
        Supports numbers, theme refs (layout.x, space.n, radius.x), same-file / imported consts, component param defaults,
        + - * / %, unary minus, ternaries (union of both branches), Math.max/min/round/floor/ceil/abs."""
        toks = self.toks
        S = self.std
        pos = [vs]
        P = project

        def peek():
            return toks[pos[0]] if pos[0] < ve else None

        def isp(t, *vals):
            return t is not None and t.t == 'p' and t.v in vals

        def lift(a, b, f):
            if a is None or b is None:
                return None
            out = set()
            for x in a:
                for y in b:
                    try:
                        out.add(f(x, y))
                    except ZeroDivisionError:
                        return None
            return frozenset(out) if len(out) <= 16 else None

        def ternary():
            a = oro()
            if isp(peek(), '?'):
                pos[0] += 1
                b = ternary()
                if isp(peek(), ':'):
                    pos[0] += 1
                    c = ternary()
                else:
                    return None
                if b is None or c is None:
                    return None
                return b | c
            return a

        def oro():
            left = add()
            while isp(peek(), '||', '&&', '??', '==', '===', '!=', '!==', '<', '>', '<=', '>='):
                op = peek().v
                pos[0] += 1
                right = add()
                if op in ('||', '??', '&&') and left is not None and right is not None:
                    left = left | right
                else:
                    left = None
            return left

        def add():
            left = mul()
            while isp(peek(), '+', '-'):
                op = peek().v
                pos[0] += 1
                right = mul()
                left = lift(left, right, (lambda x, y: x + y) if op == '+' else (lambda x, y: x - y))
            return left

        def mul():
            left = unary()
            while isp(peek(), '*', '/', '%'):
                op = peek().v
                pos[0] += 1
                right = unary()
                f = {'*': lambda x, y: x * y, '/': lambda x, y: x / y, '%': lambda x, y: x % y}[op]
                left = lift(left, right, f)
            return left

        def unary():
            t = peek()
            if isp(t, '-'):
                pos[0] += 1
                v = unary()
                return None if v is None else frozenset(-x for x in v)
            if isp(t, '+'):
                pos[0] += 1
                return unary()
            return primary()

        def primary():
            t = peek()
            if t is None:
                return None
            if t.t == 'num':
                pos[0] += 1
                return frozenset([t.n])
            if isp(t, '('):
                pos[0] += 1
                v = ternary()
                if isp(peek(), ')'):
                    pos[0] += 1
                    return v
                return None
            if t.t == 'id':
                chain = [t.v]
                k = pos[0] + 1
                while k + 1 < ve and toks[k].t == 'p' and toks[k].v in ('.', '?.') and toks[k + 1].t == 'id':
                    chain.append(toks[k + 1].v)
                    k += 2
                name = '.'.join(chain)
                if k < ve and toks[k].t == 'p' and toks[k].v == '(':
                    close = self.match.get(k, k)
                    if name in ('Math.max', 'Math.min', 'Math.round', 'Math.floor', 'Math.ceil', 'Math.abs'):
                        args = []
                        a_s = k + 1
                        j = a_s
                        while j < close:
                            tj = toks[j]
                            if tj.t == 'p' and tj.v in ('(', '[', '{'):
                                j = self.match.get(j, j) + 1
                                continue
                            if tj.t == 'p' and tj.v == ',':
                                args.append((a_s, j))
                                a_s = j + 1
                            j += 1
                        args.append((a_s, close))
                        vals = [self.eval_expr(a, b, project, comp) for a, b in args if b > a]
                        pos[0] = close + 1
                        if not vals or any(v is None for v in vals):
                            return None
                        fn = name.split('.')[1]
                        if fn in ('max', 'min'):
                            f = max if fn == 'max' else min
                            acc = vals[0]
                            for v in vals[1:]:
                                acc = lift(acc, v, lambda x, y: f(x, y))
                            return acc
                        f = {'round': round, 'floor': lambda x: float(int(x // 1)), 'ceil': lambda x: float(-(-x // 1)), 'abs': abs}[fn]
                        return frozenset(f(x) for x in vals[0])
                    pos[0] = close + 1
                    return None
                tn = self.theme_names()
                if len(chain) == 1 and tn.get(chain[0]) == 'space' and k < ve and toks[k].t == 'p' and toks[k].v == '[':
                    close = self.match.get(k, k)
                    pos[0] = close + 1
                    step = toks[k + 1] if k + 2 == close else None
                    key = None
                    if step is not None and step.t == 'num' and float(step.n).is_integer():
                        key = str(int(step.n))
                    elif step is not None and step.t == 'str':
                        key = step.v
                    if key in S.space:
                        return frozenset([float(S.space[key])])
                    return None
                pos[0] = k
                if chain[0] in tn and len(chain) == 2:
                    table = {'layout': S.layout, 'space': S.space, 'radius': S.radius, 'icon': S.icon, 'border': S.border, 'z': S.T.get('z', {})}.get(tn[chain[0]])
                    if table is not None and isinstance(table.get(chain[1]), (int, float)):
                        return frozenset([float(table[chain[1]])])
                    return None
                if chain[0] in tn and len(chain) == 3 and tn[chain[0]] == 'text' and chain[1] in S.text and chain[2] in ('size', 'lineHeight', 'letterSpacing'):
                    return frozenset([float(S.text[chain[1]].get(chain[2], 0))])
                if len(chain) >= 2 and P is not None:
                    cands = P.linked_candidates(self, chain[-1])
                    if cands and len(cands) == 1:
                        return frozenset(float(x) for x in cands[0][0])
                if len(chain) == 1:
                    if name in self.consts:
                        return frozenset([self.consts[name][0]])
                    if P is not None:
                        cv, via = P.resolve_const(self, name)
                        if cv is not None:
                            return frozenset([cv])
                    if comp:
                        pd = self.param_defaults(comp)
                        if name in pd:
                            return frozenset([pd[name]])
                return None
            pos[0] += 1
            return None

        v = ternary()
        if pos[0] != ve:
            return None
        return v

    # ---- style objects of an element ------------------------------------------------------------------------
    def style_objects(self, e, attr='style'):
        """open-brace indices of the object literals directly inside the `attr` value of element e (not nested inside another),
        resolving a plain identifier to a same-file `const NAME = {...}`."""
        a = e.attrs.get(attr)
        if not a or a[2] <= a[1]:
            return [], False
        vs, ve = a[1], a[2]
        objs = []
        j = vs
        unresolved = False
        toks = self.toks
        while j < ve:
            t = toks[j]
            if t.t == 'p' and t.v == '{' and self.is_object_brace(j):
                objs.append(j)
                j = self.match.get(j, j) + 1
                continue
            if t.t == 'id' and not (j > 0 and toks[j - 1].t == 'p' and toks[j - 1].v in ('.', '?.')) and not (j + 1 < ve and toks[j + 1].t == 'p' and toks[j + 1].v in ('(', '.')):
                # style={input} / style={[input, { opacity: 0.6 }]}: a reference to a same-file `const input = {...}`
                found = self._find_const_object(t.v)
                if found is not None and found not in objs:
                    objs.append(found)
            j += 1
        if not objs:
            unresolved = True
        return sorted(objs), unresolved

    def _find_const_object(self, name):
        toks = self.toks
        for i in range(len(toks) - 3):
            if toks[i].t == 'id' and toks[i].v in ('const', 'let') and toks[i + 1].v == name and toks[i + 2].v == '=':
                j = i + 3
                if toks[j].t == 'p' and toks[j].v == '{' and self.is_object_brace(j):
                    return j
                if toks[j].t == 'p' and toks[j].v == '(':
                    # const name = () => ({ ... }) : not a plain style
                    return None
        return None

    def obj_owner(self, o):
        """('key', name) | ('attr', name) | ('call', name) | (None, None): what an object literal is the value of."""
        toks = self.toks
        p = toks[o - 1] if o > 0 else None
        if p is None:
            return (None, None)
        if p.t == 'p' and p.v == ':' and o >= 2:
            return ('key', toks[o - 2].v)
        a = self.attr_at.get(o)
        if p.t == 'p' and p.v == '{' and p.flag == 'jsxexpr' and a:
            return ('attr', a[1])
        if p.t == 'p' and p.v == '(' and o >= 2 and toks[o - 2].t == 'id':
            return ('call', toks[o - 2].v)
        return (None, None)

    def enclosing_component(self, line):
        """Nearest declaration at column 0 above `line`: function Name / const Name = ... (PascalCase) -> Name."""
        for ln in range(line, 0, -1):
            m = re.match(r'^(?:export\s+)?(?:default\s+)?(?:function|const)\s+([A-Za-z_]\w*)', self.src_lines[ln - 1])
            if m:
                return m.group(1)
        return None


# --------------------------------------------------------------------------------------------------------------
# Project-level tables
# --------------------------------------------------------------------------------------------------------------
class Project:
    def __init__(self, root, repo=None):
        self.root = root                                  # the mobile/ folder
        self.repo = repo or os.path.dirname(root)         # the repository root (design/tokens.json is below it)
        self.std = Standard(self.repo, root)
        self.files = []
        self.skipped = []
        self._collect()
        self.fi = {}
        for p in self.files:
            self.fi[p] = FileIdx(root, p, self.std)
        self.by_rel = {fx.rel: fx for fx in self.fi.values()}
        self.global_consts = collections.defaultdict(list)   # exported const NAME = N
        self.named_num = collections.defaultdict(list)       # name -> [(values, file, line)] (identifier assigned literal-only number expression)
        self._build_const_tables()

    def _collect(self):
        for base in ('app', 'src'):
            for dp, dn, fn in os.walk(os.path.join(self.root, base)):
                dn[:] = sorted(d for d in dn if d not in EXCLUDE_DIRS)
                for f in sorted(fn):
                    if not f.endswith(('.ts', '.tsx')) or '.test.' in f or f.endswith('.d.ts'):
                        continue
                    p = os.path.join(dp, f)
                    rel = os.path.relpath(p, self.root).replace(os.sep, '/')
                    if rel in EXCLUDE_FILES or rel.startswith(EXCLUDE_PREFIXES) or f.endswith('.generated.ts'):
                        self.skipped.append(rel)
                        continue
                    self.files.append(p)

    def _build_const_tables(self):
        for p, fx in self.fi.items():
            for name, (val, line) in fx.consts.items():
                self.global_consts[name].append((val, fx.rel, line))
            # identifiers assigned a literal-only expression that look like paddings (padX, gutter, inset...)
            toks = fx.toks
            for i in range(len(toks) - 3):
                if toks[i].t == 'id' and toks[i].v in ('const', 'let') and toks[i + 1].t == 'id' and toks[i + 2].t == 'p' and toks[i + 2].v == '=':
                    name = toks[i + 1].v
                    if re.search(r'(?i)pad|gutter|inset|margin|gap|spacing', name):
                        j = i + 3
                        vals = []
                        ok = True
                        k = j
                        while k < len(toks) and not (toks[k].t == 'p' and toks[k].v == ';') and toks[k].line - toks[j].line < 2:
                            tk = toks[k]
                            if tk.t == 'num':
                                vals.append(tk.n)
                            elif tk.t == 'id' and tk.v not in ('narrow', 'wide', 'Math', 'max', 'min', 'floor', 'round', 'ceil'):
                                ok = False
                            k += 1
                        if ok and vals:
                            self.named_num[name].append((vals, fx.rel, toks[i + 1].line))

    def imported_modules(self, fx):
        """The modules a file imports, as paths below mobile/ without an extension ('src/features/library/bible/gridMath')."""
        cache = self.__dict__.setdefault('_imported_modules', {})
        if fx.rel not in cache:
            out = set()
            for local, (orig, mod) in fx.imports.items():
                if mod.startswith('@/'):
                    out.add('src/' + mod[2:])
                elif mod.startswith('.'):
                    out.add(posixpath.normpath(posixpath.join(posixpath.dirname(fx.rel), mod)))
            cache[fx.rel] = out
        return cache[fx.rel]

    def linked_candidates(self, fx, name):
        """The constants called `name` (see _build_const_tables) that `fx` can see: in the file itself or in a file it imports. A dotted reference such as
        `grid.padX` is read through the constant `padX` only when exactly one such constant is in view; the same name in a file nobody imported says nothing
        about this value."""
        seen = self.imported_modules(fx)

        def module_of(rel):
            base = re.sub(r'\.tsx?$', '', rel)
            return base[:-len('/index')] if base.endswith('/index') else base

        return [c for c in self.named_num.get(name, []) if c[1] == fx.rel or module_of(c[1]) in seen]

    def resolve_const(self, fx, name):
        """Resolve a bare identifier to a number: same-file const first, then a project const imported into this file."""
        if name in fx.consts:
            return fx.consts[name][0], 'file'
        imp = fx.imports.get(name)
        if imp and imp[1].startswith(('.', '@/')):
            cands = self.global_consts.get(imp[0])
            if cands and len({v for v, _, _ in cands}) == 1:
                return cands[0][0], 'import'
        return None, None


# --------------------------------------------------------------------------------------------------------------
# Analysis
# --------------------------------------------------------------------------------------------------------------
def fnum(x):
    return int(x) if float(x).is_integer() else x


class Analyzer:
    def __init__(self, project):
        self.P = project
        self.S = project.std
        self.events = []
        self.file_stats = {}

    def ev(self, fx, cat, bucket, line, **kw):
        d = {'cat': cat, 'bucket': bucket, 'file': fx.rel, 'line': line}
        d.update(kw)
        self.events.append(d)
        return d

    # ---- numeric spacing-like helpers --------------------------------------------------------------------------
    def classify_num(self, val, scale):
        v = float(val)
        if v == 0:
            return 'zero'
        return 'literal_on' if any(abs(v - s) < 1e-9 for s in scale) else 'literal_off'

    def run(self):
        for p, fx in self.P.fi.items():
            self.analyze_file(fx)
        return self.events

    # ============================================================================================================
    def analyze_file(self, fx):
        S = self.S
        tn = fx.theme_names()
        self.colors_and_tokens(fx, tn)
        for r in fx.recs:
            if r.is_attr:
                self.attr_record(fx, r, tn)
            else:
                self.style_record(fx, r, tn)
        self.text_elements(fx)
        for e in fx.elems:
            if ICON_TAG.match(e.name) and 'size' not in e.attrs:
                # Icon defaults to 24 (= icon.md); MapIcon defaults to 22 (matches no icon token)
                self.ev(fx, 'size.icon', 'default_24' if e.name == 'Icon' else 'default_off', e.line, tag=e.name)
        self.shadows(fx)
        self.touch_targets(fx)
        self.inset(fx)
        self.duplicates(fx)

    # ---- color: token uses (every c.x / role.x / FIXED.x occurrence) and raw literals ---------------------------
    def colors_and_tokens(self, fx, tn):
        S = self.S
        toks = fx.toks
        n = len(toks)
        claimed_str = set()
        for i, t in enumerate(toks):
            if t.t == 'id' and t.v in tn and i + 2 < n and toks[i + 1].t == 'p' and toks[i + 1].v in ('.', '?.') and toks[i + 2].t == 'id':
                if i > 0 and toks[i - 1].t == 'p' and toks[i - 1].v in ('.', '?.'):
                    continue  # a.c.x
                root = tn[t.v]
                name = toks[i + 2].v
                ctx = self.context_key(fx, i)
                if root == 'c' and name in S.palette:
                    roles = S.palette_roles.get(name, [])
                    self.ev(fx, 'color.c', 'role_exists' if roles else 'no_role', t.line, name=name, roles=roles, ctx=ctx,
                            module_scope=not fx.infn[i], same_both_modes=(name in ('gold', 'goldBright')))
                elif root == 'role':
                    known = name in S.exported_roles
                    self.ev(fx, 'color.role', 'ok' if known else 'unknown_role', t.line, name=name, ctx=ctx, module_scope=not fx.infn[i])
                elif root in ('fixed', 'FIXED'):
                    self.ev(fx, 'color.fixed', 'ok', t.line, name=name, which=root, ctx=ctx)
                elif root == 'liturgical':
                    self.ev(fx, 'color.fixed', 'liturgical', t.line, name=name, which='liturgical', ctx=ctx)
            elif t.t == 'id' and t.v in tn and tn[t.v] == 'scrim' and not (i + 1 < n and toks[i + 1].t == 'p' and toks[i + 1].v == '.'):
                if not (i > 0 and toks[i - 1].t == 'id' and toks[i - 1].v in ('import',)) and fx.tv(i - 1) not in (',', '{') or fx.tv(i + 1) in (',', '}', ')', ']'):
                    # `scrim` used as a value (not the import specifier)
                    if self.in_import(fx, i):
                        continue
                    self.ev(fx, 'color.fixed', 'scrim', t.line, name='scrim', which='scrim', ctx=self.context_key(fx, i))
        # raw colour literals in string tokens
        for i, t in enumerate(toks):
            if t.t != 'str':
                continue
            text = t.v
            key = self.context_key(fx, i)
            is_color_ctx = key is not None and (key in COLOR_KEYS or MAPLIBRE_COLOR.match(key or '') is not None)
            found = []
            if HEX_FULL.match(text.strip()) and (is_color_ctx or True):
                # an entire string that is a hex colour: colour whatever the key (sample tints, palettes)
                found.append(text.strip())
            else:
                for m in HEX_ANY.finditer(text):
                    if text[max(0, m.start() - 4):m.start()] == 'url(':
                        continue  # fill="url(#fade)" is a reference to an SVG gradient id, not a colour
                    if is_color_ctx or t.flag == 'tpl':
                        found.append(m.group())
                for m in FUNC_COLOR.finditer(text):
                    found.append(m.group())
            for lit in found:
                hx, alpha, kind = parse_color(lit)
                on_palette = hx is not None and hx in S.owned_hexes
                names = []
                if hx:
                    at = '' if alpha is None else f' @{alpha:.2f}'
                    names = [x + at for x in S.hex_to_names.get(hx, [])]
                    for fname in S.fixed_hex_names.get(hx, []):
                        fa = S.fixed_values[fname][1]
                        if (fa is None and alpha is None) or (fa is not None and alpha is not None and abs(fa - alpha) < 0.006):
                            names.append('FIXED.' + fname)
                domain = 'map' if (fx.rel.startswith('src/features/map/') or fx.rel == 'src/features/MapCanvas.tsx') else 'ui'
                ctx_class = 'style_prop' if (key in COLOR_KEYS or (key is not None and MAPLIBRE_COLOR.match(key))) else 'table'
                third_party = (fx.rel.endswith('GoogleButton.tsx') and hx in ('#4285F4', '#34A853', '#FBBC05', '#EA4335'))
                bucket = 'third_party' if third_party else ('on_palette' if on_palette else 'off_palette')
                self.ev(fx, 'color.raw', bucket, t.line, literal=lit, kind=kind, hex=hx,
                        alpha=alpha, names=names, ctx=key, domain=domain, ctx_class=ctx_class)
            if not found and is_color_ctx:
                v = text.strip().lower()
                if v in NAMED_COLORS and (fx.is_tsx or self.in_jsx_style_ctx(fx, i)):
                    self.ev(fx, 'color.named', 'named', t.line, literal=text, ctx=key)
                elif v == 'transparent':
                    self.ev(fx, 'color.transparent', 'transparent', t.line, literal=text, ctx=key)

    def in_import(self, fx, i):
        j = i
        while j > 0 and fx.toks[j].line == fx.toks[i].line:
            if fx.toks[j].t == 'id' and fx.toks[j].v == 'import':
                return True
            j -= 1
        return False

    def in_jsx_style_ctx(self, fx, i):
        return i in fx.attr_at

    def context_key(self, fx, i):
        """The governing property name (style key or JSX attribute) of token i: walk back to the nearest `key:` / `attr={`
        at the same nesting level."""
        toks = fx.toks
        a = fx.attr_at.get(i)
        j = i - 1
        depth = 0
        steps = 0
        while j >= 0 and steps < 60:
            t = toks[j]
            if t.t == 'p':
                if t.v in (')', ']', '}'):
                    depth += 1
                elif t.v in ('(', '[', '{'):
                    if depth == 0:
                        # left the group: for a JSX attribute value the key is the attribute
                        if t.v == '{' and t.flag == 'jsxexpr' and j >= 1 and toks[j - 1].t == 'jsx_attr':
                            return toks[j - 1].v
                        return None
                    depth -= 1
                elif t.v == ':' and depth == 0 and j >= 2 and toks[j - 1].t in ('id', 'str') and toks[j - 2].t == 'p' and toks[j - 2].v in ('{', ','):
                    return toks[j - 1].v
            elif t.t == 'jsx_attr' and depth == 0:
                return t.v
            j -= 1
            steps += 1
        return None

    # ---- style records ----------------------------------------------------------------------------------------------
    def style_record(self, fx, r, tn):
        S = self.S
        key = r.key
        lv = fx.leaves(r.vs, r.ve)
        if key in SPACING_KEYS:
            self.spacing(fx, r, lv, tn)
        elif key in OFFSET_KEYS:
            self.offset(fx, r, lv)
        elif key in RADIUS_KEYS:
            self.radius(fx, r, lv)
        elif key in BORDERW_KEYS:
            self.borderw(fx, r, lv)
        elif key in FONT_KEYS:
            self.font(fx, r, lv)
        elif key == 'opacity':
            for kind, val, idx, neg in lv:
                if kind == 'num':
                    self.ev(fx, 'color.opacity', 'literal', fx.toks[idx].line, val=fnum(val))
        elif key == 'zIndex':
            for kind, val, idx, neg in lv:
                if kind == 'num':
                    self.ev(fx, 'misc.zindex', 'literal', fx.toks[idx].line, val=fnum(val))

    def attr_record(self, fx, r, tn):
        e = r.elem
        name = r.key
        if e is None:
            return
        if name == 'size' and ICON_TAG.match(e.name):
            lv = fx.leaves(r.vs, r.ve)
            if r.ve > r.vs and fx.toks[r.vs - 1].t == 'p':
                self.icon_size(fx, e, r, lv)
        elif name == 'strokeWidth' and ICON_TAG.match(e.name):
            for kind, val, idx, neg in fx.leaves(r.vs, r.ve):
                if kind == 'num':
                    self.ev(fx, 'size.stroke', 'literal_on' if abs(val - self.S.icon['stroke']) < 1e-9 else 'literal_off', fx.toks[idx].line, val=fnum(val), tag=e.name)
                elif kind in ('ref',):
                    self.ev(fx, 'size.stroke', 'token', fx.toks[idx].line, val=val, tag=e.name)
                else:
                    self.ev(fx, 'size.stroke', 'dynamic', fx.toks[idx].line, val=val, tag=e.name)
        elif name in ('color', 'fill', 'stroke', 'placeholderTextColor', 'selectionColor', 'tintColor', 'underlayColor', 'thumbColor') and r.ve > r.vs:
            pass  # colour attributes: the literals and token uses are already counted by colors_and_tokens
        elif name in SPACING_KEYS and r.ve > r.vs:
            self.spacing(fx, r, fx.leaves(r.vs, r.ve), tn)

    # ---- spacing --------------------------------------------------------------------------------------------------------------
    def spacing(self, fx, r, lv, tn):
        S = self.S
        sub = 'padding' if r.key in PAD_KEYS else 'margin' if r.key in MARGIN_KEYS else 'gap'
        if r.vs < len(fx.toks) and fx.toks[r.vs].t == 'p' and fx.toks[r.vs].v == '{':
            return  # an object (map camera padding etc.)
        for kind, val, idx, neg in lv:
            line = fx.toks[idx].line
            if kind == 'num':
                v = -val if neg else val
                if neg:
                    self.ev(fx, 'spacing.negative', 'negative', line, val=fnum(v), key=r.key, sub=sub)
                    continue
                b = self.classify_num(v, S.space_vals)
                self.ev(fx, 'spacing', b, line, val=fnum(v), key=r.key, sub=sub, obj=r.obj)
            elif kind == 'ref':
                root = val.split('.')[0]
                if root in ('layout', 'space'):
                    nm = val.split('.')[1] if '.' in val else ''
                    ok = (root == 'layout' and nm in S.layout) or (root == 'space' and (nm in S.space or nm == '?'))
                    self.ev(fx, 'spacing', 'token' if ok else 'dynamic', line, val=val, key=r.key, sub=sub, obj=r.obj)
                else:
                    self.ev(fx, 'spacing', 'dynamic', line, val=val, key=r.key, sub=sub, obj=r.obj)
            elif kind == 'id':
                name = val
                cv, via = self.P.resolve_const(fx, name)
                if cv is not None:
                    b = self.classify_num(cv, S.space_vals)
                    self.ev(fx, 'spacing', 'const_' + ('on' if b == 'literal_on' else 'zero' if b == 'zero' else 'off'), line, val=fnum(cv), key=r.key, sub=sub,
                            via=f'const {name} ({via})', obj=r.obj)
                    continue
                last = name.split('.')[-1]
                cands = self.P.linked_candidates(fx, last)
                if cands and '.' in name and len(cands) == 1:
                    vals = cands[0][0]
                    mn = min(vals)
                    b = 'named_off' if any(self.classify_num(x, S.space_vals) == 'literal_off' for x in vals) else 'named_on'
                    self.ev(fx, 'spacing', b, line, val=[fnum(x) for x in vals], key=r.key, sub=sub, via=f'name {last} -> {cands[0][1]}:{cands[0][2]}', obj=r.obj)
                    continue
                self.ev(fx, 'spacing', 'dynamic', line, val=name, key=r.key, sub=sub, obj=r.obj)
            elif kind == 'call':
                self.ev(fx, 'spacing', 'dynamic', line, val=val + '()', key=r.key, sub=sub, obj=r.obj)

    def offset(self, fx, r, lv):
        owner = fx.obj_owner(r.obj)
        if owner[0] == 'key' and owner[1] in ('hitSlop', 'padding', 'pressRetentionOffset', 'edgePadding', 'bounds', 'insets', 'contentInset', 'contentOffset'):
            return
        if owner[0] == 'attr' and owner[1] in ('hitSlop',):
            return
        if fx.toks[r.vs].t == 'p' and fx.toks[r.vs].v == '{':
            return
        for kind, val, idx, neg in lv:
            line = fx.toks[idx].line
            if kind == 'num':
                v = -val if neg else val
                self.ev(fx, 'offset', 'literal' if v != 0 else 'zero', line, val=fnum(v), key=r.key, neg=neg)
            elif kind == 'str':
                self.ev(fx, 'offset', 'other', line, val=val, key=r.key)
            elif kind == 'ref':
                self.ev(fx, 'offset', 'token', line, val=val, key=r.key)
            else:
                self.ev(fx, 'offset', 'dynamic', line, val=val, key=r.key)

    # ---- radius ---------------------------------------------------------------------------------------------------------------
    def radius(self, fx, r, lv):
        S = self.S
        props = {x.key: x for x in fx.recs_by_obj.get(r.obj, [])}
        w = self.first_num(fx, props.get('width'))
        h = self.first_num(fx, props.get('height'))
        mw = self.first_num(fx, props.get('minWidth'))
        mh = self.first_num(fx, props.get('minHeight'))
        for kind, val, idx, neg in lv:
            line = fx.toks[idx].line
            if kind == 'num':
                v = val
                if v == 0:
                    self.ev(fx, 'size.radius', 'zero', line, val=0, key=r.key)
                    continue
                dims = [d for d in (w, h, mw, mh) if d]  # a capsule: radius = half the (minimum) height or width
                circle = any(abs(2 * v - d) < 1e-9 for d in dims) or (dims and 2 * v >= min(dims) and v < 100)
                if v in S.radius_vals:
                    self.ev(fx, 'size.radius', 'literal_on', line, val=fnum(v), key=r.key, circle=bool(circle))
                elif v >= 100:
                    self.ev(fx, 'size.radius', 'pill_literal', line, val=fnum(v), key=r.key)
                elif circle:
                    self.ev(fx, 'size.radius', 'circle', line, val=fnum(v), key=r.key, w=w, h=h)
                else:
                    self.ev(fx, 'size.radius', 'literal_off', line, val=fnum(v), key=r.key, w=w, h=h)
            elif kind == 'ref':
                root, _, nm = val.partition('.')
                if root == 'radius' and nm in S.radius:
                    self.ev(fx, 'size.radius', 'token', line, val=val, key=r.key)
                else:
                    self.ev(fx, 'size.radius', 'dynamic', line, val=val, key=r.key)
            elif kind == 'str':
                self.ev(fx, 'size.radius', 'circle' if val.endswith('%') else 'dynamic', line, val=val, key=r.key)
            else:
                # size / 2 style expressions, or a named constant
                seg = ' '.join(t.v for t in fx.toks[r.vs:r.ve] if t.t in ('id', 'p', 'num'))
                cv, via = (self.P.resolve_const(fx, val) if kind == 'id' else (None, None))
                if '/ 2' in seg:
                    self.ev(fx, 'size.radius', 'circle_expr', line, val=val, key=r.key)
                elif cv is not None and cv != 0:
                    dims = [d for d in (w, h) if d]
                    circle = any(abs(2 * cv - d) < 1e-9 for d in dims)
                    b = 'circle' if circle else ('const_on' if cv in S.radius_vals else 'const_off')
                    self.ev(fx, 'size.radius', b, line, val=fnum(cv), key=r.key, via=f'const {val} ({via})')
                else:
                    self.ev(fx, 'size.radius', 'dynamic', line, val=val, key=r.key)

    def first_num(self, fx, rec):
        if rec is None:
            return None
        for kind, val, idx, neg in fx.leaves(rec.vs, rec.ve):
            if kind == 'num':
                return val
            break
        return None

    # ---- border width ----------------------------------------------------------------------------------------------------------
    def borderw(self, fx, r, lv):
        S = self.S
        for kind, val, idx, neg in lv:
            line = fx.toks[idx].line
            if kind == 'num':
                if val == 0:
                    self.ev(fx, 'size.border', 'zero', line, val=0, key=r.key)
                else:
                    self.ev(fx, 'size.border', 'literal_on' if val in S.border_vals else 'literal_off', line, val=fnum(val), key=r.key)
            elif kind == 'ref':
                self.ev(fx, 'size.border', 'token', line, val=val, key=r.key)
            elif kind == 'id' and self.P.resolve_const(fx, val)[0] is not None:
                cv, via = self.P.resolve_const(fx, val)
                if cv != 0:
                    self.ev(fx, 'size.border', 'const_on' if cv in S.border_vals else 'const_off', line, val=fnum(cv), key=r.key, via=f'const {val} ({via})')
            else:
                self.ev(fx, 'size.border', 'dynamic', line, val=val, key=r.key)

    # ---- fonts ------------------------------------------------------------------------------------------------------------------
    def font(self, fx, r, lv):
        S = self.S
        key = r.key
        owner_elem = r.elem.name if (r.elem is not None and r.attr and r.attr[1] == 'style') else None
        for kind, val, idx, neg in lv:
            line = fx.toks[idx].line
            if key == 'fontFamily':
                if kind == 'str':
                    tok = S.font_values.get(val)
                    self.ev(fx, 'font.family', 'literal', line, val=val, equals_token=tok, owner=owner_elem)
                elif kind == 'ref':
                    self.ev(fx, 'font.family', 'token', line, val=val, owner=owner_elem)
                else:
                    self.ev(fx, 'font.family', 'dynamic', line, val=val, owner=owner_elem)
            elif key in ('fontSize', 'lineHeight', 'letterSpacing'):
                scale = {'fontSize': S.font_sizes, 'lineHeight': S.line_heights, 'letterSpacing': S.letter_spacings}[key]
                cat = {'fontSize': 'font.size', 'lineHeight': 'font.lineHeight', 'letterSpacing': 'font.letterSpacing'}[key]
                if kind == 'num':
                    v = -val if neg else val
                    if v == 0 and key == 'letterSpacing':
                        self.ev(fx, cat, 'zero', line, val=0, owner=owner_elem)
                        continue
                    on = any(abs(v - s) < 1e-9 for s in scale)
                    d = self.ev(fx, cat, 'literal_on' if on else 'literal_off', line, val=fnum(v), owner=owner_elem, obj=r.obj)
                    if key == 'fontSize':
                        d['below_smallest'] = v < S.smallest_font
                elif kind == 'ref' and val.startswith('text.'):
                    self.ev(fx, cat, 'token', line, val=val, owner=owner_elem)
                elif kind == 'id' and self.P.resolve_const(fx, val)[0] is not None:
                    cv, via = self.P.resolve_const(fx, val)
                    on = any(abs(cv - s) < 1e-9 for s in scale)
                    d = self.ev(fx, cat, 'const_on' if on else 'const_off', line, val=fnum(cv), owner=owner_elem, via=f'const {val} ({via})')
                    if key == 'fontSize':
                        d['below_smallest'] = cv < S.smallest_font
                else:
                    self.ev(fx, cat, 'dynamic', line, val=val, owner=owner_elem)
            elif key == 'fontWeight':
                if kind == 'str':
                    self.ev(fx, 'font.weight', 'literal', line, val=val, owner=owner_elem)
                else:
                    self.ev(fx, 'font.weight', 'dynamic', line, val=val, owner=owner_elem)
            elif key == 'fontStyle':
                self.ev(fx, 'font.style', 'literal' if kind == 'str' else 'dynamic', line, val=val)
        if key == 'fontSize':
            pass

    # ---- icon size --------------------------------------------------------------------------------------------------------------
    def icon_size(self, fx, e, r, lv):
        S = self.S
        for kind, val, idx, neg in lv:
            line = fx.toks[idx].line
            if kind == 'num':
                self.ev(fx, 'size.icon', 'literal_on' if val in S.icon_sizes else 'literal_off', line, val=fnum(val), tag=e.name)
            elif kind == 'ref':
                self.ev(fx, 'size.icon', 'token', line, val=val, tag=e.name)
            elif kind == 'id' and self.P.resolve_const(fx, val)[0] is not None:
                cv, via = self.P.resolve_const(fx, val)
                self.ev(fx, 'size.icon', 'const_on' if cv in S.icon_sizes else 'const_off', line, val=fnum(cv), tag=e.name, via=f'const {val} ({via})')
            else:
                self.ev(fx, 'size.icon', 'dynamic', line, val=val, tag=e.name)

    # ---- text elements ------------------------------------------------------------------------------------------------------------
    def text_elements(self, fx):
        S = self.S
        text_names = set()
        for local, (orig, mod) in fx.imports.items():
            if mod == 'react-native' and orig == 'Text':
                text_names.add(local)
        text_names |= {'Animated.Text'}
        is_apptext_file = fx.rel == 'src/components/AppText.tsx'
        self_tags = []
        for e in fx.elems:
            if e.name == 'AppText':
                props, _o, _u = self.props_of(fx, e)
                override = bool(set(props) & {'fontSize', 'lineHeight', 'letterSpacing', 'fontFamily'})
                has_variant = 'variant' in e.attrs
                self.ev(fx, 'font.textel', 'AppText_override' if override else 'AppText', e.line, tag='AppText', has_variant=has_variant)
            elif e.name in text_names and not is_apptext_file:
                # a direct React Native <Text>: nested in another text it inherits; standalone it does not use the brand font unless it sets fontFamily
                p = e.parent
                nested = False
                while p is not None:
                    if p.name in ('AppText',) or p.name in text_names:
                        nested = True
                        break
                    p = p.parent
                has_family = 'fontFamily' in self.props_of(fx, e)[0]
                # a <Text> in a file that also draws AppText is an inline span: it is rendered inside an AppText (often through a small
                # component such as Words/Spans) and inherits its font. Only a <Text> in a file with no AppText at all would stand alone.
                span = nested or any(x.name == 'AppText' for x in fx.elems)
                self.ev(fx, 'font.textel', 'Text_nested' if span else ('Text_standalone_family' if has_family else 'Text_standalone'), e.line, tag=e.name)
            elif e.name == 'TextInput':
                props, _o, unresolved = self.props_of(fx, e)
                has_family = 'fontFamily' in props or self.style_mentions(fx, e, 'textStyle') or self.style_mentions_const_with(fx, e, 'fontFamily')
                self.ev(fx, 'font.textel', 'TextInput_family' if has_family else ('TextInput_unresolved_style' if unresolved else 'TextInput_nofamily'), e.line, tag='TextInput')
        # textStyle() calls = token use
        toks = fx.toks
        for i, t in enumerate(toks):
            if t.t == 'id' and t.v == 'textStyle' and i + 1 < len(toks) and toks[i + 1].v == '(' and not self.in_import(fx, i) and fx.rel != 'src/components/AppText.tsx':
                self.ev(fx, 'font.textStyleCall', 'token', t.line)

    # ---- shadows ---------------------------------------------------------------------------------------------------------------
    def shadows(self, fx):
        toks = fx.toks
        for i, t in enumerate(toks):
            if t.t == 'id' and t.v == 'shadowStyle' and i + 1 < len(toks) and toks[i + 1].v == '(' and not self.in_import(fx, i):
                self.ev(fx, 'size.shadow', 'token', t.line)
        for o, recs in fx.recs_by_obj.items():
            keys = {r.key for r in recs}
            if keys & {'shadowColor', 'shadowOpacity', 'shadowRadius', 'shadowOffset', 'boxShadow'}:
                color = None
                for r in recs:
                    if r.key == 'shadowColor':
                        lv = fx.leaves(r.vs, r.ve)
                        color = lv[0][1] if lv else None
                self.ev(fx, 'size.shadow', 'hand', min(r.line for r in recs if r.key in SHADOW_KEYS), color=str(color), keys=sorted(keys & SHADOW_KEYS))
            elif 'elevation' in keys:
                vals = [x for r in recs if r.key == 'elevation' for x in fx.leaves(r.vs, r.ve)]
                if not (vals and all(kd == 'num' and v == 0 for kd, v, i, ng in vals)):   # `elevation: 0` switches the Android shadow off
                    self.ev(fx, 'size.shadow', 'elevation_only', min(r.line for r in recs if r.key == 'elevation'), keys=['elevation'])
            if keys & {'textShadowColor', 'textShadowRadius', 'textShadowOffset'}:
                self.ev(fx, 'size.textshadow', 'hand', min(r.line for r in recs if r.key in SHADOW_KEYS), keys=sorted(keys & SHADOW_KEYS))

    def style_mentions(self, fx, e, fname):
        """does the style attribute of e call function `fname` (textStyle('h4') ...)?"""
        a = e.attrs.get('style')
        if not a or a[2] <= a[1]:
            return False
        toks = fx.toks
        for j in range(a[1], a[2] - 1):
            if toks[j].t == 'id' and toks[j].v == fname and toks[j + 1].t == 'p' and toks[j + 1].v == '(':
                return True
        return False

    def style_mentions_const_with(self, fx, e, key):
        """does the style attribute reference a same-file `const NAME = {...}` style object that has `key`? (style={[input, {...}]})"""
        a = e.attrs.get('style')
        if not a or a[2] <= a[1]:
            return False
        toks = fx.toks
        for j in range(a[1], a[2]):
            if toks[j].t == 'id' and not (j > 0 and toks[j - 1].t == 'p' and toks[j - 1].v in ('.', '?.')):
                o = fx._find_const_object(toks[j].v)
                if o is not None and any(r.key == key for r in fx.recs_by_obj.get(o, [])):
                    return True
        return False

    # ---- properties of an element's style (merged) ------------------------------------------------------------------------------
    def props_of(self, fx, e, attr='style'):
        objs, unresolved = fx.style_objects(e, attr)
        props = {}
        for o in objs:
            for r in fx.recs_by_obj.get(o, []):
                props[r.key] = r
        return props, objs, unresolved

    def num_values(self, fx, r):
        """Numbers a record's value can take, from the expression evaluator: (sorted list, unknown flag)."""
        comp = fx.enclosing_component(r.line)
        v = fx.eval_expr(r.vs, r.ve, self.P, comp)
        if v is None:
            return [], True
        return sorted(v), False

    # ---- touch targets ------------------------------------------------------------------------------------------------------------
    def touch_targets(self, fx):
        S = self.S
        for e in fx.elems:
            if not INTERACTIVE.match(e.name):
                continue
            props, objs, unresolved = self.props_of(fx, e)
            dims = {}
            unknown = False
            for k in ('width', 'height', 'minWidth', 'minHeight'):
                if k in props:
                    vals, unk = self.num_values(fx, props[k])
                    if k.startswith('min'):
                        vals = [v for v in vals if v > 0]  # minWidth: 0 only lets a flex child shrink; it is not a size
                    if vals:
                        dims[k] = min(vals)
                    unknown = unknown or unk
            # IconButton/IconTap `size` prop
            sz = None
            if 'size' in e.attrs and e.attrs['size'][2] > e.attrs['size'][1]:
                sv = fx.eval_expr(e.attrs['size'][1], e.attrs['size'][2], self.P, fx.enclosing_component(e.line))
                if sv:
                    sz = min(sv)
            eff_w = dims.get('width', dims.get('minWidth'))
            eff_h = dims.get('height', dims.get('minHeight'))
            if sz is not None:
                eff_w = eff_w if eff_w is not None else sz
                eff_h = eff_h if eff_h is not None else sz
            known = [d for d in (eff_w, eff_h) if d is not None]
            hit = 'hitSlop' in e.attrs
            slop = 0
            if hit:
                a = e.attrs['hitSlop']
                if a[2] > a[1]:
                    toks = fx.toks
                    if toks[a[1]].t == 'p' and toks[a[1]].v == '{':
                        # hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}: the smaller of the two axes
                        sides = {r.key: (self.num_values(fx, r)[0] or [0])[0] for r in fx.recs_by_obj.get(a[1], [])}
                        slop = min(sides.get('top', 0) + sides.get('bottom', 0), sides.get('left', 0) + sides.get('right', 0)) / 2
                    else:
                        sv = fx.eval_expr(a[1], a[2], self.P, fx.enclosing_component(e.line))
                        slop = min(sv) if sv else 0
            if not known:
                self.ev(fx, 'touch', 'unknown', e.line, tag=e.name, hitSlop=hit)
                continue
            smallest = min(known)
            drawn_b = 'lt48' if smallest < S.touch_hard else 'lt56' if smallest < S.touch_primary else 'ok'
            eff_small = smallest + 2 * slop
            b = 'lt48' if eff_small < S.touch_hard else 'lt56' if eff_small < S.touch_primary else 'ok'
            if drawn_b == 'lt48' and b != 'lt48':
                b = 'lt48_rescued_by_hitSlop'
            self.ev(fx, 'touch', b, e.line, tag=e.name, w=eff_w, h=eff_h, smallest=fnum(smallest), hitSlop=hit, slop=fnum(slop), effective=fnum(eff_small),
                    text=fx.line_text(e.line, 140))
        # default sizes of shared components used with no explicit size are fine (IconButton 48, Chip 48, Pill 56)

    # ---- INSET heuristic ------------------------------------------------------------------------------------------------------------
    def pad_side(self, fx, props, side):
        """Explicit padding on one side ('Left','Right','Top','Bottom'): (value | None when unresolvable, unknown flag).
        The most specific key wins: paddingLeft > paddingStart > paddingHorizontal > padding. Absent = 0."""
        keys = [f'padding{side}', ('paddingHorizontal' if side in ('Left', 'Right') else 'paddingVertical'), 'padding']
        if side == 'Left':
            keys.insert(1, 'paddingStart')
        if side == 'Right':
            keys.insert(1, 'paddingEnd')
        for k in keys:
            if k in props:
                vals, unk = self.num_values(fx, props[k])
                if vals:
                    return min(vals), unk
                return None, True
        return 0, False

    def strs_of(self, fx, props, key):
        if key not in props:
            return set()
        return {v for k, v, i, n in fx.leaves(props[key].vs, props[key].ve) if k == 'str'}

    def box_dims(self, fx, props):
        """explicit height/width (smallest possible) from width/height/minHeight/minWidth, or None"""
        out = {}
        for axis, keys in (('h', ('height', 'minHeight')), ('w', ('width', 'minWidth'))):
            for k in keys:
                if k in props:
                    vals, unk = self.num_values(fx, props[k])
                    vals = [v for v in vals if v > 0]
                    if vals:
                        out[axis] = min(vals)
                        break
        return out

    TEXT_LINE = 22  # fallback text line (label 22, caption 21, small 25, body 28) when the child's own line height is not readable

    def text_line_height(self, fx, e):
        """Smallest line height among the direct AppText/Text children: the variant's lineHeight, or a literal lineHeight in its style."""
        S = self.S
        best = None
        for k in e.kids:
            if k.name not in ('AppText', 'Text', 'Animated.Text'):
                continue
            lh = None
            for r in fx.recs:
                if not r.is_attr and r.elem is k and r.attr and r.attr[1] == 'style' and r.key == 'lineHeight':
                    vals, unk = self.num_values(fx, r)
                    if vals:
                        lh = min(vals)
            if lh is None and k.name == 'AppText':
                a = k.attrs.get('variant')
                variant = 'body'
                if a and a[2] > a[1]:
                    names = [v for kind, v, i, n in fx.leaves(a[1], a[2]) if kind == 'str' and v in S.text]
                    if names:
                        variant = names[0]
                elif a and a[2] == a[1] and fx.toks[a[1]].t == 'str':
                    variant = fx.toks[a[1]].v if fx.toks[a[1]].v in S.text else 'body'
                lh = S.text[variant]['lineHeight']
            if lh is not None and (best is None or lh < best):
                best = lh
        return best if best is not None else self.TEXT_LINE

    def inset(self, fx):
        S = self.S
        for e in fx.elems:
            if e.name in ('Text', 'AppText', 'TextInput', 'ScrollView', 'FlatList', 'SafeAreaView', 'Modal', 'Svg', 'Image', 'ImageBackground', 'Screen'):
                continue
            if e.selfclose and e.name not in ('View', 'Pressable'):
                continue
            if e.name not in ('View', 'Pressable', 'TouchableOpacity', 'Animated.View') and not INTERACTIVE.match(e.name):
                continue
            props, objs, unresolved = self.props_of(fx, e)
            if not props:
                continue
            bw = 0
            if 'borderWidth' in props:
                vals, _ = self.num_values(fx, props['borderWidth'])
                bw = max(vals) if vals else 1
            has_border = bw > 0 or 'borderColor' in props
            has_fill = False
            if 'backgroundColor' in props:
                lv = fx.leaves(props['backgroundColor'].vs, props['backgroundColor'].ve)
                has_fill = any(not (kind == 'str' and val.strip().lower() == 'transparent') for kind, val, idx, neg in lv)
            has_radius = any(k in props for k in RADIUS_KEYS)
            if not (has_border or has_fill):
                continue
            if 'flex' in props and not has_border and not has_radius:
                continue  # a page / full-bleed fill, not a container with an outline
            text_direct, text_nested = self.text_children(fx, e)
            if not (text_direct or text_nested):
                continue
            pads = {}
            for side in ('Left', 'Right', 'Top', 'Bottom'):
                pads[side], _ = self.pad_side(fx, props, side)
            row = 'row' in self.strs_of(fx, props, 'flexDirection')
            ai, jc = self.strs_of(fx, props, 'alignItems'), self.strs_of(fx, props, 'justifyContent')
            v_center = (ai == {'center'}) if row else (jc == {'center'})
            h_center = (jc == {'center'}) if row else (ai == {'center'})
            dims = self.box_dims(fx, props)
            line_h = self.text_line_height(fx, e)
            eff = dict(pads)
            how = {}
            if v_center and 'h' in dims:
                room = (dims['h'] - line_h) / 2
                for s_ in ('Top', 'Bottom'):
                    if eff[s_] is not None and room > eff[s_]:
                        eff[s_] = room
                        how[s_] = f'centred in height {fnum(dims["h"])} (line {fnum(line_h)})'
            elif v_center:
                for s_ in ('Top', 'Bottom'):
                    if eff[s_] is not None and S.space['2'] > eff[s_]:
                        eff[s_] = S.space['2']  # centring is only declared on a box taller than its content (height set by the parent, a flex rule or a computed size): treated as ok
                        how[s_] = 'centred (height not readable here)'
            if h_center and not ('alignSelf' in props and self.strs_of(fx, props, 'alignSelf') & {'flex-start', 'flex-end'}):
                for s_ in ('Left', 'Right'):
                    if eff[s_] is not None and S.space['2'] > eff[s_]:
                        eff[s_] = S.space['2']  # text centred horizontally in a box that is not shrink-wrapped: the room is (width - text) / 2, treated as ok
                        how[s_] = 'centred horizontally' + (f' in width {fnum(dims["w"])}' if 'w' in dims else '')
            known = [v for v in eff.values() if v is not None]
            fill_kind = 'outlined' if has_border else ('filled_rounded' if has_radius else 'filled')
            min_side = min(known) if known else None
            tight = [s_ for s_, v in eff.items() if v is not None and v < S.space['2']]
            if any(s_ not in how and (pads[s_] or 0) > 0 for s_ in tight):
                cause = 'small_padding'          # the author wrote a padding under 8
            elif any(s_ in how for s_ in tight):
                cause = 'fixed_height_pill'      # no padding: the room is what a centred line leaves in a short box
            else:
                cause = 'no_padding'             # no padding on a side at all
            badge_like = ('h' in dims and 'w' in dims and dims['h'] == dims['w'] and dims['h'] <= 32) or ('h' in dims and dims['h'] <= 24)
            base = dict(tag=e.name, padding={k: (fnum(v) if v is not None else None) for k, v in pads.items()}, insets={k: (fnum(v) if v is not None else None) for k, v in eff.items()},
                        min_inset=fnum(min_side) if min_side is not None else None, fill=fill_kind, border=fnum(bw) if bw else 0, text_direct=text_direct,
                        centering=how, size=({k: fnum(v) for k, v in dims.items()}), cause=cause, badge_like=bool(badge_like), text=fx.line_text(e.line, 150),
                        component=fx.enclosing_component(e.line))
            if min_side is None:
                self.ev(fx, 'inset', 'unresolved', e.line, **base)
            elif min_side >= S.space['2']:
                self.ev(fx, 'inset', 'ok', e.line, **base)
            elif fill_kind == 'filled':
                self.ev(fx, 'inset', 'L3_filled_no_outline', e.line, **base)
            elif text_direct:
                self.ev(fx, 'inset', 'L1_direct_text', e.line, **base)
            else:
                self.ev(fx, 'inset', 'L2_nested_text', e.line, **base)

    def text_children(self, fx, e):
        if e.end_open is None or e.close is None or e.selfclose:
            return False, False
        direct = False
        nested = False
        kids = e.kids
        for k in kids:
            if k.name in ('AppText', 'Text') or k.name in ('Animated.Text',):
                direct = True
            # a plain wrapper (View without padding) around text still counts as direct-ish; keep it simple: nested
        for x in fx.desc_elems(e):
            if x.name in ('AppText', 'Text', 'Animated.Text') and x not in kids:
                nested = True
        # text given through a component prop (label) is invisible to us
        return direct, nested

    # ---- DUPLICATED COMPONENTS ----------------------------------------------------------------------------------------------------------
    def duplicates(self, fx):
        S = self.S
        if fx.rel in ('src/components/Pill.tsx', 'src/components/ui.tsx', 'src/components/Fab.tsx', 'src/components/SampleNotice.tsx',
                      'src/components/PromoBanner.tsx', 'src/components/TabBar.tsx'):
            # the shared components themselves
            shared_file = True
        else:
            shared_file = False
        for e in fx.elems:
            if e.name not in ('View', 'Pressable', 'TouchableOpacity', 'Animated.View'):
                continue
            props, objs, unresolved = self.props_of(fx, e)
            if not props:
                continue
            comp = fx.enclosing_component(e.line)
            descs = fx.desc_elems(e)
            has_text = any(x.name in ('AppText', 'Text') for x in descs)
            has_icon = any(x.name in ('Icon', 'MapIcon') for x in descs)

            def refs(key):
                if key not in props:
                    return []
                return fx.leaves(props[key].vs, props[key].ve)

            def has_ref(key, *names):
                for kind, val, idx, neg in refs(key):
                    if kind == 'ref' and val in names:
                        return True
                return False

            def nums(key):
                return self.num_values(fx, props[key])[0] if key in props else []

            pill_radius = has_ref('borderRadius', 'radius.pill') or any(v >= 100 for v in nums('borderRadius'))
            bg = 'backgroundColor' in props
            border = 'borderWidth' in props and any(v > 0 for v in nums('borderWidth'))
            w, h = nums('width'), nums('height')
            tag = e.name
            info = dict(tag=tag, component=comp, text=fx.line_text(e.line, 150))
            kinds = []
            # custom pill / chip / button: tappable, pill radius, filled or outlined, with text
            if tag in ('Pressable', 'TouchableOpacity') and pill_radius and (bg or border) and has_text and not has_icon_only(has_text, has_icon):
                kinds.append('pill')
            # hand-made card: a surface colour + a large radius + padding
            surf = has_ref('backgroundColor', 'role.surface') or has_ref('backgroundColor', 'c.white') or has_ref('backgroundColor', 'fixed.white')
            big_radius = has_ref('borderRadius', 'radius.lg', 'radius.md', 'radius.xl') or any(v in (20, 28, 36) for v in nums('borderRadius'))
            pad_vals = [self.pad_side(fx, props, s_)[0] for s_ in ('Left', 'Right', 'Top', 'Bottom')]
            padded = all(v is not None and v >= 12 for v in pad_vals)  # a card is padded on all four sides (Card: 20); a chip is padded 8 x 16
            if surf and big_radius and padded and (has_text or has_icon):
                kinds.append('card')
            # hand-made icon button: tappable, equal width and height (or a circle), an icon and no text
            if tag in ('Pressable', 'TouchableOpacity') and has_icon and not has_text and (pill_radius or (w and h and w == h)):
                kinds.append('icon_button')
            # hand-made notice: a wash background + (border or radius) + an icon and text
            wash = any(has_ref('backgroundColor', f'c.{nm}') for nm in ('goldWash', 'red100', 'successWash', 'blue50', 'blue100', 'goldSoft')) or has_ref('backgroundColor', 'role.sunken')
            is_row = 'row' in {v for k, v, i, n in refs('flexDirection') if k == 'str'}
            if tag in ('View', 'Animated.View') and wash and (border or 'borderRadius' in props) and has_icon and has_text and is_row:
                kinds.append('notice')
            # hand-made sub-tab strip item: tappable, a bottom border that changes with the selection
            if tag in ('Pressable', 'TouchableOpacity') and 'borderBottomWidth' in props and has_text:
                kinds.append('subtab')
            # hand-made floating action button
            pos = [v for k, v, i, n in refs('position') if k == 'str']
            gold_bg = has_ref('backgroundColor', 'c.gold', 'role.highlight', 'fixed.gold')
            if tag in ('Pressable', 'TouchableOpacity') and pos == ['absolute'] and w and h and min(w + h) >= 56 and pill_radius and has_icon and gold_bg:
                kinds.append('fab')
            # segmented control segment: tappable, flex 1, pill radius, background that switches
            if tag in ('Pressable', 'TouchableOpacity') and 'flex' in props and pill_radius and has_text and bg:
                kinds.append('segment')
            for kd in kinds:
                self.ev(fx, 'dup.' + kd, 'shared_file' if shared_file else 'handmade', e.line, **info)



def has_icon_only(has_text, has_icon):
    return False


# ==============================================================================================================
# What the events mean: violations, things counted apart, hand-made components
# ==============================================================================================================
CATEGORIES = ('color', 'font', 'spacing', 'size', 'inset', 'ignore')   # the gating categories, in report order
CATEGORY_HELP = {
    'color': 'colours from roles and the palette, never a raw literal',
    'font': 'type from AppText variants; a literal size, line height or tracking must be on the text scale, and never under 15',
    'spacing': 'padding, margin and gap from the space scale',
    'size': 'radius, icon size, tap target and shadow from the tokens',
    'inset': 'text keeps 8 px or more from the outline of a bordered or filled box',
    'ignore': 'a design-lint-ignore comment has a known category and a reason, and excuses something',
}
KINDS = {
    'color/raw': 'a raw colour literal (hex, rgb, rgba, a CSS colour name) outside the theme',
    'font/size': 'a fontSize that is not a text size',
    'font/small': 'a fontSize under the smallest text size',
    'font/line-height': 'a lineHeight that is not a text line height',
    'font/letter-spacing': 'a letterSpacing that is not a text tracking',
    'font/family': 'a fontFamily literal that is not a brand font',
    'font/system-font': 'a <Text> or <TextInput> that draws the system font',
    'spacing/padding': 'a padding value that is not on the space scale',
    'spacing/margin': 'a margin value that is not on the space scale',
    'spacing/gap': 'a gap value that is not on the space scale',
    'size/radius': 'a borderRadius that is not a radius token or a circle',
    'size/icon': 'an icon size that is not an icon size',
    'size/touch': 'an interactive element drawn under the hard minimum, a hitSlop counted',
    'size/shadow': 'a hand-made shadow',
    'inset/text-near-edge': 'a bordered or filled container whose text is under 8 px from the outline',
    'ignore/no-reason': 'a design-lint-ignore comment without a reason',
    'ignore/unknown-category': 'a design-lint-ignore comment that names no category of the lint',
    'ignore/unused': 'a design-lint-ignore comment that excuses nothing',
}
APART = {   # counted and reported, never gating
    'color/role-first': 'c.* where an identical role.* exists (it works and flips with dark mode, but role.* says what the colour means)',
    'spacing/offset': 'absolute-position offsets (top, left, right, bottom, start, end) off the space scale: optical alignment, not spacing',
    'spacing/negative': 'negative margins: optical alignment',
    'size/touch-below-primary': 'tap targets drawn 48 to 55: above the hard minimum, under the 56 target for primary actions (the scanner cannot tell which are primary)',
}
DUP_KINDS = {   # heuristic, report only
    'pill': 'a hand-made pill button (the shared one is Pill)',
    'icon_button': 'a hand-made icon button (IconButton)',
    'card': 'a hand-made card (Card)',
    'notice': 'a hand-made notice (SampleNotice, Notice)',
    'subtab': 'a hand-made sub-tab strip item (SubTabs)',
    'fab': 'a hand-made floating action button (Fab)',
    'segment': 'a hand-made segment of a segmented choice',
}
IGNORABLE = set(CATEGORIES) - {'ignore'} | {'duplicates'}
DIRECTIVE = re.compile(r'design-lint-ignore\s*:(.*)', re.S)


def sn(v):
    """A number as the code would write it: 16, not 16.0."""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v)


def fingerprint(cat, kind, value, text):
    """What identifies a violation across edits that only move it: its rule, its value and its source line, never its line number."""
    raw = '%s|%s|%s|%s' % (cat, kind, value, ' '.join(text.split()))
    return hashlib.sha1(raw.encode('utf-8')).hexdigest()[:10]


def nearest(table, value, fmt):
    """The two entries of a scale (name -> value) around `value`, written as the code would use them."""
    vals = sorted(set(table.values()))
    below = [x for x in vals if x < value]
    above = [x for x in vals if x > value]
    pick = [x for x in (below[-1] if below else None, above[0] if above else None) if x is not None]
    return ' or '.join(fmt(x) for x in pick) if pick else 'a token'


def colour_message(S, e):
    lit, hx, alpha = e['literal'], e.get('hex'), e.get('alpha')
    roles = S.hex_to_roles.get(hx, []) if (hx and alpha is None) else []
    fixed = [n.split(' ')[0] for n in e.get('names', []) if n.startswith('FIXED.')]
    palette = [n.split(' ')[0] for n in e.get('names', []) if not n.startswith('FIXED.')]
    with_alpha = ' with an alpha' if alpha is not None else ''
    if roles:
        return f'{lit} is the colour of role.{roles[0]}: use the role, so the colour follows the mode'
    if fixed:
        return f'{lit} is {fixed[0]}: use it (a colour that does not change with the mode)'
    if palette:
        return f'{lit} is the palette colour {palette[0]}{with_alpha}: use c.{palette[0]} (or a role, if one says what the colour means)'
    return f'{lit} is not in the palette: use a role (role.*), a palette colour (c.*) or FIXED.*'


class Collected:
    """The outcome of reading the events: violations, items counted apart, hand-made components, and how many values were checked."""

    def __init__(self):
        self.violations = []
        self.apart = collections.defaultdict(list)
        self.dups = collections.defaultdict(list)
        self.checked = collections.Counter()


def classify(project, events):
    S = project.std
    out = Collected()

    def line_text(e):
        fx = project.by_rel.get(e['file'])
        return fx.src_lines[e['line'] - 1].strip() if fx and 1 <= e['line'] <= len(fx.src_lines) else ''

    def add(cat, kind, e, value, msg):
        text = line_text(e)
        v = value if isinstance(value, (int, float, str)) else str(value)
        out.violations.append({'cat': cat, 'kind': kind, 'file': e['file'], 'line': e['line'], 'value': v, 'msg': msg, 'text': text[:170],
                               'fp': fingerprint(cat, kind, sn(v) if isinstance(v, float) else v, text)})

    def apart(key, e, value, msg):
        out.apart[key].append({'file': e['file'], 'line': e['line'], 'value': value, 'msg': msg, 'text': line_text(e)[:170]})

    for e in events:
        cat, b = e['cat'], e['bucket']
        # ---- colour
        if cat == 'color.raw':
            if b == 'third_party':
                continue
            out.checked['color'] += 1
            add('color', 'raw', e, e['literal'], colour_message(S, e))
        elif cat == 'color.named':
            out.checked['color'] += 1
            add('color', 'raw', e, e['literal'], f"the colour name '{e['literal']}' is not in the palette: use a role (role.*), a palette colour (c.*) or FIXED.*")
        elif cat in ('color.role', 'color.fixed'):
            out.checked['color'] += 1
        elif cat == 'color.c':
            out.checked['color'] += 1
            if b == 'role_exists':
                roles = ' or '.join('role.' + r for r in e.get('roles', []))
                apart('color/role-first', e, 'c.' + e['name'], f"c.{e['name']} is the colour of {roles}: use the role, which says what the colour means")
        # ---- fonts
        elif cat == 'font.size':
            if b in ('literal_on', 'const_on'):
                out.checked['font'] += 1
            elif b in ('literal_off', 'const_off'):
                out.checked['font'] += 1
                if e.get('below_smallest'):
                    add('font', 'small', e, e['val'], f"fontSize {sn(e['val'])} is under {sn(S.smallest_font)}, the smallest text size (caption and mono): use an AppText variant")
                else:
                    add('font', 'size', e, e['val'], f"fontSize {sn(e['val'])} is not a text size ({', '.join(sn(x) for x in S.font_sizes)}): use an AppText variant or textStyle()")
        elif cat == 'font.lineHeight':
            if b in ('literal_on', 'const_on'):
                out.checked['font'] += 1
            elif b in ('literal_off', 'const_off'):
                out.checked['font'] += 1
                add('font', 'line-height', e, e['val'], f"lineHeight {sn(e['val'])} is not a text line height ({', '.join(sn(x) for x in S.line_heights)}): use an AppText variant or textStyle()")
        elif cat == 'font.letterSpacing':
            if b in ('literal_on', 'const_on'):
                out.checked['font'] += 1
            elif b in ('literal_off', 'const_off'):
                out.checked['font'] += 1
                add('font', 'letter-spacing', e, e['val'], f"letterSpacing {sn(e['val'])} is not a text tracking ({', '.join(sn(x) for x in S.letter_spacings)}): use an AppText variant or textStyle()")
        elif cat == 'font.family':
            if b == 'token':
                out.checked['font'] += 1
            elif b == 'literal':
                out.checked['font'] += 1
                if not e.get('equals_token'):
                    add('font', 'family', e, e['val'], f"fontFamily '{e['val']}' is not a brand font: use fonts.* or an AppText variant")
        elif cat == 'font.textel':
            if b in ('AppText', 'TextInput_family'):
                out.checked['font'] += 1
            elif b in ('Text_standalone', 'TextInput_nofamily'):
                out.checked['font'] += 1
                add('font', 'system-font', e, e['tag'], f"<{e['tag']}> draws the system font here: use AppText, or give the TextInput a fontFamily from fonts.*")
        # ---- spacing
        elif cat == 'spacing':
            if b in ('token', 'literal_on', 'const_on', 'named_on'):
                out.checked['spacing'] += 1
            elif b in ('literal_off', 'const_off', 'named_off'):
                out.checked['spacing'] += 1
                vals = e['val'] if isinstance(e['val'], list) else [e['val']]
                off = [v for v in vals if float(v) not in S.space_vals]
                first = off[0] if off else vals[0]
                hint = nearest(S.space, float(first), lambda x: f'space[{S.space_key[x]}] ({sn(x)})')
                via = f" (read through {e['via']})" if e.get('via') else ''
                add('spacing', e['sub'], e, '/'.join(sn(v) for v in vals), f"{e['key']}: {'/'.join(sn(v) for v in vals)} is not on the space scale{via}: use {hint}")
        elif cat == 'spacing.negative':
            apart('spacing/negative', e, e['val'], f"{e['key']}: {sn(e['val'])}: a negative margin")
        elif cat == 'offset':
            if b == 'literal' and abs(float(e['val'])) not in S.space_vals:
                apart('spacing/offset', e, e['val'], f"{e['key']}: {sn(e['val'])} is not on the space scale (an offset, counted apart)")
        # ---- sizes
        elif cat == 'size.radius':
            if b in ('token', 'circle', 'circle_expr', 'literal_on', 'pill_literal', 'const_on'):
                out.checked['size'] += 1
            elif b in ('literal_off', 'const_off'):
                out.checked['size'] += 1
                names = {k: v for k, v in S.radius.items() if v < 100}
                hint = nearest(names, float(e['val']), lambda x: 'radius.%s (%s)' % ([k for k, v in names.items() if v == x][0], sn(x)))
                add('size', 'radius', e, e['val'], f"{e['key']}: {sn(e['val'])} is not a radius token and not a circle: use {hint}")
        elif cat == 'size.icon':
            if b in ('default_24', 'token', 'literal_on', 'const_on'):
                out.checked['size'] += 1
            elif b in ('literal_off', 'const_off', 'default_off'):
                out.checked['size'] += 1
                sizes = ', '.join(sn(x) for x in S.icon_sizes)
                if b == 'default_off':
                    add('size', 'icon', e, 'default', f"<{e['tag']}> without a size draws 22, which is not an icon size ({sizes}): pass size={{icon.md}}")
                else:
                    hint = nearest({k: v for k, v in S.icon.items() if k != 'stroke'}, float(e['val']), lambda x: f'icon.{S.icon_name[x]} ({sn(x)})')
                    add('size', 'icon', e, e['val'], f"icon size {sn(e['val'])} is not an icon size ({sizes}): use {hint}")
        elif cat == 'touch':
            if b == 'ok':
                out.checked['size'] += 1
            elif b == 'lt56':
                out.checked['size'] += 1
                apart('size/touch-below-primary', e, e['effective'], f"<{e['tag']}> is {sn(e['effective'])} px: above the hard minimum {sn(S.touch_hard)}, under the primary target {sn(S.touch_primary)}")
            elif b == 'lt48_rescued_by_hitSlop':
                out.checked['size'] += 1
                if float(e['effective']) < S.touch_primary:
                    apart('size/touch-below-primary', e, e['effective'], f"<{e['tag']}> is drawn {sn(e['smallest'])} px and reaches {sn(e['effective'])} px with its hitSlop")
            elif b == 'lt48':
                out.checked['size'] += 1
                slop = f" ({sn(e['effective'])} px with its hitSlop)" if e.get('hitSlop') else ''
                add('size', 'touch', e, e['effective'], f"<{e['tag']}> is {sn(e['smallest'])} px{slop}: a tap target is at least {sn(S.touch_hard)} (layout.touchHard), {sn(S.touch_primary)} for a primary action (layout.touchPrimary)")
        elif cat == 'size.shadow':
            if b == 'token':
                out.checked['size'] += 1
            elif b in ('hand', 'elevation_only'):
                out.checked['size'] += 1
                what = 'a hand-made shadow' if b == 'hand' else 'an elevation without a shadow'
                add('size', 'shadow', e, b, f"{what} ({', '.join(e.get('keys', []))}): use shadowStyle('sm' | 'md' | 'lg' | 'xl' | 'gold')")
        # ---- inset
        elif cat == 'inset':
            if b == 'ok':
                out.checked['inset'] += 1
            elif b == 'L1_direct_text':
                out.checked['inset'] += 1
                ins = e.get('insets', {})
                where = ', '.join(f'{k.lower()} {sn(v)}' for k, v in ins.items() if v is not None and v < S.inset_min)
                add('inset', 'text-near-edge', e, e.get('min_inset'),
                    f"text is {sn(e.get('min_inset'))} px from the outline of this {str(e.get('fill')).replace('_', ' ')} {e['tag']} ({where}): keep at least {sn(S.inset_min)} px; cards use layout.cardPadding ({sn(S.card_padding)})")
        # ---- hand-made components (heuristic, report only)
        elif cat.startswith('dup.') and b == 'handmade':
            out.dups[cat[4:]].append({'file': e['file'], 'line': e['line'], 'tag': e.get('tag'), 'component': e.get('component'), 'text': e.get('text', '')[:170]})
    return out


# --------------------------------------------------------------------------------------------------------------
# Ignore comments
# --------------------------------------------------------------------------------------------------------------
def read_ignores(fx):
    """Every `design-lint-ignore` comment of a file. A comment on a line with code excuses that line; a comment alone on its line(s)
    excuses the next line that has code."""
    # the braces of a JSX comment `{/* ... */}` are tokens too, but a line that has nothing else is a comment line
    code_lines = sorted({t.line for t in fx.toks if not (t.t == 'p' and t.v in ('{', '}') and t.flag in ('jsxexpr', 'jsxclose'))})
    found = []
    for first, last, text in fx.comments:
        m = DIRECTIVE.search(text)
        if not m:
            continue
        rest = re.sub(r'\*/\s*$', '', m.group(1).strip()).strip()
        parts = rest.split(None, 1)
        cats_raw = parts[0] if parts else ''
        reason = ' '.join((parts[1] if len(parts) > 1 else '').split()).strip(' -–—:.,*/')
        cats = [c for c in cats_raw.split(',') if c]
        i = bisect.bisect_left(code_lines, first)
        if i < len(code_lines) and code_lines[i] == first:
            target = first
        else:
            j = bisect.bisect_right(code_lines, last)
            target = code_lines[j] if j < len(code_lines) else None
        problem = None
        if not cats or any(c not in IGNORABLE for c in cats):
            problem = 'unknown-category'
        elif len(re.sub(r'[^A-Za-z0-9]', '', reason)) < 3:
            problem = 'no-reason'
        found.append({'file': fx.rel, 'line': first, 'target': target, 'cats': cats, 'cats_raw': cats_raw, 'reason': reason, 'problem': problem, 'hits': 0})
    return found


def apply_ignores(project, out):
    """Remove the violations the ignore comments excuse; return the comments (with how many lines each excused) and the violations of the comments themselves."""
    ignores, own = [], []
    drop = set()
    for fx in project.fi.values():
        for ig in read_ignores(fx):
            ignores.append(ig)
            if ig['problem']:
                continue
            for idx, v in enumerate(out.violations):
                if v['file'] == fx.rel and v['line'] == ig['target'] and v['cat'] in ig['cats'] and v['cat'] != 'ignore':
                    drop.add(idx)
                    ig['hits'] += 1
            if 'duplicates' in ig['cats']:
                for kind in out.dups:
                    keep = [d for d in out.dups[kind] if not (d['file'] == fx.rel and d['line'] == ig['target'])]
                    ig['hits'] += len(out.dups[kind]) - len(keep)
                    out.dups[kind] = keep
    out.violations = [v for i, v in enumerate(out.violations) if i not in drop]
    for ig in ignores:
        fx = project.by_rel[ig['file']]
        text = fx.src_lines[ig['line'] - 1].strip()
        if ig['problem'] == 'unknown-category':
            msg = f"design-lint-ignore needs a category ({', '.join(sorted(IGNORABLE))}) and a reason: design-lint-ignore: <category> <reason>"
        elif ig['problem'] == 'no-reason':
            msg = 'design-lint-ignore needs a reason: design-lint-ignore: <category> <reason> (why this line leaves the rule)'
        elif ig['hits'] == 0:
            ig['problem'] = 'unused'
            msg = f"this design-lint-ignore excuses nothing ({ig['cats_raw']} on line {ig['target']}): remove it, or put it on the line (or the line above) that breaks the rule"
        else:
            continue
        own.append({'cat': 'ignore', 'kind': ig['problem'], 'file': ig['file'], 'line': ig['line'], 'value': ig['cats_raw'], 'msg': msg, 'text': text[:170],
                    'fp': fingerprint('ignore', ig['problem'], ig['cats_raw'], text)})
    out.violations.extend(own)
    return ignores


# --------------------------------------------------------------------------------------------------------------
# One scan
# --------------------------------------------------------------------------------------------------------------
class Result:
    def __init__(self, project, events, out, ignores, seconds):
        self.project = project
        self.std = project.std
        self.events = events
        self.violations = sorted(out.violations, key=lambda v: (v['file'], v['line'], v['cat'], v['kind'], v['fp']))
        self.apart = {k: sorted(out.apart.get(k, []), key=lambda a: (a['file'], a['line'])) for k in APART}
        self.dups = {k: sorted(out.dups.get(k, []), key=lambda a: (a['file'], a['line'])) for k in DUP_KINDS}
        self.checked = out.checked
        self.ignores = sorted(ignores, key=lambda i: (i['file'], i['line']))
        self.seconds = seconds
        self.files = len(project.fi)
        self.lines = sum(fx.nlines for fx in project.fi.values())
        self.unreadable = sorted([fx.rel for fx in project.fi.values() if fx.lex_errors or fx.bad])

    def totals(self):
        c = collections.Counter(v['cat'] for v in self.violations)
        return {k: c.get(k, 0) for k in CATEGORIES}

    def kinds(self):
        return dict(collections.Counter(v['cat'] + '/' + v['kind'] for v in self.violations))

    def by_file(self):
        d = collections.defaultdict(list)
        for v in self.violations:
            d[v['file']].append(v)
        return d

    def conforming(self, cat):
        n = self.checked.get(cat, 0)
        v = self.totals().get(cat, 0) if cat != 'ignore' else 0
        return None if n == 0 else round(100.0 * (n - v) / n, 1)


def scan(repo=DEFAULT_REPO, mobile=None):
    t0 = time.time()
    repo = os.path.abspath(repo)
    mobile = os.path.abspath(mobile) if mobile else os.path.join(repo, 'mobile')
    project = Project(mobile, repo)
    analyzer = Analyzer(project)
    events = analyzer.run()
    out = classify(project, events)
    ignores = apply_ignores(project, out)
    return Result(project, events, out, ignores, time.time() - t0)


def git_commit(repo):
    try:
        r = subprocess.run(['git', '-C', repo, 'rev-parse', 'HEAD'], capture_output=True, text=True, timeout=10)
        return r.stdout.strip() if r.returncode == 0 and r.stdout.strip() else None
    except (OSError, subprocess.SubprocessError):
        return None


# --------------------------------------------------------------------------------------------------------------
# The baseline and the ratchet
# --------------------------------------------------------------------------------------------------------------
def baseline_path(repo, given=None):
    return given or os.path.join(repo, 'tools', 'design-audit', BASELINE_NAME)


def build_baseline(res, commit):
    files = {}
    for rel, vs in sorted(res.by_file().items()):
        counts = collections.Counter(v['cat'] for v in vs)
        files[rel] = {'counts': {c: counts[c] for c in CATEGORIES if counts[c]}, 'fp': ' '.join(sorted(v['fp'] for v in vs))}
    tot = res.totals()
    return {
        '$comment': 'The design-lint baseline: how far the app code is from design/tokens.json today. Written by `python3 tools/design-audit/scan.py --update-baseline`, '
                    'never by hand. `python3 tools/design-audit/scan.py --check` fails when a category total goes up, or when a file that has no entry here gets a violation '
                    '(code that only moved to it is not one). `fp` is one short fingerprint per violation (its rule, value and source line, not its line number), so a failure '
                    'can name the new violations and a move between files is told from a new violation. tools/design-audit/README.md has the rest.',
        'version': 1,
        'commit': commit,
        'totals': {c: tot[c] for c in CATEGORIES},
        'kinds': dict(sorted(res.kinds().items())),
        'apart': {k: len(res.apart[k]) for k in APART},
        'duplicates': {k: len(res.dups[k]) for k in DUP_KINDS},
        'files': files,
    }


def dump_baseline(doc):
    return json.dumps(doc, indent=1, ensure_ascii=False) + '\n'


def load_baseline(path):
    with open(path, encoding='utf-8') as f:
        doc = json.load(f)
    if doc.get('version') != 1:
        raise SystemExit(f'{path}: unknown baseline version {doc.get("version")!r}')
    return doc


def fmt_violation(v, indent='      '):
    return f"{indent}{v['file']}:{v['line']}  {v['cat']}/{v['kind']}: {v['msg']}\n{indent}    {v['text'][:130]}"


def check(res, base, limit=12):
    """Compare a scan with the baseline. Returns (ok, text). First the total of every category, then the files that have no baseline entry."""
    lines = []
    ok = True
    cur_tot, base_tot = res.totals(), base.get('totals', {})
    bfiles = base.get('files', {})
    cur_by = res.by_file()
    # new violations of a file: those whose fingerprint the baseline does not have for that file (as often as it has it)
    new_by = {}
    for rel, vs in cur_by.items():
        have = collections.Counter(bfiles.get(rel, {}).get('fp', '').split())
        new = []
        for v in vs:
            if have[v['fp']] > 0:
                have[v['fp']] -= 1
            else:
                new.append(v)
        new_by[rel] = new
    # 1. the totals
    for cat in CATEGORIES:
        cur, old = cur_tot[cat], base_tot.get(cat, 0)
        if cur <= old:
            continue
        ok = False
        lines.append(f'FAIL  {cat} went up: {old} -> {cur} (+{cur - old}). Rule: {CATEGORY_HELP[cat]}.')
        shown = [v for rel in sorted(new_by) if rel in bfiles for v in new_by[rel] if v['cat'] == cat]
        for v in shown[:limit]:
            lines.append(fmt_violation(v))
        if len(shown) > limit:
            lines.append(f'      ... and {len(shown) - limit} more')
        in_new_files = [rel for rel in sorted(cur_by) if rel not in bfiles and any(v['cat'] == cat for v in cur_by[rel])]
        if not shown and in_new_files:
            lines.append('      (in the file(s) with no baseline entry, listed below)')
        elif not shown:
            grew = sorted((rel, sum(1 for v in vs if v['cat'] == cat), bfiles.get(rel, {}).get('counts', {}).get(cat, 0)) for rel, vs in cur_by.items() if rel in bfiles)
            for rel, n, b in grew:
                if n > b:
                    lines.append(f'      {rel}: {b} -> {n}  (run --explain {rel})')
    # 2. files with no baseline entry must be clean, unless what is in them only moved
    gcur = collections.Counter(v['fp'] for vs in cur_by.values() for v in vs)
    gbase = collections.Counter()
    for f in bfiles.values():
        gbase.update(f.get('fp', '').split())
    for rel in sorted(cur_by):
        if rel in bfiles:
            continue
        vs = cur_by[rel]
        fresh = [v for v in vs if gcur[v['fp']] > gbase[v['fp']]]
        if not fresh:
            lines.append(f'ok    {rel} has no baseline entry and {len(vs)} violation(s), all of them lines that were already in the baseline: code that moved')
            continue
        ok = False
        lines.append(f'FAIL  {rel} has no baseline entry (it is new, or it was clean) and has {len(fresh)} violation(s): a file without an entry must be clean.')
        for v in fresh[:limit]:
            lines.append(fmt_violation(v))
        if len(fresh) > limit:
            lines.append(f'      ... and {len(fresh) - limit} more')
        moved = len(vs) - len(fresh)
        if moved:
            lines.append(f'      ({moved} more are lines that moved from another file: not counted)')
    # 3. files the scanner could not read
    new_unreadable = [f for f in res.unreadable if f not in base.get('unreadable', [])]
    for f in new_unreadable:
        ok = False
        lines.append(f'FAIL  the scanner cannot read {f} (unbalanced brackets or a construct lexer.py does not know): its violations cannot be counted. Fix lexer.py or the file.')
    # 4. things counted apart: told, never failing
    for k in APART:
        cur, old = len(res.apart[k]), base.get('apart', {}).get(k, 0)
        if cur > old:
            lines.append(f'note  counted apart, does not fail: {k} {old} -> {cur} (+{cur - old}): {APART[k]}')
    lowered = [c for c in CATEGORIES if cur_tot[c] < base_tot.get(c, 0)]
    if lowered and ok:
        lines.append('note  ' + ', '.join(f'{c} {base_tot[c]} -> {cur_tot[c]}' for c in lowered)
                     + ': the code is cleaner than the baseline. Lock it in: python3 tools/design-audit/scan.py --update-baseline, and commit baseline.json')
    head = 'design-lint: ok' if ok else 'design-lint: FAILED'
    total = sum(cur_tot.values())
    head += f"  ({total} violations in {res.files} files: " + ', '.join(f'{c} {cur_tot[c]}' for c in CATEGORIES) + f"; read in {res.seconds:.1f} s)"
    tail = []
    if not ok:
        tail = ['', 'How to fix: use the token the line above names (mobile/docs/DESIGN-RULES.md). If a line must break a rule on purpose, add a comment on it or on the line above:',
                '    // design-lint-ignore: <category> <why>',
                'If you only moved code between files and this still fails, run python3 tools/design-audit/scan.py --update-baseline: it accepts a move (it refuses when a total goes up).',
                'python3 tools/design-audit/scan.py --explain <file> lists every violation of a file.']
    return ok, '\n'.join([head] + lines + tail)


def update_baseline(res, path, allow_increase, commit):
    """Write the baseline. It only lowers or keeps every category total, unless allow_increase. Returns (exit code, text)."""
    doc = build_baseline(res, commit)
    old = None
    if os.path.exists(path):
        old = load_baseline(path)
    lines = []
    if old:
        up = [c for c in CATEGORIES if doc['totals'][c] > old['totals'].get(c, 0)]
        for c in CATEGORIES:
            a, b = old['totals'].get(c, 0), doc['totals'][c]
            lines.append(f'  {c:<8} {a:>5} -> {b:<5} {"(+%d)" % (b - a) if b > a else "(-%d)" % (a - b) if b < a else "(same)"}')
        for k in sorted(set(old.get('kinds', {})) | set(doc['kinds'])):
            a, b = old.get('kinds', {}).get(k, 0), doc['kinds'].get(k, 0)
            if a != b:
                lines.append(f'    {k:<24} {a:>5} -> {b}')
        added = sorted(set(doc['files']) - set(old.get('files', {})))
        gone = sorted(set(old.get('files', {})) - set(doc['files']))
        if added:
            lines.append(f'  files that now have an entry: {len(added)}  ' + ', '.join(added[:6]) + (' ...' if len(added) > 6 else ''))
        if gone:
            lines.append(f'  files that are clean now or gone: {len(gone)}')
        if up and not allow_increase:
            return 1, 'design-lint: baseline NOT written, a total would go up (' + ', '.join(f"{c} {old['totals'].get(c, 0)} -> {doc['totals'][c]}" for c in up) + ').\n' \
                + '\n'.join(lines) + '\nFix the new violations (python3 tools/design-audit/scan.py --check names them), or pass --allow-increase if the owner has accepted the rise.'
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(dump_baseline(doc))
    head = 'design-lint: baseline written to ' + os.path.relpath(path)
    return 0, '\n'.join([head] + (lines if old else ['  ' + ', '.join(f'{c} {doc["totals"][c]}' for c in CATEGORIES)]))


# --------------------------------------------------------------------------------------------------------------
# Report and explain
# --------------------------------------------------------------------------------------------------------------
def pct(v):
    return 'n/a' if v is None else f'{v:.1f}%'


def common_values(res, kinds, top=8):
    c = collections.Counter(v['value'] for v in res.violations if v['cat'] + '/' + v['kind'] in kinds)
    return ', '.join(f'{k} x{n}' for k, n in sorted(c.items(), key=lambda kv: (-kv[1], str(kv[0])))[:top])


def render_report(res, base=None, commit=None, top_files=15):
    S = res.std
    tot = res.totals()
    L = []
    L.append('# Design lint report')
    L.append('')
    L.append(f"Tree {('`' + commit[:9] + '`') if commit else '(no git)'} · {res.files} files · {res.lines:,} lines · read in {res.seconds:.1f} s · the standard is `design/tokens.json`.")
    L.append('')
    L.append('| standard | values |')
    L.append('| --- | --- |')
    L.append('| space | ' + ', '.join(sn(x) for x in S.space_vals) + ' |')
    L.append('| text sizes | ' + ', '.join(sn(x) for x in S.font_sizes) + f' (the smallest is {sn(S.smallest_font)}) |')
    L.append('| text line heights | ' + ', '.join(sn(x) for x in S.line_heights) + ' |')
    L.append('| radius | ' + ', '.join(f'{k} {sn(v)}' for k, v in S.radius.items()) + ' |')
    L.append('| icon sizes | ' + ', '.join(sn(x) for x in S.icon_sizes) + ' |')
    L.append(f'| tap targets | {sn(S.touch_hard)} hard minimum (a hitSlop counts), {sn(S.touch_primary)} for primary actions |')
    L.append('')
    L.append('## Totals')
    L.append('')
    L.append('| category | violations | values checked | conforming | baseline | since baseline |')
    L.append('| --- | ---: | ---: | ---: | ---: | ---: |')
    for c in CATEGORIES:
        b = base.get('totals', {}).get(c) if base else None
        delta = '' if b is None else ('0' if tot[c] == b else f'{tot[c] - b:+d}')
        conf = pct(res.conforming(c)) if c != 'ignore' else ''
        chk = f'{res.checked.get(c, 0):,}' if c != 'ignore' else ''
        L.append(f"| {c} | {tot[c]:,} | {chk} | {conf} | {'' if b is None else f'{b:,}'} | {delta} |")
    checked = sum(res.checked.values())
    gating = sum(tot[c] for c in CATEGORIES if c != 'ignore')
    L.append(f"| **all** | **{sum(tot.values()):,}** | {checked:,} | {pct(100.0 * (checked - gating) / checked if checked else None)} | {sum(base['totals'].values()):,} |  |" if base else
             f"| **all** | **{sum(tot.values()):,}** | {checked:,} | {pct(100.0 * (checked - gating) / checked if checked else None)} |  |  |")
    by_file = res.by_file()
    clean = res.files - len([f for f in by_file])
    L.append('')
    L.append(f'Files without a violation: {clean} of {res.files} ({100.0 * clean / res.files:.1f}%). "Conforming" is the share of the values the scanner could read '
             '(a number or a token; a computed value or a zero is not read) that are inside the standard.')
    L.append('')
    L.append('## Violations by kind')
    L.append('')
    L.append('| kind | count | what |')
    L.append('| --- | ---: | --- |')
    kinds = res.kinds()
    for k, what in KINDS.items():
        if kinds.get(k):
            L.append(f'| `{k}` | {kinds[k]} | {what} |')
    L.append('')
    L.append('Most common values that are off the scale: ' + '; '.join(x for x in (
        'spacing ' + common_values(res, ('spacing/padding', 'spacing/margin', 'spacing/gap')),
        'font sizes ' + common_values(res, ('font/size', 'font/small')),
        'icon sizes ' + common_values(res, ('size/icon',)),
        'radius ' + common_values(res, ('size/radius',))) if not x.endswith(' ')) + '.')
    L.append('')
    L.append('## Counted apart (reported, never failing)')
    L.append('')
    L.append('| what | count | baseline |')
    L.append('| --- | ---: | ---: |')
    for k, what in APART.items():
        b = base.get('apart', {}).get(k) if base else None
        L.append(f"| `{k}`: {what} | {len(res.apart[k])} | {'' if b is None else b} |")
    L.append('')
    L.append('## Hand-made components (a heuristic: report only, never failing)')
    L.append('')
    L.append('| kind | count |')
    L.append('| --- | ---: |')
    for k, what in DUP_KINDS.items():
        L.append(f'| {what} | {len(res.dups[k])} |')
    L.append('')
    L.append(f'## Exceptions: {len(res.ignores)} design-lint-ignore comment(s)')
    L.append('')
    if res.ignores:
        L.append('| where | category | reason | lines excused |')
        L.append('| --- | --- | --- | ---: |')
        for ig in res.ignores:
            L.append(f"| `{ig['file']}:{ig['line']}` | {ig['cats_raw']} | {ig['reason'] or '(none)'}{' **(' + ig['problem'] + ')**' if ig['problem'] else ''} | {ig['hits']} |")
    else:
        L.append('None.')
    L.append('')
    L.append(f'## Top {top_files} files')
    L.append('')
    L.append('| file | violations | ' + ' | '.join(CATEGORIES) + ' |')
    L.append('| --- | ---: | ' + ' | '.join('---:' for _ in CATEGORIES) + ' |')
    ranked = sorted(by_file.items(), key=lambda kv: (-len(kv[1]), kv[0]))[:top_files]
    for rel, vs in ranked:
        cc = collections.Counter(v['cat'] for v in vs)
        L.append(f'| `{rel}` | {len(vs)} | ' + ' | '.join(str(cc.get(c, 0) or '') for c in CATEGORIES) + ' |')
    L.append('')
    return '\n'.join(L)


def report_json(res, commit):
    return {
        'commit': commit,
        'files_scanned': res.files,
        'lines_scanned': res.lines,
        'seconds': round(res.seconds, 2),
        'totals': res.totals(),
        'kinds': dict(sorted(res.kinds().items())),
        'checked': {c: res.checked.get(c, 0) for c in CATEGORIES if c != 'ignore'},
        'conforming_pct': {c: res.conforming(c) for c in CATEGORIES if c != 'ignore'},
        'apart': {k: len(res.apart[k]) for k in APART},
        'duplicates': {k: len(res.dups[k]) for k in DUP_KINDS},
        'ignores': res.ignores,
        'unreadable_files': res.unreadable,
        'files_without_violation': res.files - len(res.by_file()),
        'files': {rel: {c: n for c, n in sorted(collections.Counter(v['cat'] for v in vs).items())} for rel, vs in sorted(res.by_file().items())},
        'violations': [{k: v[k] for k in ('file', 'line', 'cat', 'kind', 'value', 'msg', 'text')} for v in res.violations],
        'apart_items': {k: res.apart[k] for k in APART},
        'duplicate_items': {k: res.dups[k] for k in DUP_KINDS},
    }


def find_file(res, wanted):
    rels = sorted(res.project.by_rel)
    w = wanted.replace('\\', '/')
    for cand in (w, w[len('mobile/'):] if w.startswith('mobile/') else None):
        if cand in res.project.by_rel:
            return [cand]
    return [r for r in rels if r.endswith('/' + w.lstrip('/')) or r.endswith(w)]


def explain(res, base, wanted):
    rels = find_file(res, wanted)
    if not rels:
        return 1, f'{wanted}: not scanned. design-lint reads the .ts and .tsx files of mobile/app and mobile/src (not tests, not mobile/src/theme, not {", ".join(sorted(EXCLUDE_FILES))}).'
    if len(rels) > 1:
        return 1, f'{wanted} matches {len(rels)} files, say which:\n  ' + '\n  '.join(rels[:20])
    rel = rels[0]
    vs = res.by_file().get(rel, [])
    bcounts = (base or {}).get('files', {}).get(rel, {}).get('counts', {})
    L = [f"{rel}: {len(vs)} violation(s)" + (f"; baseline: {', '.join(f'{c} {n}' for c, n in bcounts.items())}" if bcounts else ('; no baseline entry: this file must stay clean' if base else ''))]
    for v in vs:
        L.append(f"  line {v['line']:<5} {v['cat']}/{v['kind']}: {v['msg']}")
        L.append(f"             {v['text'][:140]}")
    ap = [(k, a) for k in APART for a in res.apart[k] if a['file'] == rel]
    if ap:
        L.append('counted apart (never failing):')
        for k, a in ap:
            L.append(f"  line {a['line']:<5} {k}: {a['msg']}")
    dp = [(k, d) for k in DUP_KINDS for d in res.dups[k] if d['file'] == rel]
    if dp:
        L.append('hand-made components (a heuristic, never failing):')
        for k, d in dp:
            L.append(f"  line {d['line']:<5} {DUP_KINDS[k]}")
    ig = [i for i in res.ignores if i['file'] == rel]
    if ig:
        L.append('design-lint-ignore comments:')
        for i in ig:
            L.append(f"  line {i['line']:<5} {i['cats_raw']}: {i['reason'] or '(no reason)'}  (excuses {i['hits']} line(s))")
    if not vs and not ap and not dp and not ig:
        L.append('  clean.')
    return 0, '\n'.join(L)


# --------------------------------------------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------------------------------------------
def main(argv=None):
    ap = argparse.ArgumentParser(prog='scan.py', description='design-lint: is the app code inside design/tokens.json? (tools/design-audit/README.md)')
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true', help='fail when a category total goes up against the baseline, or a file with no baseline entry has a violation')
    mode.add_argument('--report', action='store_true', help='print a markdown report (--json FILE also writes every violation as JSON)')
    mode.add_argument('--update-baseline', action='store_true', help='write the baseline; it only lowers or keeps the totals unless --allow-increase')
    mode.add_argument('--explain', metavar='FILE', help='list every violation of one file and what to use instead')
    ap.add_argument('--allow-increase', action='store_true', help='with --update-baseline: accept a total that goes up (the owner has accepted it)')
    ap.add_argument('--json', metavar='FILE', help='with --report: also write the report as JSON')
    ap.add_argument('--root', default=DEFAULT_REPO, help='the repository root (default: the one this script is in)')
    ap.add_argument('--baseline', help='the baseline file (default: tools/design-audit/baseline.json below the root)')
    a = ap.parse_args(argv)
    for stream in (sys.stdout, sys.stderr):   # a source line with an accent must not stop the report on a terminal that is not UTF-8
        try:
            stream.reconfigure(errors='replace')
        except (AttributeError, ValueError):
            pass
    repo = os.path.abspath(a.root)
    bpath = baseline_path(repo, a.baseline)
    res = scan(repo)
    commit = git_commit(repo)
    if a.update_baseline:
        code, text = update_baseline(res, bpath, a.allow_increase, commit)
        print(text)
        return code
    base = load_baseline(bpath) if os.path.exists(bpath) else None
    if a.check:
        if base is None:
            print(f'design-lint: {bpath} does not exist. Create it with: python3 tools/design-audit/scan.py --update-baseline', file=sys.stderr)
            return 2
        ok, text = check(res, base)
        print(text)
        return 0 if ok else 1
    if a.explain:
        code, text = explain(res, base, a.explain)
        print(text)
        return code
    print(render_report(res, base, commit))
    if a.json:
        with open(a.json, 'w', encoding='utf-8') as f:
            json.dump(report_json(res, commit), f, indent=1, ensure_ascii=False)
            f.write('\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
