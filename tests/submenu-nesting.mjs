// Regression test: a NESTED submenu must keep its own fill.
// Before the fix, the "clear all descendants" rule painted the submenu
// (a [role=menu] DESCENDANT of the parent menu) fully transparent, so it
// opened but was invisible.
//
// This test drives the real generated CSS from lib/themes.mjs through a
// minimal CSS cascade simulator: we assert the *selector list* no longer
// matches a nested menu root, and still matches ordinary descendants.
import { buildThemeCss } from 'file:///G:/VSCode-idea/plugins/zcode-theme-studio/lib/themes.mjs';

const css = buildThemeCss({
  material: 'frosted',
  surfaceOpacity: 75,
  sidebarOpacity: 75,
  bubbleOpacity: 75,
  tintMode: 'clear',
  theme: { preset: 'forest', overrides: {} },
  overrides: {},
  glass: { enabled: true, style: 'liquid' },
}, [{ id: 'x', type: 'video' }]);

// Extract the descendant-clearing declarations (the rule that broke submenus).
const clearRule = css
  .split('\n')
  .join(' ')
  .match(/\[role='menu'\] \*:not\(\[role='separator'\]\)[^{]*\{[^}]*\}/);
if (!clearRule) { console.log('FAIL: could not locate the descendant-clearing rule'); process.exit(1); }

const rule = clearRule[0];
console.log('descendant rule found, length', rule.length);

// --- assertions on the selector text ---
const checks = [
  ["excludes nested [role='menu']", /:not\(\[role='menu'\]\)/.test(rule)],
  ["excludes nested [role='listbox']", /:not\(\[role='listbox'\]\)/.test(rule)],
  ["excludes nested [role='dialog']", /:not\(\[role='dialog'\]\)/.test(rule)],
  ["every comma part repeats the exclusions",
    rule.split('{')[0].split(',').filter(s => s.trim()).every(s => /:not\(\[role='menu'\]\)/.test(s))],
  ["still exempts [role='separator']", /:not\(\[role='separator'\]\)/.test(rule)],
];

// --- cascade simulation: does the rule match these nodes? ---
// A node shape: { name, attrs:{}, ancestors:[names...] }
function matches(sel, node) {
  // We only need the descendant part: "<root> *:not(...)". Implement a tiny
  // subset: split on commas, for each part check ancestor-with-root + chain.
  return sel.split(',').map(s => s.trim()).filter(Boolean).some(part => {
    const m = part.match(/^(\[[^\]]+\]) \*(.+)$/);
    if (!m) return false;
    const [, rootSel, rest] = m;
    const rootAttr = rootSel.match(/^\[role='([^']+)'\]$/);
    if (!rootAttr) return false;
    const wantRole = rootAttr[1];
    if (!node.ancestors.some(a => a.role === wantRole)) return false;
    const excepts = [...rest.matchAll(/:not\(\[role='([^']+)'\]\)/g)].map(x => x[1]);
    if (excepts.includes(node.role)) return false;
    return true;
  });
}

const nodes = [
  { name: '普通菜单行 menuitem', role: 'menuitem', ancestors: [{ role: 'menu' }], expectMatched: true },
  { name: '分隔线 separator', role: 'separator', ancestors: [{ role: 'menu' }], expectMatched: false },
  { name: '二级菜单容器 submenu', role: 'menu', ancestors: [{ role: 'menu' }], expectMatched: false },
  { name: '二级菜单里的行', role: 'menuitem', ancestors: [{ role: 'menu' }, { role: 'menu' }], expectMatched: true },
  { name: '三层嵌套容器', role: 'menu', ancestors: [{ role: 'menu' }, { role: 'menu' }], expectMatched: false },
];

let pass = true;
for (const [label, ok] of checks) { console.log((ok ? 'OK  ' : 'FAIL'), label); pass = pass && ok; }

console.log('');
for (const n of nodes) {
  const got = matches(clearRule[0].split('{')[0], n);
  const ok = got === n.expectMatched;
  console.log((ok ? 'OK  ' : 'FAIL'), n.name.padEnd(22), 'cleared=' + got, 'expected=' + n.expectMatched);
  pass = pass && ok;
}

console.log('');
console.log(pass ? 'PASS: nested submenus keep their fill; separators still exempt' : 'FAIL: submenu exclusion wrong');
process.exit(pass ? 0 : 1);
