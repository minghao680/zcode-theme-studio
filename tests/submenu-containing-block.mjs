// Proves the mechanism in real Chromium, and that our generated CSS is safe.
//
// Radix renders MenuSubContent INSIDE the parent menu (no portal) and positions
// it with strategy='fixed'. Per CSS spec, an ancestor with backdrop-filter (or
// filter/transform/perspective) becomes the containing block for position:fixed
// descendants. So a blurred parent menu re-anchors its submenu and it lands in
// the wrong place / gets clipped => "the submenu won't open".
//
// Requires Chrome or Edge. Skips (exit 0) when neither is found.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildThemeCss } from 'file:///G:/VSCode-idea/plugins/zcode-theme-studio/lib/themes.mjs';

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const browser = BROWSERS.find(p => existsSync(p));
if (!browser) { console.log('SKIP: no Chromium browser found'); process.exit(0); }

const dir = mkdtempSync(join(tmpdir(), 'zt-cbk-'));
const fixture = join(dir, 'fixture.html');
writeFileSync(fixture, `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body{margin:0;font:14px system-ui;background:#222}
  [role='menu'][data-level='1']{position:absolute;left:40px;top:40px;width:220px;
    background:#333;color:#eee;padding:8px;border-radius:8px;border:1px solid #666}
  .row{height:28px;line-height:28px;padding:0 8px}
  [role='menu'][data-level='2']{position:fixed;left:280px;top:60px;width:200px;
    background:#444;border:1px solid #888;padding:8px}
</style></head><body>
<div role="menu" data-level="1" id="parent">
  <div class="row" role="menuitem">界面语言</div>
  <div role="menu" data-level="2" id="sub">
    <div class="row" role="menuitem">简体中文</div>
    <div class="row" role="menuitem">English</div>
  </div>
</div>
<script>
window.__applyTheme = (css) => {
  let el = document.getElementById('zt-t'); 
  if (!el) { el = document.createElement('style'); el.id='zt-t'; document.head.appendChild(el); }
  el.textContent = css;
};
window.__probe = () => {
  const sub=document.getElementById('sub'), r=sub.getBoundingClientRect();
  const pr=document.getElementById('parent').getBoundingClientRect();
  return { left:Math.round(r.left), top:Math.round(r.top), w:Math.round(r.width), h:Math.round(r.height),
           bg:getComputedStyle(sub).backgroundColor,
           parentRight:Math.round(pr.right), parentBottom:Math.round(pr.bottom),
           insideParent: r.left < pr.right && r.top < pr.bottom };
};
</script></body></html>`, 'utf8');

const port = 9341 + Math.floor(Math.random() * 200);
const profile = mkdtempSync(join(tmpdir(), 'zt-cprof-'));
const chrome = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--window-size=1200,800', 'file:///' + fixture.replace(/\\/g, '/'),
], { stdio: 'ignore', windowsHide: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const p = list.find(t => t.type === 'page' && t.url.includes('fixture'));
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('no CDP target');
}

let ws, seq = 0; const pending = new Map();
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const id = ++seq; ws.send(JSON.stringify({ id, method, params }));
    pending.set(id, m => m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result));
  });
}
async function evalJson(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval error');
  return r.result.value;
}

function cleanup() { try { ws && ws.close(); } catch {} try { chrome.kill(); } catch {} try { rmSync(dir, { recursive: true, force: true }); rmSync(profile, { recursive: true, force: true }); } catch {} }

try {
  const url = await target();
  ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await send('Runtime.enable'); await send('Page.enable');
  await sleep(900);

  // --- baseline: no theme applied ---
  const base = await evalJson('JSON.stringify(window.__probe())').then(JSON.parse);
  console.log('baseline  sub:', base.left + ',' + base.top, ' insideParent=' + base.insideParent);

  // --- apply the REAL generated theme CSS ---
  const css = buildThemeCss({
    material: 'frosted', surfaceOpacity: 75, sidebarOpacity: 75, bubbleOpacity: 75,
    tintMode: 'clear', theme: { preset: 'forest', overrides: {} }, overrides: {},
    glass: { enabled: true, style: 'liquid' },
  }, [{ id: 'x', type: 'video' }]);
  await evalJson('window.__applyTheme(' + JSON.stringify(css) + '), "ok"');
  await sleep(400);

  const themed = await evalJson('JSON.stringify(window.__probe())').then(JSON.parse);
  console.log('themed    sub:', themed.left + ',' + themed.top, ' bg=' + themed.bg, ' insideParent=' + themed.insideParent);

  const anchored = themed.left === base.left && themed.top === base.top;
  const notClipped = !themed.insideParent;
  const filled = themed.bg !== 'rgba(0, 0, 0, 0)' && themed.bg !== 'transparent';

  console.log('');
  console.log((anchored ? 'OK  ' : 'FAIL') + ' submenu keeps its position with the theme applied');
  console.log((notClipped ? 'OK  ' : 'FAIL') + ' submenu is not clipped inside the parent');
  console.log((filled ? 'OK  ' : 'FAIL') + ' submenu still has a background fill');

  console.log('');
  const ok = anchored && notClipped && filled;
  console.log(ok ? 'PASS: theme CSS does not disturb submenu anchoring'
                 : 'FAIL: theme CSS moves or hides the submenu');
  cleanup();
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.log('ERROR: ' + e.message);
  cleanup();
  process.exit(1);
}
