// Which screens does the app have, and which account states can reach them? Both come from the source, so a screen
// added tomorrow is swept without editing the test.
//
//  1. Routes: expo-router is file based. Every file under mobile/app is a route except _layout, the +special files
//     (+not-found, +html, +native-intent), API routes (name+api.ts) and platform files for other platforms. (group) folders
//     vanish from the URL, index is the folder itself, [param] is a parameter (it gets a fixed sample value here).
//  2. Guards: a layout wraps screens in <Stack.Protected guard={...}>. The guards are read from the layout files and
//     evaluated for three account states (see PERSONAS), so the test knows which routes a signed-out person can open,
//     which ones need an account, and which need an account WITH a journey. Nothing here is a hardcoded list of routes.
//
// A guard this file cannot read (anything but names, !, && and ||) throws: a route silently left out of the sweep is
// worse than a test that stops and says why.
import { readdir, readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';

/** The three states the app can be in. `session` = signed in, `journey` = the account has a journey (onboarding done). */
export const PERSONAS = {
  out: { label: 'signed out', facts: { session: false, journey: false } },
  new: { label: 'signed in, no journey yet', facts: { session: true, journey: false } },
  in: { label: 'signed in, with a journey', facts: { session: true, journey: true } },
};

/** What a [param] becomes in the URL. A UUID, because most ids of the app are (fixtures.mjs makes a chat with this id, so /chat/<it> is a real chat). */
export const SAMPLE_PARAM = '00000000-0000-4000-8000-0000000000aa';
/** Routes whose parameter must be something specific to show the screen itself instead of "not found". Optional: a new route needs no entry. */
export const SAMPLE_OVERRIDES = {
  // st1 is the id of a bundled sample stay (src/data/mock.ts), so the page shows a stay and not "Stay not found."
  '/stay/[id]': 'st1',
  // the chapters of the Psalms and Psalm 121 (the reader), so that the sweep draws the real screens and not their "Not found"
  '/library/bible/[code]': 'PSA',
  '/library/bible/[code]/[chapter]': { code: 'PSA', chapter: '121' },
  // a book of the Books tab: its page, and its reader (which opens at the first chapter), so that the sweep draws the real screens and not "That book is not in the Library"
  '/library/book/[id]': 'imitation-of-christ',
  '/library/book/[id]/read': 'imitation-of-christ',
};

// ---------------------------------------------------------------- files -> routes

const SOURCE = /^(.*?)(?:\.(web|native|ios|android))?\.(?:tsx|ts|jsx|js)$/;

/** What expo-router makes of one file of the app directory (path relative to it, with /). */
export function classifyFile(rel) {
  const base = posix.basename(rel);
  if (base.startsWith('.') || base.endsWith('.d.ts')) return { kind: 'skip', why: 'not a source file' };
  const m = SOURCE.exec(rel);
  if (!m) return { kind: 'skip', why: 'not a source file' };
  const [, stem, platform] = m;
  if (platform && platform !== 'web') return { kind: 'skip', why: `${platform} only` };
  const name = posix.basename(stem);
  if (name === '_layout') return { kind: 'layout', stem };
  if (name.startsWith('+')) return { kind: 'skip', why: 'special file' };
  if (/\+api$/.test(name)) return { kind: 'skip', why: 'API route' };
  return { kind: 'route', stem };
}

/** '(tabs)/me' -> '/me', 'business/index' -> '/business', 'stay/[id]' -> '/stay/[id]', 'index' -> '/'. */
export function patternOf(stem) {
  const segments = stem.split('/').filter((s) => !/^\(.*\)$/.test(s));
  if (segments.at(-1) === 'index') segments.pop();
  return '/' + segments.join('/');
}

/** '/stay/[id]' -> '/stay/st1'. [...rest] and [[...rest]] become two segments. */
export function urlOf(pattern, overrides = SAMPLE_OVERRIDES) {
  return pattern.replace(/\[\[?\.\.\.(\w+)\]\]?|\[(\w+)\]/g, (_all, rest, one) => {
    const o = overrides[pattern];
    const name = rest || one;
    const v = typeof o === 'string' ? o : o && o[name];
    return v ?? (rest ? 'a/b' : SAMPLE_PARAM);
  });
}

async function walk(root, rel = '') {
  const out = [];
  for (const e of await readdir(join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walk(root, r)));
    else out.push(r);
  }
  return out.sort();
}

