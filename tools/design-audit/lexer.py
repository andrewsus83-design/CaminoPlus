"""lexer.py: a small JSX-aware TypeScript/TSX tokenizer (Python 3 standard library only), the reader of tools/design-audit/scan.py.

It is NOT a parser. It turns source text into a flat token list that keeps brackets balanced, keeps string/template
text, and understands enough JSX that an apostrophe in a text child ("Don't") does not start a string. Comments are not
tokens: they are returned apart, as (first line, last line, text), because the `design-lint-ignore` comments are read
from them. scan.py builds everything else (bracket matching, style records, JSX elements) on this list.

Token types (Tok.t):
  id          identifier or keyword
  num         numeric literal (Tok.v is the source text; Tok.n is the float value)
  str         string literal, or one static segment of a template literal (Tok.flag == 'tpl')
  regex       regular expression literal
  p           punctuation / operator. '{' and '}' are emitted for JSX expression containers and ${...} too
              (Tok.flag says which: 'jsxexpr', 'jsxclose', 'tplopen', 'tplclose'), so every bracket is balanced
  jsx_open    '<Name' of an opening tag (Tok.v is the tag name, '' for a fragment)
  jsx_attr    an attribute name inside an opening tag
  jsx_gt      '>' that ends an opening tag (children follow)
  jsx_selfclose  '/>'
  jsx_close   a closing tag '</Name>'
  jsx_text    non-blank text child
"""
import bisect
import re

KEYWORD_BEFORE_EXPR = {
    'return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do', 'instanceof',
    'yield', 'await', 'default', 'extends',
}
PUNCT_BEFORE_JSX = {'(', ',', '=', '=>', ':', '?', '[', '{', '&&', '||', '??', '!', '&', '|', ';', '+', '-'}
KEYWORD_BEFORE_JSX = {'return', 'default', 'case', 'yield', 'await', 'else', 'do', 'in', 'of', 'typeof'}

WS = re.compile(r'[ \t\r\n\f\v ﻿]+')
ID = re.compile(r'[A-Za-z_$][A-Za-z0-9_$]*')
NUM = re.compile(r'0[xX][0-9a-fA-F_]+n?|0[bB][01_]+n?|0[oO][0-7_]+n?|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?n?')
STR_S = re.compile(r"'(?:[^'\\\n]|\\.)*'", re.S)
STR_D = re.compile(r'"(?:[^"\\\n]|\\.)*"', re.S)
JSXNAME = re.compile(r'[A-Za-z_$][A-Za-z0-9_$.:\-]*')
JSXATTR = re.compile(r'[A-Za-z_$][A-Za-z0-9_$:\-]*')
JSXCLOSE = re.compile(r'</\s*([A-Za-z_$][A-Za-z0-9_$.:\-]*)?\s*>')
PUNCT = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
         '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>']


class Tok:
    __slots__ = ('t', 'v', 'pos', 'flag', 'n', 'line')

    def __init__(self, t, v, pos, flag=None, n=None):
        self.t = t
        self.v = v
        self.pos = pos
        self.flag = flag
        self.n = n
        self.line = 0

    def __repr__(self):
        return f'Tok({self.t},{self.v!r},L{self.line})'


def parse_num(text):
    s = text.replace('_', '')
    if s.endswith('n'):
        s = s[:-1]
    try:
        if s[:2] in ('0x', '0X'):
            return float(int(s, 16))
        if s[:2] in ('0b', '0B'):
            return float(int(s[2:], 2))
        if s[:2] in ('0o', '0O'):
            return float(int(s[2:], 8))
        return float(s)
    except ValueError:
        return 0.0


