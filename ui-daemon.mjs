#!/usr/bin/env node
// Standalone UI endpoint daemon (127.0.0.1:9337). Kept alive independently of the
// MCP server (which is stdio-bound and exits when the session closes).
// Spawned detached by watch.mjs / server.mjs; self-locks on port+1.
import * as net from 'node:net';
import { startUiEndpoint, UI_PORT } from './lib/uiendpoint.mjs';
import { appendFileSync, existsSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const LOG = join(homedir(), '.zcode', 'zcode-theme-studio.ui.log');
function log(m) { try { appendFileSync(LOG, `[${new Date().toISOString()}] ${m}\n`); } catch {} }

const lock = net.createServer(() => {});
lock.once('error', () => { log('lock busy: another endpoint is running'); process.exit(0); });
lock.listen(UI_PORT + 1, '127.0.0.1', () => {
  const srv = startUiEndpoint();
  if (!srv) { log('failed to start UI endpoint'); process.exit(1); }
  log(`ui endpoint listening on ${UI_PORT}`);
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
});
