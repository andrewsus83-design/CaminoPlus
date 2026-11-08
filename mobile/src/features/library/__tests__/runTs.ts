// Runs a TypeScript file of the app in plain node, for the tests of files that `require` the assets of the Bible (text.ts, searchText.ts): those
// cannot run where the tests run (the compiled copies sit under node_modules/.cache, with rootDir src), so the source is transpiled with the
// same TypeScript the app is compiled with and run with a `require` that resolves relative paths against the real files: .ts files are
// transpiled, .json files are parsed. Nothing else is resolved: a file that wants a package or React fails here, which is the point.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

export function run(file: string): Record<string, any> {
  const cache = new Map<string, Record<string, any>>();
  const load = (path: string): Record<string, any> => {
    if (path.endsWith('.json')) return JSON.parse(readFileSync(path, 'utf8'));
    const source = existsSync(path) ? path : `${path}.ts`;
    const hit = cache.get(source);
    if (hit) return hit;
    const out = ts.transpileModule(readFileSync(source, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} as Record<string, any> };
    cache.set(source, module.exports);
    new Function('require', 'module', 'exports', out)((spec: string) => load(resolve(dirname(source), spec)), module, module.exports);
    return module.exports;
  };
  return load(file);
}
