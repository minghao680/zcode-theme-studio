#!/usr/bin/env node
// Fast SessionStart hook: returns immediately (<200ms). All real work (watcher,
// ui-daemon, asar self-heal) happens in a detached background worker so session
// startup is never blocked. See startup-worker.mjs.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const child = spawn(process.execPath, [join(here, 'startup-worker.mjs')], {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
  cwd: dirname(here),
});
child.unref();
process.exit(0);
