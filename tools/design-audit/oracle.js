// oracle.js: an independent count of the same things scan.py counts, taken from the TypeScript compiler's own AST.
// It is a VALIDATION tool (it needs the `typescript` package, which mobile/node_modules has); scan.py itself is standard-library Python.
// usage: node tools/design-audit/oracle.js <mobile folder> > oracle.json
// tools/tests/test_design_audit.py runs it and compares the two, per file, when node and typescript are there.
const fs = require('fs');
const path = require('path');
let ts;
for (const p of [process.env.TYPESCRIPT_PATH, path.join(__dirname, '..', '..', 'mobile', 'node_modules', 'typescript'), 'typescript']) {
  if (!p) continue;
  try { ts = require(p); break; } catch (e) { /* next */ }
}
if (!ts) { console.error('typescript not found (run npm ci in mobile/, or set TYPESCRIPT_PATH)'); process.exit(1); }
const root = path.resolve(process.argv[2]);
// the same files as scan.py: EXCLUDE_DIRS, EXCLUDE_PREFIXES and EXCLUDE_FILES there
const EXCLUDE_DIRS = new Set(['node_modules', '__tests__', '.cache']);
const EXCLUDE_PREFIXES = ['src/theme/'];
const EXCLUDE_FILES = new Set(['src/components/fixedColors.ts', 'src/data/mock.ts', 'src/features/library/bookBundle.ts', 'src/features/library/bible/webc.generated.ts']);

function walk(dir, out) {
  for (const name of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (!EXCLUDE_DIRS.has(name)) walk(p, out); }
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) && !/\.d\.ts$/.test(name) && !/\.generated\.ts$/.test(name)) {
      const rel = path.relative(root, p).split(path.sep).join('/');
      if (!EXCLUDE_FILES.has(rel) && !EXCLUDE_PREFIXES.some((x) => rel.startsWith(x))) out.push(p);
    }
  }
}
const files = [];
for (const base of ['app', 'src']) { const d = path.join(root, base); if (fs.existsSync(d)) walk(d, files); }

const SPACING = new Set(['padding','paddingTop','paddingBottom','paddingLeft','paddingRight','paddingHorizontal','paddingVertical','paddingStart','paddingEnd','margin','marginTop','marginBottom','marginLeft','marginRight','marginHorizontal','marginVertical','marginStart','marginEnd','gap','rowGap','columnGap']);
const RADIUS = new Set(['borderRadius','borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius','borderTopStartRadius','borderTopEndRadius','borderBottomStartRadius','borderBottomEndRadius']);
const BORDERW = new Set(['borderWidth','borderTopWidth','borderBottomWidth','borderLeftWidth','borderRightWidth','borderStartWidth','borderEndWidth','outlineWidth']);
const HEX_FULL = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const FUNC_COLOR = /\b(rgba?|hsla?)\(\s*[^)]*\)/ig;