// ---------------------------------------------------------------- guards

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments, JSX ones ({/* ... */}) included
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1'); // line comments, but not the // of https://
}

function skipString(src, i) {
  const q = src[i];
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') j++;
    else if (src[j] === q) return j;
  }
  throw new Error('unterminated string in the layout file');
}

/** Reads the attributes of a JSX tag that starts after its name. attrs: name -> the raw text of its value. */
function readTag(src, start) {
  const attrs = {};
  let i = start;
  for (;;) {
    while (/\s/.test(src[i] ?? 'x')) i++;
    if (src[i] === '/' && src[i + 1] === '>') return { attrs, end: i + 2 };
    if (src[i] === '>') return { attrs, end: i + 1 };
    const m = /^[A-Za-z_$][\w$-]*/.exec(src.slice(i, i + 80));
    if (!m) throw new Error(`cannot read a JSX tag in the layout file near: ${src.slice(start - 30, start + 60).replace(/\s+/g, ' ')}`);
    const name = m[0];
    i += name.length;
    while (/\s/.test(src[i] ?? 'x')) i++;
    if (src[i] !== '=') { attrs[name] = true; continue; }
    i++;
    while (/\s/.test(src[i] ?? 'x')) i++;
    if (src[i] === '"' || src[i] === "'") {
      const j = skipString(src, i);
      attrs[name] = src.slice(i + 1, j);
      i = j + 1;
    } else if (src[i] === '{') {
      let depth = 0;
      let j = i;
      for (; j < src.length; j++) {
        const ch = src[j];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) break; }
        else if (ch === '"' || ch === "'" || ch === '`') j = skipString(src, j);
      }
      attrs[name] = src.slice(i + 1, j).trim();
      i = j + 1;
    } else {
      throw new Error(`cannot read the value of ${name} in the layout file`);
    }
  }
}

/** The screens of a layout file, each with the guards of the <X.Protected> blocks around it, and the plain `const a = <boolean expression>` lines. */
export function scanLayout(source) {
  const src = stripComments(source);
  const screens = [];
  const open = []; // guards of the Protected blocks we are inside of
  const tag = /<(\/)?([A-Za-z_$][\w$]*)\.(Protected|Screen)\b/g;
  let m;
  while ((m = tag.exec(src))) {
    const [all, closing, , kind] = m;
    if (closing) {
      if (kind === 'Protected') open.pop();
      continue;
    }
    const { attrs, end } = readTag(src, m.index + all.length);
    tag.lastIndex = end;
    const selfClosing = src.slice(end - 2, end) === '/>';
    if (kind === 'Protected') {
      if (typeof attrs.guard !== 'string') throw new Error('a Protected block without a guard={...} expression in the layout file');
      if (!selfClosing) open.push(attrs.guard);
    } else {
      if (typeof attrs.name !== 'string') throw new Error('a Screen without a name="..." in the layout file');
      screens.push({ name: attrs.name, guards: [...open] });
    }
  }
  if (open.length) throw new Error('an unclosed <Protected> block in the layout file');
  const consts = {};
  for (const c of src.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+);/g)) {
    try { parseBool(c[2]); consts[c[1]] = c[2].trim(); } catch { /* not a boolean expression: not something a guard can use */ }
  }
  return { screens, consts };
}

// A tiny boolean language: names, true, false, !, &&, ||, parentheses.
function tokens(expr) {
  const out = [];
  const re = /\s*(&&|\|\||!|\(|\)|[A-Za-z_$][\w$]*)/y;
  let at = 0;
  while (at < expr.length) {
    re.lastIndex = at;
    const m = re.exec(expr);
    if (!m) {
      if (expr.slice(at).trim() === '') break;
      throw new Error(`cannot read "${expr.trim()}" (stops at "${expr.slice(at).trim().slice(0, 12)}"): only names, !, && and || are understood`);
    }
    out.push(m[1]);
    at = re.lastIndex;
  }
  return out;
}

export function parseBool(expr) {
  const t = tokens(expr);
  let i = 0;
  const or = () => { let a = and(); while (t[i] === '||') { i++; a = { op: 'or', a, b: and() }; } return a; };
  const and = () => { let a = not(); while (t[i] === '&&') { i++; a = { op: 'and', a, b: not() }; } return a; };
  const not = () => { if (t[i] === '!') { i++; return { op: 'not', a: not() }; } return primary(); };
  const primary = () => {
    const x = t[i++];
    if (x === '(') { const a = or(); if (t[i++] !== ')') throw new Error(`missing ) in "${expr}"`); return a; }
    if (x && /^[A-Za-z_$]/.test(x)) return { op: 'name', name: x };
    throw new Error(`unexpected ${x === undefined ? 'end' : `"${x}"`} in "${expr}"`);
  };
  const ast = or();
  if (i < t.length) throw new Error(`unexpected "${t[i]}" in "${expr}"`);
  return ast;
}

