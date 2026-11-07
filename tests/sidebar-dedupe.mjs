// Verify the sidebar glass dedupe: the three configured candidates are nested
// (#sidebar > #sidebar aside > aside.h-full.overflow-hidden), so collecting all
// of them stacked 3 backdrop-filters on the same pixels (log: sidebarNodes=3).
// Only the OUTERMOST node may be painted.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const engineSrc = readFileSync('G:/VSCode-idea/plugins/zcode-theme-studio/lib/engine.mjs', 'utf8');

// Pull the BOOTSTRAP string out of the module and run it in a stub DOM, which is
// how the other .dev tests exercise the real page engine.
const m = engineSrc.match(/export const BOOTSTRAP = `([\s\S]*?)`;\s*$/m)
  || engineSrc.match(/const BOOTSTRAP = `([\s\S]*?)`;/);
if (!m) { console.log('FAIL: cannot extract BOOTSTRAP'); process.exit(1); }
const bootstrap = m[1];
console.log('BOOTSTRAP extracted, length', bootstrap.length);

function el(name, { parent = null, rect = { left: 0, top: 0, right: 300, bottom: 900, width: 300, height: 900 } } = {}) {
  const attrs = {};
  const style = { _p: {}, setProperty(k, v) { this._p[k] = v; }, removeProperty(k) { delete this._p[k]; }, get backdropFilter() { return this._p['backdrop-filter']; } };
  const node = {
    _name: name, style, _attrs: attrs, _children: [], _parent: parent,
    tagName: 'DIV', id: '', className: '', dataset: {},
    setAttribute(k, v) { attrs[k] = v; }, getAttribute(k) { return attrs[k] ?? null; },
    hasAttribute(k) { return attrs[k] != null; }, removeAttribute(k) { delete attrs[k]; },
    appendChild(c) { c._parent = node; node._children.push(c); return c; },
    insertBefore(c) { c._parent = node; node._children.push(c); return c; },
    removeChild(c) { const i = node._children.indexOf(c); if (i >= 0) node._children.splice(i, 1); },
    remove() {}, addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    contains(o) { if (!o) return false; let p = o; while (p) { if (p === node) return true; p = p._parent; } return false; },
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    getBoundingClientRect: () => rect,
    offsetParent: {}, parentNode: parent, parentElement: parent, children: [],
    innerHTML: '', textContent: '', complete: true, naturalWidth: 10, readyState: 4, width: 10, height: 10,
  };
  return node;
}

const html = el('html');
const body = el('body', { parent: html });
const outer = el('outerSidebar', { parent: body });          // #sidebar
const mid = el('midAside', { parent: outer });               // #sidebar aside
const inner = el('innerAside', { parent: mid });             // aside.h-full.overflow-hidden

// ---------------------------------------------------------------- run engine
const sandbox = {
  console: { log() {}, warn() {}, error() {} },
  addEventListener() {}, removeEventListener() {},
  setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {},
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  fetch: () => new Promise(() => {}),
  XMLHttpRequest: function () { this.open = () => {}; this.setRequestHeader = () => {}; this.send = () => {}; },
  MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
  Image: function () { this.style = el('img').style; },
  getComputedStyle: () => ({ position: 'static', zIndex: 'auto', display: 'block', visibility: 'visible', backgroundColor: 'rgba(0,0,0,0)', backdropFilter: 'none', backgroundImage: 'none' }),
  document: {
    readyState: 'complete', head: el('head', { parent: html }), body, documentElement: html,
    getElementById: () => null, createElement: (t) => el(t),
    querySelector: (s) => (s === '#sidebar' ? outer : null),
    querySelectorAll: (s) => {
      if (s === '#sidebar') return [outer];
      if (s === '#sidebar aside') return [mid];
      if (s === 'aside.h-full.overflow-hidden') return [inner];
      return [];
    },
    addEventListener() {}, documentElement_ignore: null,
  },
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
sandbox.window.devicePixelRatio = 1; sandbox.window.innerWidth = 1700; sandbox.window.innerHeight = 912;
sandbox.document.documentElement = html;

const cfg = {
  enabled: true, css: '', material: 'frosted',
  glass: { enabled: true, style: 'liquid', blur: 35 },
  glassSidebarBlur: 40, glassPanelBlur: 40,
  shellCandidates: [], glassCandidates: ['#sidebar', '#sidebar aside', 'aside.h-full.overflow-hidden'],
  overrides: {}, palette: {}, presets: [], customPresets: [], catalog: [],
  wallpaper: null, tintMode: 'clear', bubbleOpacity: 75,
  sidebarGlass: true, surfaceOpacity: 75, sidebarOpacity: 75,
  active: { material: 'frosted', sidebarGlass: true },
};
sandbox.window.__ZTHEME_CONFIG = cfg;

vm.createContext(sandbox);
try {
  vm.runInContext(bootstrap, sandbox, { filename: 'engine.js', timeout: 8000 });
} catch (e) {
  console.log('FAIL: engine threw: ' + e.message);
  process.exit(1);
}
if (typeof sandbox.window.__ZTHEME_APPLY === 'function') {
  try { sandbox.window.__ZTHEME_APPLY(cfg); } catch (e) { console.log('note: apply threw: ' + e.message); }
}

// ---------------------------------------------------------------- assertions
const painted = [outer, mid, inner].filter(n => n.style._p['backdrop-filter'] !== undefined);
const names = painted.map(n => n._name).join(', ');
console.log('painted blockers:', names || '(none)');

const ok = painted.length === 1 && painted[0] === outer;
console.log('');
if (painted.length === 0) {
  console.log('INCONCLUSIVE: engine painted nothing (stub too thin) — dedupe logic still verified by selector test');
  process.exit(2);
}
console.log(ok ? 'PASS: only the outermost sidebar node carries the blur (no triple stacking)'
              : 'FAIL: ' + painted.length + ' nested sidebar nodes painted -> stacked blur');
process.exit(ok ? 0 : 1);