const result = {};
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const rel = path.relative(root, f).split(path.sep).join('/');
  const c = { fontSize: 0, lineHeight: 0, letterSpacing: 0, fontFamilyStr: 0, spacingNum: 0, spacingNumNonZero: 0, radiusNum: 0, borderWNum: 0, rawColor: 0, iconSizeNum: 0, appText: 0, text: 0, textInput: 0, pressable: 0, shadowStyleCalls: 0, cDot: 0, roleDot: 0, fixedDot: 0, opacityNum: 0 };
  function numericLeaves(node, out) {
    // numeric literals that are values (not operands of * / %, not element-access indexes); do not descend into object/array/function literals
    if (!node) return;
    if (ts.isNumericLiteral(node)) { out.push(Number(node.text)); return; }
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) { out.push(-Number(node.operand.text)); return; }
    if (ts.isBinaryExpression(node)) {
      const k = node.operatorToken.kind;
      if (k === ts.SyntaxKind.AsteriskToken || k === ts.SyntaxKind.SlashToken || k === ts.SyntaxKind.PercentToken) {
        // scale factor: skip numeric operands but still look at the other side for numbers inside calls
        if (!ts.isNumericLiteral(node.left)) numericLeaves(node.left, out);
        if (!ts.isNumericLiteral(node.right)) numericLeaves(node.right, out);
        return;
      }
    }
    if (ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return;
    if (ts.isElementAccessExpression(node)) { numericLeaves(node.expression, out); return; }
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf);
      if (callee.startsWith('Math.')) { node.arguments.forEach((a) => numericLeaves(a, out)); }
      return;
    }
    ts.forEachChild(node, (ch) => numericLeaves(ch, out));
  }
  function visit(node) {
    if (ts.isPropertyAssignment(node)) {
      const nm = ts.isIdentifier(node.name) ? node.name.text : ts.isStringLiteral(node.name) ? node.name.text : null;
      if (nm) {
        const vals = [];
        if (SPACING.has(nm) || RADIUS.has(nm) || BORDERW.has(nm) || nm === 'fontSize' || nm === 'lineHeight' || nm === 'letterSpacing' || nm === 'opacity') numericLeaves(node.initializer, vals);
        if (nm === 'fontSize') c.fontSize += vals.length;
        else if (nm === 'lineHeight') c.lineHeight += vals.length;
        else if (nm === 'letterSpacing') c.letterSpacing += vals.length;
        else if (nm === 'opacity') c.opacityNum += vals.length;
        else if (SPACING.has(nm)) { c.spacingNum += vals.length; c.spacingNumNonZero += vals.filter((v) => v !== 0).length; }
        else if (RADIUS.has(nm)) c.radiusNum += vals.length;
        else if (BORDERW.has(nm)) c.borderWNum += vals.length;
        else if (nm === 'fontFamily') {
          const strs = [];
          (function s(n) { if (ts.isStringLiteralLike(n)) strs.push(n.text); else if (!ts.isObjectLiteralExpression(n)) ts.forEachChild(n, s); })(node.initializer);
          c.fontFamilyStr += strs.length;
        }
      }
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf);
      if (tag === 'AppText') c.appText++;
      if (tag === 'Text' || tag === 'RNText') c.text++;
      if (tag === 'TextInput') c.textInput++;
      if (/^(Pressable|Touchable\w*)$/.test(tag)) c.pressable++;
      if (/Icon$/.test(tag)) {
        for (const a of node.attributes.properties) {
          if (ts.isJsxAttribute(a) && a.name.text === 'size' && a.initializer && ts.isJsxExpression(a.initializer) && a.initializer.expression) {
            const vals = [];
            numericLeaves(a.initializer.expression, vals);
            c.iconSizeNum += vals.length;
          }
        }
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'shadowStyle') c.shadowStyleCalls++;
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const text = node.text;
      const parent = node.parent;
      const isImport = parent && (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent));
      if (!isImport) {
        const t = text.trim();
        let n = 0;
        if (HEX_FULL.test(t)) n = 1; else { const m = text.match(FUNC_COLOR); if (m) n = m.length; }
        c.rawColor += n;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  // theme uses
  const imp = {};
  sf.statements.forEach((st) => {
    if (ts.isImportDeclaration(st) && st.importClause && st.importClause.namedBindings && ts.isNamedImports(st.importClause.namedBindings)) {
      const mod = st.moduleSpecifier.text;
      if (mod === '@/theme' || /fixedColors$/.test(mod)) st.importClause.namedBindings.elements.forEach((el) => { imp[el.name.text] = (el.propertyName || el.name).text; });
    }
  });
  (function vis2(node) {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && imp[node.expression.text]) {
      const root_ = imp[node.expression.text];
      if (root_ === 'c') c.cDot++;
      else if (root_ === 'role') c.roleDot++;
      else if (root_ === 'fixed' || root_ === 'FIXED') c.fixedDot++;
    }
    ts.forEachChild(node, vis2);
  })(sf);
  result[rel] = c;
}
process.stdout.write(JSON.stringify(result));