/** Evaluates a guard for one account state. `facts` are the base names (session, journey), `consts` the derived ones (signedIn, onboarded). */
export function evalGuard(expr, facts, consts = {}) {
  const lookup = (name, seen = []) => {
    if (name === 'true') return true;
    if (name === 'false') return false;
    if (Object.hasOwn(facts, name)) return facts[name];
    if (Object.hasOwn(consts, name)) {
      if (seen.includes(name)) throw new Error(`"${name}" is defined in terms of itself`);
      return run(parseBool(consts[name]), [...seen, name]);
    }
    throw new Error(`the guard "${expr}" uses "${name}", which this test does not know. Known: ${[...Object.keys(facts), ...Object.keys(consts)].join(', ')}. Teach tools/web-smoke/routes.mjs what it means.`);
  };
  const run = (n, seen = []) => {
    switch (n.op) {
      case 'name': return lookup(n.name, seen);
      case 'not': return !run(n.a, seen);
      case 'and': return run(n.a, seen) && run(n.b, seen);
      case 'or': return run(n.a, seen) || run(n.b, seen);
      default: throw new Error(`bad node ${n.op}`);
    }
  };
  return run(parseBool(expr));
}

// ---------------------------------------------------------------- everything together

/**
 * Reads the app directory. Returns the routes (pattern, sample url, files, the account states that can open it),
 * and `problems`: things that make the sweep untrustworthy and must fail the test (a route nobody can reach, a screen a
 * layout declares that has no file).
 */
export async function discoverRoutes(appDir) {
  const files = await walk(appDir);
  const routeStems = [];
  const layouts = [];
  for (const rel of files) {
    const k = classifyFile(rel);
    if (k.kind === 'route') routeStems.push(k.stem);
    if (k.kind === 'layout') {
      const dir = posix.dirname(k.stem) === '.' ? '' : posix.dirname(k.stem);
      layouts.push({ file: rel, dir, ...scanLayout(await readFile(join(appDir, rel), 'utf8')) });
    }
  }
  const problems = [];
  const inside = (dir, stem) => (dir === '' ? stem : stem.startsWith(dir + '/') ? stem.slice(dir.length + 1) : null);
  const matches = (rel, name) => rel === name || rel.startsWith(name + '/');

  // a screen a layout declares must have a file (expo-router only warns about it in a development build)
  for (const l of layouts) {
    for (const s of l.screens) {
      const any = routeStems.some((stem) => { const rel = inside(l.dir, stem); return rel !== null && matches(rel, s.name); });
      if (!any) problems.push(`${l.file} declares the screen "${s.name}", but no file of the app matches it`);
    }
  }

  const byPattern = new Map();
  for (const stem of [...new Set(routeStems)]) {
    const pattern = patternOf(stem);
    // every layout above the file contributes the guards of the screen that contains it
    const guards = [];
    for (const l of layouts) {
      const rel = inside(l.dir, stem);
      if (rel === null) continue;
      const hit = l.screens.filter((s) => matches(rel, s.name)).sort((a, b) => b.name.length - a.name.length)[0];
      if (hit) for (const g of hit.guards) guards.push({ expr: g, consts: l.consts, layout: l.file });
    }
    const personas = Object.entries(PERSONAS).filter(([, p]) => guards.every((g) => evalGuard(g.expr, p.facts, g.consts))).map(([id]) => id);
    const e = byPattern.get(pattern) ?? { pattern, url: urlOf(pattern), files: [], personas: new Set() };
    e.files.push(stem);
    for (const p of personas) e.personas.add(p);
    byPattern.set(pattern, e);
  }
  const routes = [...byPattern.values()]
    .map((e) => ({ ...e, personas: Object.keys(PERSONAS).filter((p) => e.personas.has(p)) }))
    .sort((a, b) => a.pattern.localeCompare(b.pattern));
  for (const r of routes) {
    if (r.personas.length === 0) problems.push(`${r.pattern} (${r.files.join(', ')}) cannot be reached in any account state, so it would never be swept: check its guard`);
  }
  return { routes, layouts, problems };
}
