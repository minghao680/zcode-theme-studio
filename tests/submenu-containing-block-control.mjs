// Negative control for submenu-containing-block.mjs: injects the OLD (buggy)
// rule — backdrop-filter on the menu container — into the same fixture and
// asserts the submenu DOES move/is clipped. If this control ever passes as
// "anchored", the main test has lost its discriminating power.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const browser = BROWSERS.find(p => existsSync(p));
if (!browser) { console.log('SKIP: no Chromium browser found'); process.exit(0); }

const dir = mkdtempSync(join(tmpdir(), 'zt-neg-'));
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
  <div role="menu" data-level="2" id="sub"><div class="row">简体中文</div></div>
</div>
<script>
window.__apply = (css) => { let e=document.getElementById('x');
  if(!e){e=document.createElement('style');e.id='x';document.head.appendChild(e);} e.textContent=css; };
window.__probe = () => { const s=document.getElementById('sub'),r=s.getBoundingClientRect();
  const p=document.getElementById('parent').getBoundingClientRect();
  return {left:Math.round(r.left),top:Math.round(r.top),
    insideParent:r.left<p.right&&r.top<p.bottom}; };
</script></body></html>`, 'utf8');

const port = 9541 + Math.floor(Math.random() * 200);
const profile = mkdtempSync(join(tmpdir(), 'zt-nprof-'));
const chrome = spawn(browser, ['--headless=new','--disable-gpu','--no-first-run',
  '--no-default-browser-check','--hide-scrollbars',`--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,'--window-size=1200,800',
  'file:///' + fixture.replace(/\\/g,'/')], { stdio:'ignore', windowsHide:true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, seq = 0; const pending = new Map();
const send = (m,p={}) => new Promise((res,rej)=>{ const id=++seq; ws.send(JSON.stringify({id,method:m,params:p}));
  pending.set(id, x => x.error ? rej(new Error(JSON.stringify(x.error))) : res(x.result)); });
async function ev(e){ const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description||'eval');
  return r.result.value; }
function cleanup(){ try{ws&&ws.close();}catch{} try{chrome.kill();}catch{}
  try{rmSync(dir,{recursive:true,force:true});rmSync(profile,{recursive:true,force:true});}catch{} }

try {
  let url = null;
  for (let i=0;i<50 && !url;i++){ try{ const l=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const p=l.find(t=>t.type==='page'&&t.url.includes('fixture')); if(p) url=p.webSocketDebuggerUrl; }catch{}
    if(!url) await sleep(250); }
  if(!url) throw new Error('no target');
  ws = new WebSocket(url);
  await new Promise((res,rej)=>{ ws.onopen=res; ws.onerror=()=>rej(new Error('ws')); });
  ws.onmessage = e => { const m=JSON.parse(e.data); if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);} };
  await send('Runtime.enable'); await send('Page.enable'); await sleep(800);

  const base = JSON.parse(await ev('JSON.stringify(window.__probe())'));
  // The OLD rule that shipped before this fix:
  await ev(`window.__apply("[role='menu']{background-color:#333!important;backdrop-filter:blur(20px) saturate(1.25);}"), "ok"`);
  await sleep(400);
  const buggy = JSON.parse(await ev('JSON.stringify(window.__probe())'));

  console.log('baseline :', base.left + ',' + base.top);
  console.log('old rule :', buggy.left + ',' + buggy.top, ' insideParent=' + buggy.insideParent);
  const moved = buggy.left !== base.left || buggy.top !== base.top;
  console.log('');
  console.log((moved ? 'OK  ' : 'FAIL') + ' old rule DOES displace the submenu (control is discriminating)');
  console.log('');
  console.log(moved ? 'PASS: negative control reproduces the bug' : 'FAIL: control did not reproduce — main test proves nothing');
  cleanup();
  process.exit(moved ? 0 : 1);
} catch (e) { console.log('ERROR: ' + e.message); cleanup(); process.exit(1); }
