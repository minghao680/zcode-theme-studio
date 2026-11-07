// Regression test for the stray glass slab on the right.
//
// Real data from endpoint.log (2026-11-07T04:18:36Z), the elements the engine
// tagged as "glass panels":
//   div.flex w-full max-w-2xl shrink-0 items-cen [672x68]   <- composer bar  (keep)
//   div.w-full [672x68]                                      <- its wrapper   (keep)
//   div.pointer-events-none absolute left-1/2 to [400x320]   <- STRAY (must drop)
//   img.h-full w-full hidden dark:block [400x320]            <- STRAY (must drop)
//
// The 400x320 pair is a centred image overlay (left-1/2, pointer-events-none).
// It passed the old "left >= vw*0.3" test and got painted as a blurred slab.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const engineSrc = readFileSync('G:/VSCode-idea/plugins/zcode-theme-studio/lib/engine.mjs', 'utf8');
const m = engineSrc.match(/export const BOOTSTRAP = `([\s\S]*?)`;\s*$/m);
if (!m) { console.log('FAIL: cannot extract BOOTSTRAP'); process.exit(1); }

const VW = 1700, VH = 912;

// --- minimal DOM that lets applyShell/panel discovery run ---
const mkRect = (l, t, w, h) => ({ left: l, top: t, right: l + w, bottom: t + h, width: w, height: h });

function mkEl(name, rect, extra = {}) {
  const attrs = {};
  const el = {
    _name: name, tagName: extra.tagName || 'DIV', id: '', className: extra.className || '', dataset: {},
    style: { _p: {}, setProperty(k, v) { this._p[k] = v; }, removeProperty(k) { delete this._p[k]; } },
    _attrs: attrs, children: [], _hasMediaChild: !!extra.hasMediaChild,
    setAttribute(k, v) { attrs[k] = v; }, getAttribute(k) { return attrs[k] ?? null; },
    hasAttribute(k) { return attrs[k] != null; }, removeAttribute(k) { delete attrs[k]; },
    appendChild(c) { el.children.push(c); return c; }, insertBefore(c) { el.children.push(c); return c; },
    removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); },
    remove() {}, addEventListener() {}, removeEventListener() {},
    querySelector: (sel) => (el._hasMediaChild && /img|video|canvas|picture/.test(sel) ? mkEl('img', rect, { tagName: 'IMG' }) : null),
    querySelectorAll: () => [], contains: () => false, closest: () => null,
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    getBoundingClientRect: () => rect,
    parentNode: null, parentElement: null, offsetParent: {},
    innerHTML: '', textContent: '', complete: true, naturalWidth: 400, readyState: 4, width: 400, height: 320,
  };
  return el;
}

// Composer bar (right-aligned, wide & short) and its wrapper.
const composer = mkEl('composer', mkRect(930, 800, 672, 68), { className: 'flex w-full max-w-2xl shrink-0' });
const composerWrap = mkEl('composerWrap', mkRect(930, 800, 672, 68), { className: 'w-full' });
// The stray centred image overlay pair:
//   - the wrapper is pointer-events-none and holds an <img>
//   - the <img> itself is an IMG element
const overlay = mkEl('overlay', mkRect(650, 60, 400, 320), { className: 'pointer-events-none absolute left-1/2', hasMediaChild: true });
const overlayImg = mkEl('overlayImg', mkRect(650, 60, 400, 320), { className: 'h-full w-full hidden dark:block', tagName: 'IMG' });

const sidebar = mkEl('sidebar', mkRect(0, 0, 264, 900), { className: 'sidebar' });
const body = mkEl('body', mkRect(0, 0, VW, VH));
const all = [sidebar, composer, composerWrap, overlay, overlayImg];

const sandbox = {
  console: { log() {}, warn() {}, error() {} },
  addEventListener() {}, removeEventListener() {},
  setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {},
  requestAnimationFrame: () => 0,
  fetch: () => new Promise(() => {}),
  XMLHttpRequest: function () { this.open = () => {}; this.setRequestHeader = () => {}; this.send = () => {}; },
  MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
  Image: function () { this.style = mkEl('i', mkRect(0,0,0,0)).style; },
  getComputedStyle: (el) => ({
    position: el === overlay || el === overlayImg ? 'absolute' : 'static',
    zIndex: el === overlay || el === overlayImg ? '20' : 'auto',
    display: 'block', visibility: 'visible',
    // Real value: the overlay wrapper is pointer-events-none.
    pointerEvents: el === overlay ? 'none' : 'auto',
    backgroundColor: 'rgba(0,0,0,0)',
    backdropFilter: 'none', backgroundImage: 'none',
  }),
  document: {
    readyState: 'complete', body, documentElement: mkEl('html', mkRect(0,0,VW,VH)), head: mkEl('head', mkRect(0,0,0,0)),
    getElementById: () => null, createElement: (t) => mkEl(t, mkRect(0,0,0,0)),
    querySelector: () => null,
    querySelectorAll: (sel) => {
      if (sel === 'body *') return all;
      if (sel === '#sidebar') return [sidebar];
      if (sel === '[data-zt-panel]') return all.filter(e => e.hasAttribute('data-zt-panel'));
      if (sel === '[data-zt-glass]') return all.filter(e => e.hasAttribute('data-zt-glass'));
      return [];
    },
    addEventListener() {},
  },
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
sandbox.window.devicePixelRatio = 1; sandbox.window.innerWidth = VW; sandbox.window.innerHeight = VH;

const cfg = {
  enabled: true, css: ':root{}', material: 'frosted',
  glass: { enabled: true, style: 'liquid', blur: 35 },
  glassSidebarBlur: 40, glassPanelBlur: 40,
  shellCandidates: [], glassCandidates: ['#sidebar'],
  overrides: {}, palette: {}, presets: [], customPresets: [], catalog: [],
  wallpaper: null, tintMode: 'clear', bubbleOpacity: 75,
  sidebarGlass: true, surfaceOpacity: 75, sidebarOpacity: 75,
  active: { material: 'frosted', sidebarGlass: true },
};
sandbox.window.__ZTHEME_CONFIG = cfg;

vm.createContext(sandbox);
try { vm.runInContext(m[1], sandbox, { filename: 'engine.js', timeout: 8000 }); }
catch (e) { console.log('FAIL: bootstrap threw: ' + e.message); process.exit(1); }

// Run the panel discovery by invoking a fresh apply.
if (typeof sandbox.window.__ZTHEME_APPLY === 'function') {
  try { sandbox.window.__ZTHEME_APPLY(cfg); } catch (e) { /* engine swallows */ }
}

const painted = all.filter(e => e.style._p['backdrop-filter'] !== undefined);
console.log('painted:', painted.map(e => e._name + '[' + e.getBoundingClientRect().width + 'x' + e.getBoundingClientRect().height + ']').join(', ') || '(none)');

const strayPainted = painted.some(e => e === overlay || e === overlayImg);
const composerPainted = painted.some(e => e === composer || e === composerWrap);
const sidebarPainted = painted.some(e => e === sidebar);

console.log('');
console.log((!strayPainted ? 'OK  ' : 'FAIL') + ' centred 400x320 overlay is NOT painted (no stray slab)');
console.log((composerPainted ? 'OK  ' : 'FAIL') + ' composer bar IS still painted');

const ok = !strayPainted && composerPainted;
console.log('');
console.log(ok ? 'PASS: only real glass bars are painted; centred overlays are rejected'
              : 'FAIL: stray overlay still painted or composer lost');
process.exit(ok ? 0 : 1);
