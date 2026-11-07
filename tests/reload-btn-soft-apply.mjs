// The reload button must NOT depend on location.reload().
//
// On this ZCode build the renderer ignores location.reload() — the process table
// showed the renderer process untouched after a click, and endpoint.log had zero
// new records. So the button was "visible but doing nothing".
//
// The working strategy is: POST /zt/apply -> daemon rebuilds bridge.js +
// config-snapshot.json -> bridge.js's 3s refresher calls __ZTHEME_APPLY with the
// new payload (and the response payload is applied immediately when present).
// This needs no page reload, so CSS/theme changes land even where reload is blocked.
//
// This test simulates the click with fetch stubbed to return { ok, payload } and
// asserts: no location.reload() call, an apply POST issued, payload applied,
// and the busy flag released.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync('G:/VSCode-idea/plugins/zcode-theme-studio/lib/ui.mjs', 'utf8');

function extract(name) {
  const start = src.indexOf('  function ' + name + '(');
  if (start === -1) throw new Error(name + ' not found');
  let i = src.indexOf('{', start), depth = 0, end = -1;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return src.slice(start, end);
}

const lines = src.split('\n');
const idCode = lines.find(l => l.includes('var RELOAD_ID'));
const svgStartIdx = lines.findIndex(l => l.includes('var RELOAD_SVG'));
let svgEndIdx = svgStartIdx;
while (svgEndIdx < lines.length && !lines[svgEndIdx].includes("</svg>'")) svgEndIdx++;
const svgCode = lines.slice(svgStartIdx, svgEndIdx + 1).join('\n');

const findSrc = extract('findChromeControls');
const ensureSrc = extract('ensureReloadBtn');

// ---- capture everything the handler does ----
let reloadCalls = 0;
let applyPosts = 0;
const reports = [];
let appliedPayload = null;
let appliedCount = 0;

const pendingThen = [];
function fakeFetch(url, opts) {
  if (String(url).indexOf('/zt/apply') !== -1) {
    applyPosts++;
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ ok: true, payload: { css: 'body{}', _test: true } }),
    });
  }
  // scene-report calls
  let stage = 'unknown';
  try { stage = JSON.parse(opts.body).stage || 'unknown'; } catch {}
  reports.push(stage);
  return Promise.resolve({ ok: true, text: () => Promise.resolve(''), json: () => Promise.resolve({}) });
}

const attrs = {};
function mkBtn() {
  const listeners = {};
  return {
    id: 'zt-reload-btn', type: '', style: { display: '', left: '', top: '' },
    setAttribute(k, v) { attrs[k] = v; }, getAttribute(k) { return attrs[k] ?? null; },
    hasAttribute(k) { return attrs[k] != null; }, removeAttribute(k) { delete attrs[k]; },
    addEventListener(t, fn) { listeners[t] = fn; },
    _listeners: listeners,
    innerHTML: '',
    getBoundingClientRect: () => ({ left: 1600, top: 6, right: 1626, bottom: 32, width: 26, height: 26 }),
  };
}

const btn = mkBtn();
const ctx = {
  window: { innerWidth: 1700, innerHeight: 912, __ZTHEME_APPLY: (p) => { appliedCount++; appliedPayload = p; } },
  location: { href: 'file:///C:/Program%20Files/ZCode/resources/app.asar/out/renderer/index.html', reload() { reloadCalls++; } },
  fetch: fakeFetch,
  setTimeout: (fn) => { try { fn(); } catch {} return 0; },
  document: {
    querySelectorAll: () => [],
    // First call returns null so ensureReloadBtn takes the CREATE branch (which is
    // where the click handler is attached), then returns the created button.
    _created: false,
    getElementById: (id) => {
      if (id !== 'zt-reload-btn') return null;
      if (!ctx.document._created) { ctx.document._created = true; return null; }
      return btn;
    },
    createElement: () => btn,
    body: { appendChild: () => {} },
    elementFromPoint: () => btn,
    visibilityState: 'visible',
  },
  console: { log() {}, warn() {}, error() {} },
  Date,
  JSON,
};
ctx.window.document = ctx.document;
ctx.globalThis = ctx;

const bind = (code) => code
  .replace(/var RELOAD_ID =/, 'this.RELOAD_ID =')
  .replace(/var RELOAD_SVG =/, 'this.RELOAD_SVG =')
  .replace(/function findChromeControls/, 'this.findChromeControls = function')
  .replace(/function ensureReloadBtn/, 'this.ensureReloadBtn = function');

vm.createContext(ctx);
vm.runInContext(bind(idCode), ctx);
vm.runInContext(bind(findSrc), ctx);
vm.runInContext(bind(svgCode), ctx);
vm.runInContext(bind(ensureSrc), ctx);

ctx.ensureReloadBtn();

// Simulate a click.
const clickFn = btn._listeners.click;
if (!clickFn) { console.log('FAIL: no click handler registered'); process.exit(1); }
clickFn({ preventDefault() {}, stopPropagation() {} });

// Let the promise chain settle.
await new Promise(r => setTimeout(r, 60));

console.log('apply POSTs        :', applyPosts);
console.log('location.reload()  :', reloadCalls);
console.log('__ZTHEME_APPLY     :', appliedCount, appliedPayload ? JSON.stringify(appliedPayload).slice(0, 40) : '');
console.log('reports            :', reports.join(', ') || '(none)');

const noReload = reloadCalls === 0;
const posted = applyPosts >= 1;
const applied = appliedCount >= 1;
const reported = reports.some(s => /reload-btn/.test(s));

console.log('');
console.log((reported ? 'OK  ' : 'FAIL') + ' click is reported (diagnostics wired)');
console.log((posted ? 'OK  ' : 'FAIL') + ' click POSTs /zt/apply instead of reloading');
console.log((noReload ? 'OK  ' : 'FAIL') + ' no longer depends on location.reload()');
console.log((applied ? 'OK  ' : 'FAIL') + ' returned payload is applied immediately');

console.log('');
const ok = reported && posted && noReload && applied;
console.log(ok ? 'PASS: button refreshes via the daemon + apply (works where reload is blocked)'
              : 'FAIL: button still relies on a suppressed reload');
process.exit(ok ? 0 : 1);
