#!/usr/bin/env node
// Detached background worker spawned by hooks/startup.mjs (never blocks session
// start). Does, in order:
//   1. ensure the sidebar-UI endpoint daemon (version-aware)
//   2. ensure the CDP watcher (version-aware: kills stale-version watchers)
//   3. self-heal the asar patch if ZCode updates wiped it (fast mtime path)
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = dirname(here);
const dataDir = process.env.ZCODE_PLUGIN_DATA || join(homedir(), '.zcode', 'zcode-theme-studio');
const VERSION = '1.5.2';
const log = m => { try { appendLog(m); } catch {} };
import { appendFileSync } from 'node:fs';
function appendLog(m) {
  appendFileSync(join(homedir(), '.zcode', 'zcode-theme-studio', 'startup.log'), `[${new Date().toISOString()}] ${m}\n`);
}

const asar = process.env.THEME_STUDIO_ASAR_PATH || join(process.env.ProgramFiles || 'C:\\Program Files', 'ZCode', 'resources', 'app.asar');

// ---- 1. ui-daemon (version-aware) ----
function ensureUiDaemon() {
  const meta = join(dataDir, 'uidaemon.json');
  try {
    const rec = JSON.parse(readFileSync(meta, 'utf8'));
    if (rec.pid && rec.version !== VERSION) {
      try { process.kill(rec.pid); log(`killed stale ui-daemon v${rec.version} pid=${rec.pid}`); } catch {}
    }
  } catch {}
  const child = spawn(process.execPath, [join(pluginRoot, 'ui-daemon.mjs')], { detached: true, stdio: 'ignore' });
  child.unref();
  try { writeFileSync(meta, JSON.stringify({ pid: child.pid, version: VERSION, ts: Date.now() })); } catch {}
}

// ---- 2. watcher (version-aware, via watch.mjs self-lock) ----
function ensureWatcher() {
  const meta = join(dataDir, 'watcher.json');
  try {
    const rec = JSON.parse(readFileSync(meta, 'utf8'));
    if (rec.pid && rec.version !== VERSION) {
      try { process.kill(rec.pid); log(`killed stale watcher v${rec.version} pid=${rec.pid}`); } catch {}
    }
  } catch {}
  const child = spawn(process.execPath, [join(pluginRoot, 'watch.mjs')], { detached: true, stdio: 'ignore' });
  child.unref();
  try { writeFileSync(meta, JSON.stringify({ pid: child.pid, version: VERSION, ts: Date.now() })); } catch {}
}

// ---- 3. self-heal (fast mtime path; heavy work only when actually needed) ----
function selfHeal() {
  const optinPath = join(dataDir, 'asar-patch.optin');
  if (!existsSync(optinPath)) return; // user never opted in
  let optin = null;
  try { optin = JSON.parse(readFileSync(optinPath, 'utf8')); } catch { return; }
  if (!optin || !optin.size) return;

  // fast path: if asar size+mtime are unchanged since the last confirmed check,
  // skip the ~8 MB header parse entirely.
  let st = null;
  try { st = statSync(asar); } catch { return; }
  const metaPath = join(dataDir, 'asar-patch.state.json');
  let state = null;
  try { state = JSON.parse(readFileSync(metaPath, 'utf8')); } catch {}
  if (state && state.size === st.size && state.mtimeMs === st.mtimeMs && state.patched === true) return; // verified recently, unchanged

  // deep check: read the loader marker out of the asar
  let patched = 'unknown';
  try {
    import('../lib/asar.mjs').then(async m => {
      const html = m.readAsarFile(asar, 'out/renderer/index.html').toString('utf8');
      patched = html.includes('zcode-theme-studio patched');
      try { writeFileSync(metaPath, JSON.stringify({ size: st.size, mtimeMs: st.mtimeMs, patched, ts: Date.now() })); } catch {}
      if (patched) { log('asar patch verified'); return; }
      // patch lost (ZCode update) — re-apply in this background worker
      log('patch lost -> re-applying');
      const bridgePath = join(dataDir, 'bridge.js');
      const bridgeUrl = 'file:///' + bridgePath.split('\\').map(encodeURIComponent).join('/');
      await new Promise(res => {
        const c = spawn('powershell.exe', [
          '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(pluginRoot, 'assets', 'asar-patch.ps1'),
          '-Asar', asar, '-PluginRoot', pluginRoot, '-BridgeUrl', bridgeUrl, '-BridgePath', bridgePath,
        ], { timeout: 180000 });
        let out = '';
        c.stdout.on('data', d => { out += d; });
        c.stderr.on('data', d => { out += d; });
        c.on('close', code => res({ code, out }));
        c.on('error', () => res({ code: -1, out: '' }));
      }).then(r => {
        log(`re-patch exit=${r.code} out=${r.out.slice(0, 160)}`);
        if (r.code === 0) {
          try { const st2 = statSync(asar); writeFileSync(metaPath, JSON.stringify({ size: st2.size, mtimeMs: st2.mtimeMs, patched: true, ts: Date.now() })); } catch {}
          try { import('../lib/sync.mjs').then(s => { const cfg = JSON.parse(readFileSync(join(dataDir, 'config.json'), 'utf8')); s.syncBridge(cfg); }); } catch {}
        }
      });
    });
  } catch (e) { log('selfheal error: ' + (e.message || e)); }
}

ensureUiDaemon();
ensureWatcher();
setTimeout(selfHeal, 2000); // let the session settle first
setTimeout(() => process.exit(0), 60000); // worker lifetime cap
setInterval(() => {}, 1 << 30); // stay alive until cap
