#!/usr/bin/env node
// zcode-theme-studio resident watcher.
// Keeps a persistent CDP session per ZCode renderer target so that
// Page.addScriptToEvaluateOnNewDocument registrations survive reloads and the
// app's self-navigations (CDP script registrations are session-scoped: they die
// with the DevTools websocket connection, which is why a one-shot injector is
// not enough). Also hot-applies config file changes and rotates wallpaper
// playlists (rotation state is in-memory; the config file keeps the base list).
//
// Usage:
//   node watch.mjs            # run in foreground (dev)
//   node watch.mjs --hook     # spawn a detached watcher if none is running, then exit
import { readFileSync, watchFile, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { connectToTarget } from './lib/cdp.mjs';
import { BOOTSTRAP, buildPayload, toFileUrl } from './lib/engine.mjs';
import { scanWallpapers, findById } from './lib/scanner.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function resolveConfigPath() {
  if (process.env.ZCODE_PLUGIN_DATA) return join(process.env.ZCODE_PLUGIN_DATA, 'config.json');
  return join(homedir(), '.zcode', 'zcode-theme-studio.config.json');
}

function loadConfig() {
  const p = resolveConfigPath();
  try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return null; }
}

const LOG = join(homedir(), '.zcode', 'zcode-theme-studio.watcher.log');
function log(msg) {
  try { appendFileSync(LOG, `[${new Date().toISOString()}] ${msg}\n`); } catch {}
}

// ---------- wallpaper scan cache (for rotation) ----------
let scanCache = null;
let scanCacheAt = 0;
function scanCached(maxAgeMs = 5 * 60 * 1000) {
  if (!scanCache || Date.now() - scanCacheAt > maxAgeMs) {
    try {
      scanCache = scanWallpapers({
        steamRoots: process.env.THEME_STEAM_ROOTS ? process.env.THEME_STEAM_ROOTS.split(';') : undefined,
        workshopDir: process.env.THEME_STUDIO_WORKSHOP_DIR || undefined,
        projectsDir: process.env.THEME_STUDIO_PROJECTS_DIR || undefined,
      });
      scanCacheAt = Date.now();
    } catch { scanCache = scanCache || []; }
  }
  return scanCache;
}

function resolveWallpaper(id, base) {
  const hit = findById(scanCached(), id);
  if (!hit) return base;
  if (!hit.playable) return base; // rotation only plays real media
  return { ...base, id: hit.id, type: hit.type, mediaUrl: toFileUrl(hit.mediaPath) };
}

// ---------- rotation state (in-memory) ----------
let rotState = null; // { idx, lastAt }

const TICK_MS = 3000;
const conns = new Map(); // targetId -> { conn }
let lastSrc = '';

function tick() {
  return (async () => {
    let cfg = loadConfig();
    if (!cfg || cfg.enabled === false) {
      if (conns.size) {
        // graceful teardown in the page, then drop sessions
        for (const { conn } of conns.values()) {
          try { await conn.evaluate('window.__ZTHEME_TEARDOWN && window.__ZTHEME_TEARDOWN();'); } catch {}
          try { conn.close(); } catch {}
        }
        conns.clear();
        log('teardown done (disabled or config missing)');
      }
      return;
    }
    const port = Number(cfg.debugPort || 9333);

    // playlist rotation (in-memory only; config file keeps the base entry)
    const rot = cfg.rotation;
    let rotated = false;
    if (rot && rot.enabled && Array.isArray(rot.ids) && rot.ids.length > 1) {
      const intervalSec = Math.max(30, Number(rot.intervalSec) || 600);
      if (!rotState) rotState = { idx: Math.max(0, rot.ids.indexOf(cfg.wallpaper?.id)), lastAt: Date.now() };
      if (Date.now() - rotState.lastAt >= intervalSec * 1000) {
        rotState.lastAt = Date.now();
        // advance until a playable wallpaper is found (skip scene/preview-only entries)
        for (let tries = 0; tries < rot.ids.length; tries++) {
          rotState.idx = (rotState.idx + 1) % rot.ids.length;
          const next = resolveWallpaper(rot.ids[rotState.idx], cfg.wallpaper || {});
          if (next.mediaUrl && next.id !== cfg.wallpaper?.id) {
            cfg = { ...cfg, wallpaper: { ...cfg.wallpaper, ...next } };
            rotated = true;
            log(`rotation -> ${next.id}`);
            break;
          }
        }
      }
    } else if (rotState) {
      rotState = null; // rotation disabled: reset
    }

    const payload = buildPayload(cfg);
    const src = 'window.__ZTHEME_CONFIG = ' + JSON.stringify(payload) + ';\n' + BOOTSTRAP;
    const changed = src !== lastSrc;
    if (changed) lastSrc = src;

    let targets = [];
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) });
      targets = (await res.json()).filter(t => t.type === 'page' && t.url.includes('index.html') && !/devtools/.test(t.url));
    } catch {
      // ZCode closed or port not open: drop sessions, retry next tick
      for (const { conn } of conns.values()) try { conn.close(); } catch {}
      conns.clear();
      return;
    }

    const live = new Set(targets.map(t => t.id));
    for (const [id, entry] of [...conns]) {
      if (!live.has(id) || entry.conn.__closed) {
        try { entry.conn.close(); } catch {}
        conns.delete(id);
      } else if (changed || rotated) {
        try {
          await entry.conn.evaluate(src);
        } catch { try { entry.conn.close(); } catch {} conns.delete(id); }
      }
    }

    for (const t of targets) {
      if (conns.has(t.id)) continue;
      try {
        const conn = await connectToTarget(t);
        conn.__closed = false;
        conn.onClose(() => { conn.__closed = true; });
        await conn.addInitScript(src);
        await conn.evaluate(src);
        conns.set(t.id, { conn });
        log(`attached ${t.id.slice(0, 8)} wallpaper=${payload.wallpaper?.id || '-'} preset=${cfg.theme?.preset || '-'}`);
      } catch (e) { log('attach failed: ' + e.message); }
    }
  })();
}

const lockSrv = net.createServer(() => {});
function acquireLock(port) {
  return new Promise(res => {
    lockSrv.once('error', () => res(false));
    lockSrv.listen(port + 1, '127.0.0.1', () => res(true));
  });
}

async function main() {
  const hookMode = process.argv.includes('--hook');
  const { debugPort: port } = loadConfig() || {};
  const p = Number(port || 9333);

  if (hookMode) {
    // sidebar UI endpoint daemon (independent of the watcher lifecycle)
    try {
      const ui = spawn(process.execPath, [join(here, 'ui-daemon.mjs')], { detached: true, stdio: 'ignore' });
      ui.unref();
    } catch {}

    const free = await acquireLock(p);
    if (!free) process.exit(0); // watcher already running
    lockSrv.close();
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], { detached: true, stdio: 'ignore' });
    child.unref();
    log(`hook spawned watcher pid=${child.pid}`);
    process.exit(0);
  }

  const locked = await acquireLock(p);
  if (!locked) { console.log(JSON.stringify({ ok: false, reason: 'already-running' })); process.exit(0); }
  log(`watcher started pid=${process.pid} port=${p}`);

  watchFile(resolveConfigPath(), { interval: 700 }, () => { setTimeout(() => tick().catch(() => {}), 300); });
  await tick();
  setInterval(() => tick().catch(() => {}), TICK_MS);
  console.log(JSON.stringify({ ok: true, pid: process.pid, port: p, targets: conns.size }));
}

main().catch(e => { console.error('watcher failed:', e); process.exit(1); });
