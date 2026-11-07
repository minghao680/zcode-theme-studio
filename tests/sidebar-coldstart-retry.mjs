// Verify the sidebar cold-start retry: when the glass selectors miss on the
// first apply (sidebar still mounting), the engine must retry with backoff and
// re-run apply once the sidebar appears — instead of staying dead forever.
//
// Drives the real BOOTSTRAP in a stub DOM with a controllable clock.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync('file:///G:/VSCode-idea/plugins/zcode-theme-studio/lib/engine.mjs'.replace('file:///', ''), 'utf8');
const m = src.match(/export const BOOTSTRAP = `([\s\S]*?)`;\s*$/m) || src.match(/const BOOTSTRAP = `([\s\S]*?)`;/);
if (!m) { console.log('FAIL: cannot extract BOOTSTRAP'); process.exit(1); }
const bootstrap = m[1];

// ---- controllable timers ----
const timers = [];
let now = 0;
const setTimeoutStub = (fn, d) => { timers.push({ at: now + (d || 0), fn }); return timers.length; };
const runTimers = () => {
  let guard = 0;
  while (timers.length && guard++ < 500) {
    timers.sort((a, b) => a.at - b.at);
    const t = timers.shift();
    now = t.at;
    try { t.fn(); } catch (e) { /* engine swallows its own errors */ }
  }
};

// ---- DOM stub: sidebar absent at first, appears later ----
let sidebarMounted = false;
const css = new Map();

function mkEl(tag, opts = {}) {
  const attrs = {};
  const el = {
    tagName: (tag || 'div').toUpperCase(), id: opts.id || '', className: opts.className || '',
    style: { _p: {}, setProperty(k, v) { this._p[k] = v; }, removeProperty(k) { delete this._p[k]; } },
    dataset: {}, _attrs: attrs, children: [],
    setAttribute(k, v) { attrs[k] = v; }, getAttribute(k) { return attrs[k] ?? null; },
    hasAttribute(k) { return attrs[k] != null; }, removeAttribute(k) { delete attrs[k]; },
    appendChild(c) { el.children.push(c); return c; }, insertBefore(c) { el.children.push(c); return c; },
    removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); },
    remove() {}, addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [], contains: () => false,
    closest: () => null,
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    getBoundingClientRect: () => opts.rect || { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 },
    parentNode: null, parentElement: null, offsetParent: {},
    innerHTML: '', textContent: '', complete: true, naturalWidth: 10, readyState: 4,
    width: 0, height: 0,
  };
  return el;
}

const head = mkEl('head'), body = mkEl('body'), html = mkEl('html');
const sidebar = mkEl('aside', { id: 'sidebarEl', className: 'sidebar', rect: { left: 0, top: 0, right: 264, bottom: 912, width: 264, height: 912 } });

// The real page has a persistent <style id="zt-style"> after the first apply;
// the retry chain uses its presence as "the engine is still installed". Model it
// properly, otherwise the chain cancels itself and the test proves nothing.
const styleEl = mkEl('style');
styleEl.id = 'zt-style';

let styleInjected = false;
const sandbox = {
  console: { log() {}, warn() {}, error() {} },
  addEventListener() {}, removeEventListener() {},
  setInterval: () => 0, clearInterval: () => {}, clearTimeout: () => {},
  setTimeout: setTimeoutStub, requestAnimationFrame: () => 0,
  fetch: () => new Promise(() => {}),
  XMLHttpRequest: function () { this.open = () => {}; this.setRequestHeader = () => {}; this.send = () => {}; },
  MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
  Image: function () { this.style = mkEl('img').style; },
  getComputedStyle: () => ({ position: 'static', zIndex: 'auto', display: 'block', visibility: 'visible',
    backgroundColor: 'rgba(0,0,0,0)', backdropFilter: 'none', backgroundImage: 'none' }),
  document: {
    readyState: 'complete', head, body, documentElement: html,
    getElementById: (id) => {
      if (id === 'zt-style') return styleInjected ? styleEl : null;
      if (id === 'sidebarEl') return sidebarMounted ? sidebar : null;
      return null;
    },
    createElement: (t) => { const e = mkEl(t); if (t === 'style') styleInjected = true; return e; },
    querySelector: () => null,
    querySelectorAll: (sel) => {
      if (sel === 'body *') return sidebarMounted ? [sidebar] : [];
      if (sel === '#sidebar aside') return [];
      if (sel === '#sidebar') return sidebarMounted ? [sidebar] : [];
      if (sel === 'aside.h-full.overflow-hidden') return [];
      return [];
    },
    addEventListener() {},
  },
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
sandbox.window.devicePixelRatio = 1; sandbox.window.innerWidth = 1700; sandbox.window.innerHeight = 912;

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
try { vm.runInContext(bootstrap, sandbox, { filename: 'engine.js', timeout: 8000 }); }
catch (e) { console.log('FAIL: bootstrap threw: ' + e.message); process.exit(1); }

// ---- exercise ----
console.log('timer count after load:', timers.length);

// The sidebar is NOT mounted yet -> the retry chain should have been scheduled.
const before = timers.length;
console.log('retry scheduled while sidebar absent:', before > 0);

// Mount the sidebar mid-chain, then let timers run.
sidebarMounted = true;
runTimers();

// After the chain re-runs apply, glass tagging should have happened.
const bf = sidebar.style._p['backdrop-filter'];
const marked = sidebar._attrs['data-zt-glass'];
console.log('sidebar backdrop-filter:', bf === undefined ? '(none)' : bf);
console.log('sidebar data-zt-glass:', marked === undefined ? '(none)' : marked);

// Did apply actually run again? Probe the retry flag being cleared.
const flagCleared = sandbox.window.__ZT_SB_RETRY === '' || sandbox.window.__ZT_SB_RETRY === undefined;
console.log('retry flag released:', flagCleared);

const pass = before > 0 && bf !== undefined && flagCleared;
console.log('');
console.log(pass ? 'PASS: miss triggers a bounded retry chain and the sidebar gets tagged once it mounts'
                 : 'FAIL: cold-start retry did not recover the sidebar');
process.exit(pass ? 0 : 1);
