#!/usr/bin/env node
// Standalone UI endpoint daemon (127.0.0.1:9337). Kept alive independently of the
// MCP server (which is stdio-bound and exits when the session closes).
// Spawned detached by hooks/startup-worker.mjs.
//
// Startup order matters: kill older instances FIRST (awaited), then lock, then
// bind. A fire-and-forget kill lets a stale daemon keep serving 9337 with old
// buggy code while the new one silently exits — the cause of several "panel
// edits don't stick" bugs.
import * as net from 'node:net';
import { startUiEndpoint, UI_PORT } from './lib/uiendpoint.mjs';
import { appendFileSync, existsSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const VERSION = '1.5.2';
const LOG = join(homedir(), '.zcode', 'zcode-theme-studio.ui.log');
function log(m) { try { appendFileSync(LOG, `[${new Date().toISOString()}] ${m}\n`); } catch {} }

function killOthers() {
  return new Promise(res => {
    try {
      const c = spawn('powershell.exe', ['-NoProfile', '-Command',
        `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*ui-daemon*' -and $_.ProcessId -ne ${process.pid} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`], { timeout: 20000 });
      c.on('close', code => res(code));
      c.on('error', () => res(-1));
      setTimeout(() => res(-2), 22000); // hard cap
    } catch { res(-1); }
  });
}

function acquireLock(port) {
  return new Promise(res => {
    const lock = net.createServer(() => {});
    lock.once('error', () => res(false));
    lock.listen(port, '127.0.0.1', () => res(true));
    // keep the lock server referenced for the process lifetime
    globalThis.__ztLock = lock;
  });
}

/** startUiEndpoint but resolves true only when actually listening. */
function bindEndpoint() {
  return new Promise(res => {
    const srv = startUiEndpoint();
    if (!srv) return res(false);
    srv.once('listening', () => res(true));
    srv.once('error', () => res(false));
    setTimeout(() => res(false), 8000); // bind cap
  });
}

async function main() {
  const killCode = await killOthers();
  log(`kill-others exit=${killCode}`);

  const lockFree = await acquireLock(UI_PORT + 1);
  if (!lockFree) { log('lock busy after kill — giving up this run'); process.exit(0); }

  const bound = await bindEndpoint();
  if (!bound) { log('failed to bind 9337 — another instance is serving; exiting'); process.exit(0); }
  log(`ui endpoint listening on ${UI_PORT} (v${VERSION})`);
  try { writeFileSync(join(homedir(), '.zcode', 'zcode-theme-studio', 'uidaemon.json'), JSON.stringify({ pid: process.pid, version: VERSION, port: UI_PORT, ts: Date.now() })); } catch {}

  // Migration: older builds wrote bridge.js into ZCODE_PLUGIN_DATA while the asar
  // loader reads the canonical path — that split made panel edits look like they
  // "reset to 25". Remove the orphan so the two can never diverge again.
  try {
    const pluginData = process.env.ZCODE_PLUGIN_DATA;
    if (pluginData) {
      const orphan = join(pluginData, 'bridge.js');
      if (existsSync(orphan)) {
        renameSync(orphan, orphan + '.orphaned-' + Date.now());
        log('migrated stale bridge from plugin-data dir');
      }
    }
  } catch (e) { log('migration skipped: ' + (e.message || e)); }

  process.on('SIGTERM', () => process.exit(0));
  setInterval(() => {}, 1 << 30); // keep alive
}

main().catch(e => { log('daemon fatal: ' + (e.message || e)); process.exit(1); });
