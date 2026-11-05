#!/usr/bin/env node
// Standalone UI endpoint daemon (127.0.0.1:9337): sidebar panel persistence +
// scene wallpaper asset serving. Spawned detached by hooks/startup-worker.mjs.
//
// Hard-won lesson: `startUiEndpoint()` calls listen() internally, so waiting for a
// 'listening' event registered afterwards can miss it forever — the old daemon
// then "timed out", exited, and CLOSED the port while still logging success.
// This version verifies the port by actually connecting, retries binding, and
// runs a watchdog that rebinds if the port is ever lost.
import * as net from 'node:net';
import { startUiEndpoint, UI_PORT } from './lib/uiendpoint.mjs';
import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const pluginRoot = join(dirname(fileURLToPath(import.meta.url)));

let VERSION = '0.0.0';
try { VERSION = JSON.parse(readFileSync(join(pluginRoot, '.zcode-plugin', 'plugin.json'), 'utf8')).version || VERSION; } catch {}
const LOG = join(homedir(), '.zcode', 'zcode-theme-studio.ui.log');
function log(m) { try { appendFileSync(LOG, '[' + new Date().toISOString() + '] ' + m + '\n'); } catch {} }

function killOthers() {
  return new Promise(res => {
    try {
      const c = spawn('powershell.exe', ['-NoProfile', '-Command',
        `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*ui-daemon*' -and $_.ProcessId -ne ${process.pid} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`], { timeout: 20000, windowsHide: true });
      c.on('close', code => res(code));
      c.on('error', () => res(-1));
      setTimeout(() => res(-2), 22000);
    } catch { res(-1); }
  });
}

function probePort() {
  return new Promise(res => {
    const s = net.connect(UI_PORT, '127.0.0.1');
    let done = false;
    const finish = v => { if (done) return; done = true; try { s.destroy(); } catch {} res(v); };
    s.once('connect', () => finish(true));
    s.once('error', () => finish(false));
    setTimeout(() => finish(false), 2000);
  });
}

async function main() {
  const killCode = await killOthers();
  log('kill-others exit=' + killCode);

  let srv = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    srv = startUiEndpoint();
    if (!srv) { log('startUiEndpoint null, attempt ' + attempt); await new Promise(r => setTimeout(r, 1500)); continue; }
    await new Promise(r => setTimeout(r, 700));
    if (await probePort()) break;
    log('port unreachable after bind (attempt ' + attempt + '), retrying');
    try { srv.close(); } catch {}
    srv = null;
    await new Promise(r => setTimeout(r, 1500));
  }
  if (!srv) { log('FAILED to bind ' + UI_PORT); process.exit(0); }

  log('ui endpoint verified on ' + UI_PORT + ' (v' + VERSION + ')');
  try { writeFileSync(join(homedir(), '.zcode', 'zcode-theme-studio', 'uidaemon.json'), JSON.stringify({ pid: process.pid, version: VERSION, port: UI_PORT, ts: Date.now() })); } catch {}

  // Watchdog: the endpoint has silently stopped serving before (GC'd server /
  // failed bind). Rebinding in place keeps the panel and scene renderer alive.
  setInterval(async () => {
    if (await probePort()) return;
    log('WATCHDOG: port lost, rebinding');
    const again = startUiEndpoint();
    if (again) log('WATCHDOG: rebound'); else log('WATCHDOG: rebind failed');
  }, 30000);

  try {
    const pluginData = process.env.ZCODE_PLUGIN_DATA;
    if (pluginData) {
      const orphan = join(pluginData, 'bridge.js');
      if (existsSync(orphan)) { renameSync(orphan, orphan + '.orphaned-' + Date.now()); log('migrated stale bridge'); }
    }
  } catch (e) { log('migration skipped: ' + (e.message || e)); }

  process.on('SIGTERM', () => process.exit(0));
  setInterval(() => {}, 1 << 30);
}

process.on('uncaughtException', e => log('UNCAUGHT: ' + (e.stack || e.message || e)));
process.on('unhandledRejection', e => log('UNHANDLED: ' + ((e && e.stack) || e)));
main().catch(e => { log('daemon fatal: ' + (e.message || e)); process.exit(1); });
