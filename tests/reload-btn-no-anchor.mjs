// The REAL- WORLD case for this ZCode build: the window controls are drawn by the
// OS/native layer, so the DOM scan finds NOTHING — not even once. The old code
// responded to that by setting display:none, which made the reload button
// permanently unreachable. The user's report was "clicked reload, nothing happened"
// and a screenshot confirmed the button was simply not painted.
//
// This test asserts the button stays VISIBLE and clickable with zero anchors.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Optional argv[2]: inspect a different ui.mjs (used to prove the test catches
// the old behaviour — the pre-fix file hid the button when no anchor was found).
const src = readFileSync(process.argv[2] || 'G:/VSCode-idea/plugins/zcode-theme-studio/lib/ui.mjs', 'utf8');

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

const findSrc = extract('findChromeControls');
const ensureSrc = extract('ensureReloadBtn');
// Pull declarations by line: RELOAD_ID is one line; RELOAD_SVG spans several
// concatenated string lines and ends at the first line closed with `;</svg>';`.
const lines = src.split('\n');
const idLine = lines.find(l => l.includes('var RELOAD_ID'));
const idCode = idLine + '\n';
const svgStartIdx = lines.findIndex(l => l.includes('var RELOAD_SVG'));
let svgEndIdx = svgStartIdx;
while (svgEndIdx < lines.length && !lines[svgEndIdx].includes("</svg>'")) svgEndIdx++;
const svgCode = lines.slice(svgStartIdx, svgEndIdx + 1).join('\n');

let reloadCalls = 0;
const mkStyle = () => ({ _p: {}, setProperty(k, v) { this._p[k] = v; }, removeProperty(k) { delete this._p[k]; } });
function mkEl(id) {
  const attrs = {};
  return {
    id, style: mkStyle(), _attrs: attrs, listeners: {},
    setAttribute(k, v) { attrs[k] = v; }, getAttribute(k) { return attrs[k] ?? null; },
    hasAttribute(k) { return attrs[k] != null; }, removeAttribute(k) { delete attrs[k]; },
    addEventListener(t, fn) { this.listeners[t] = fn; },
    appendChild() {}, removeChild() {}, remove() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    closest: () => null, querySelectorAll: () => [],
    innerHTML: '', type: '',
  };
}

const ctx = {
  window: { innerWidth: 1700, innerHeight: 912 },
  location: { reload() { reloadCalls++; } },
  setTimeout: (fn) => { try { fn(); } catch {} return 0; },
  document: {
    _btn: null,
    // NO button candidates at all — the native-controls case.
    querySelectorAll: () => [],
    getElementById: (id) => (id === 'zt-reload-btn' ? ctx.document._btn : null),
    createElement: () => { ctx.document._btn = mkEl('zt-reload-btn'); return ctx.document._btn; },
    body: { appendChild: () => {} },
  },
};
ctx.window.document = ctx.document;
ctx.globalThis = ctx;
vm.createContext(ctx);
// In a vm context, top-level `var` does not become a property of the sandbox
// object, so rewrite the declarations onto the sandbox explicitly.
const bind = (code) => code
  .replace(/var RELOAD_ID =/, 'this.RELOAD_ID =')
  .replace(/var RELOAD_SVG =/, 'this.RELOAD_SVG =')
  .replace(/function findChromeControls/, 'this.findChromeControls = function')
  .replace(/function ensureReloadBtn/, 'this.ensureReloadBtn = function');
vm.runInContext(bind(idCode), ctx);
vm.runInContext(bind(findSrc), ctx);
vm.runInContext(bind(svgCode), ctx);
vm.runInContext(bind(ensureSrc), ctx);

// Position it exactly as the engine does.
ctx.ensureReloadBtn();
const btn = ctx.document._btn;

console.log('button created :', !!btn);
console.log('display        :', btn.style.display);
console.log('left / top     :', btn.style.left + ' / ' + btn.style.top);

const visible = btn.style.display === 'flex';
const hasPosition = typeof btn.style.left === 'string' && /px$/.test(btn.style.left)
                 && typeof btn.style.top === 'string';
const inViewport = parseInt(btn.style.left, 10) > 0 && parseInt(btn.style.left, 10) < 1700;

console.log('');
console.log((visible ? 'OK  ' : 'FAIL') + ' button is visible even with zero anchors');
console.log((hasPosition ? 'OK  ' : 'FAIL') + ' button got a concrete position');
console.log((inViewport ? 'OK  ' : 'FAIL') + ' position is inside the viewport');

// And it must actually reload when clicked.
btn.listeners.click({ preventDefault() {}, stopPropagation() {} });
console.log('reload called  :', reloadCalls);
const clickOk = reloadCalls === 1;
console.log((clickOk ? 'OK  ' : 'FAIL') + ' click still triggers location.reload()');

console.log('');
const ok = visible && hasPosition && inViewport && clickOk;
console.log(ok ? 'PASS: reload button remains reachable when window controls are native'
              : 'FAIL: reload button unreachable without an anchor');
process.exit(ok ? 0 : 1);