def lex(src, jsx):
    """Tokenize `src`. `jsx` is True for .tsx files. Returns (tokens, errors, comments); a comment is (first line, last line, text)."""
    toks = []
    errors = []
    comment_spans = []   # (start, end) of every comment, in source order
    n = len(src)
    i = 0
    stack = [{'k': 'code', 'depth': 0, 'closer': None}]

    def emit(t, v, pos, flag=None, num=None):
        toks.append(Tok(t, v, pos, flag, num))

    def prev_tok():
        return toks[-1] if toks else None

    def jsx_ok():
        p = prev_tok()
        if p is None:
            return True
        if p.t == 'p':
            return p.v in PUNCT_BEFORE_JSX
        if p.t == 'id':
            return p.v in KEYWORD_BEFORE_JSX
        return False

    def regex_ok():
        p = prev_tok()
        if p is None:
            return True
        if p.t == 'p':
            return p.v not in (')', ']', '}')
        if p.t == 'id':
            return p.v in KEYWORD_BEFORE_EXPR
        return False

    def open_tag(at):
        """src[at] == '<' and a tag name (or '>') follows. Emits jsx_open, pushes a jsxtag context. Returns new index."""
        if src[at + 1] == '>':
            emit('jsx_open', '', at)
            stack.append({'k': 'jsxtag'})
            return at + 1
        m = JSXNAME.match(src, at + 1)
        emit('jsx_open', m.group(), at)
        stack.append({'k': 'jsxtag'})
        return m.end()

    while i < n:
        ctx = stack[-1]
        k = ctx['k']

        if k == 'code':
            m = WS.match(src, i)
            if m:
                i = m.end()
                continue
            c = src[i]
            if c == '/':
                d = src[i + 1] if i + 1 < n else ''
                if d == '/':
                    j = src.find('\n', i)
                    end = n if j < 0 else j
                    comment_spans.append((i, end))
                    i = end
                    continue
                if d == '*':
                    j = src.find('*/', i + 2)
                    end = n if j < 0 else j + 2
                    comment_spans.append((i, end))
                    i = end
                    continue
                if regex_ok():
                    j = i + 1
                    in_class = False
                    while j < n and src[j] != '\n':
                        ch = src[j]
                        if ch == '\\':
                            j += 2
                            continue
                        if ch == '[':
                            in_class = True
                        elif ch == ']':
                            in_class = False
                        elif ch == '/' and not in_class:
                            break
                        j += 1
                    j += 1
                    while j < n and (src[j].isalpha()):
                        j += 1
                    emit('regex', src[i:j], i)
                    i = j
                    continue
            if c == "'" or c == '"':
                m = (STR_S if c == "'" else STR_D).match(src, i)
                if m:
                    emit('str', m.group()[1:-1], i)
                    i = m.end()
                else:
                    j = src.find('\n', i)
                    j = n if j < 0 else j
                    errors.append(('unterminated string', i))
                    emit('str', src[i + 1:j], i)
                    i = j
                continue
            if c == '`':
                stack.append({'k': 'tpl'})
                i += 1
                continue
            if c == '{':
                ctx['depth'] += 1
                emit('p', '{', i)
                i += 1
                continue
            if c == '}':
                if ctx['depth'] == 0 and ctx['closer']:
                    emit('p', '}', i, flag=ctx['closer'])
                    stack.pop()
                    i += 1
                    continue
                ctx['depth'] -= 1
                emit('p', '}', i)
                i += 1
                continue
            if c == '<' and jsx and i + 1 < n:
                nxt = src[i + 1]
                if (nxt == '>' or ID.match(src, i + 1)) and jsx_ok():
                    m2 = JSXNAME.match(src, i + 1)
                    rest = src[m2.end():m2.end() + 12].lstrip() if m2 else ''
                    if not (m2 and (rest.startswith(',') or rest.startswith('extends '))):
                        i = open_tag(i)
                        continue
            if c.isdigit() or (c == '.' and i + 1 < n and src[i + 1].isdigit()):
                m = NUM.match(src, i)
                emit('num', m.group(), i, num=parse_num(m.group()))
                i = m.end()
                continue
            m = ID.match(src, i)
            if m:
                emit('id', m.group(), i)
                i = m.end()
                continue
            for op in PUNCT:
                if src.startswith(op, i):
                    emit('p', op, i)
                    i += len(op)
                    break
            else:
                emit('p', c, i)
                i += 1
            continue

        if k == 'tpl':
            j = i
            while j < n:
                ch = src[j]
                if ch == '\\':
                    j += 2
                    continue
                if ch == '`':
                    break
                if ch == '$' and j + 1 < n and src[j + 1] == '{':
                    break
                j += 1
            emit('str', src[i:j], i, flag='tpl')
            if j >= n:
                errors.append(('unterminated template', i))
                i = n
                break
            if src[j] == '`':
                stack.pop()
                i = j + 1
            else:
                emit('p', '{', j, flag='tplopen')
                stack.append({'k': 'code', 'depth': 0, 'closer': 'tplclose'})
                i = j + 2
            continue

        if k == 'jsxtag':
            m = WS.match(src, i)
            if m:
                i = m.end()
                continue
            c = src[i]
            if c == '/' and src.startswith('/>', i):
                emit('jsx_selfclose', '/>', i)
                stack.pop()
                i += 2
                continue
            if c == '/' and src.startswith('//', i):
                j = src.find('\n', i)
                end = n if j < 0 else j
                comment_spans.append((i, end))
                i = end
                continue
            if c == '/' and src.startswith('/*', i):
                j = src.find('*/', i + 2)
                end = n if j < 0 else j + 2
                comment_spans.append((i, end))
                i = end
                continue
            if c == '>':
                emit('jsx_gt', '>', i)
                stack.pop()
                stack.append({'k': 'jsxchild'})
                i += 1
                continue
            if c == '{':
                emit('p', '{', i, flag='jsxexpr')
                stack.append({'k': 'code', 'depth': 0, 'closer': 'jsxclose'})
                i += 1
                continue
            if c == "'" or c == '"':
                m = (STR_S if c == "'" else STR_D).match(src, i)
                if m:
                    emit('str', m.group()[1:-1], i, flag='jsxattrval')
                    i = m.end()
                else:
                    j = src.find('\n', i)
                    j = n if j < 0 else j
                    emit('str', src[i + 1:j], i, flag='jsxattrval')
                    i = j
                continue
            if c == '=':
                i += 1
                continue
            m = JSXATTR.match(src, i)
            if m:
                emit('jsx_attr', m.group(), i)
                i = m.end()
                continue
            errors.append((f'unexpected {c!r} in jsx tag', i))
            i += 1
            continue

        if k == 'jsxchild':
            j = i
            while j < n and src[j] != '<' and src[j] != '{':
                j += 1
            text = src[i:j].strip()
            if text:
                emit('jsx_text', text, i)
            if j >= n:
                errors.append(('unterminated jsx children', i))
                i = n
                break
            if src[j] == '{':
                emit('p', '{', j, flag='jsxexpr')
                stack.append({'k': 'code', 'depth': 0, 'closer': 'jsxclose'})
                i = j + 1
                continue
            # '<'
            if j + 1 < n and src[j + 1] == '/':
                m = JSXCLOSE.match(src, j)
                if m:
                    emit('jsx_close', m.group(1) or '', j)
                    stack.pop()
                    i = m.end()
                    continue
                errors.append(('bad closing tag', j))
                i = j + 1
                continue
            if j + 1 < n and (src[j + 1] == '>' or ID.match(src, j + 1)):
                i = open_tag(j)
                continue
            emit('jsx_text', '<', j)
            i = j + 1
            continue

    # line numbers
    starts = [0]
    idx = src.find('\n')
    while idx >= 0:
        starts.append(idx + 1)
        idx = src.find('\n', idx + 1)
    for t in toks:
        t.line = bisect.bisect_right(starts, t.pos)
    if len(stack) > 1:
        errors.append((f'unclosed contexts at end of file: {[s["k"] for s in stack[1:]]}', n))
    comments = [(bisect.bisect_right(starts, a), bisect.bisect_right(starts, max(a, b - 1)), src[a:b]) for a, b in comment_spans]
    return toks, errors, comments


def match_brackets(toks):
    """Return (match, parent) where match maps an opener index to its closer index and back, and parent[i] is the
    index of the innermost unclosed opener around token i (-1 at top level). Also returns a list of mismatches."""
    match = {}
    parent = [-1] * len(toks)
    st = []
    bad = []
    pairs = {'{': '}', '(': ')', '[': ']'}
    for i, t in enumerate(toks):
        parent[i] = st[-1] if st else -1
        if t.t != 'p':
            continue
        if t.v in pairs:
            st.append(i)
        elif t.v in ('}', ')', ']'):
            if st and pairs[toks[st[-1]].v] == t.v:
                o = st.pop()
                match[o] = i
                match[i] = o
                parent[i] = st[-1] if st else -1
            else:
                bad.append(i)
    if st:
        bad.extend(st)
    return match, parent, bad
