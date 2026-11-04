#!/usr/bin/env node
// zcode-theme-studio injector: one-shot CDP attach that applies the current
// config to the running ZCode renderer and prints a JSON report. The resident
// watcher (watch.mjs) is what keeps themes alive across reloads, because CDP
// script registrations are session-scoped.
//
// Usage: node inject.mjs [--port N] [--config path] [--status] [--screenshot out.png] [--quiet]
// Exit codes: 0 ok · 2 disabled/missing config · 3 ZCode/CDP unreachable · 1 other error
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './lib/cdp.mjs';
import { BOOTSTRAP, buildPayload } from './lib/engine.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// ---------- config resolution ----------
function configCandidates() {
  const cands = [];
  const argIdx = process.argv.indexOf('--config');
  if (argIdx > 0) cands.push(resolve(process.argv[argIdx + 1]));
  if (process.env.ZCODE_PLUGIN_DATA) cands.push(join(process.env.ZCODE_PLUGIN_DATA, 'config.json'));
  cands.push(join(homedir(), '.zcode', 'zcode-theme-studio.config.json')); // mirror kept fresh by server.mjs
  return cands;
}
function loadConfig() {
  for (const p of configCandidates()) {
    try {
      if (existsSync(p)) return { cfg: JSON.parse(readFileSync(p, 'utf-8')), path: p };
    } catch {}
  }
  return { cfg: null, path: null };
}

async function main() {
  const argv = process.argv.slice(2);
  const quiet = argv.includes('--quiet');
  const statusOnly = argv.includes('--status');
  const shotIdx = argv.indexOf('--screenshot');
  const portIdx = argv.indexOf('--port');
  const { cfg, path: cfgPath } = loadConfig();

  const report = { ok: false, ts: new Date().toISOString(), cfgPath };
  if (!cfg) { report.reason = 'no-config'; finish(report, quiet, 2); return; }
  if (cfg.enabled === false) { report.reason = 'disabled'; finish(report, quiet, 2); return; }
  const port = portIdx > 0 ? Number(argv[portIdx + 1]) : Number(cfg.debugPort || 9333);
  report.port = port;

  let conns;
  try {
    conns = await connect(port);
    if (!Array.isArray(conns)) conns = [conns];
  } catch (e) {
    report.reason = 'cdp-unreachable';
    report.error = String(e.message || e);
    finish(report, quiet, 3);
    return;
  }

  if (statusOnly) {
    report.targets = [];
    for (const c of conns) {
      try { report.targets.push({ url: c.target.url.slice(0, 90), injected: await c.evaluate('!!window.__ZTHEME_INSTALLED'), wallpaperActive: await c.evaluate('!!document.getElementById("zt-wallpaper")') }); }
      catch (e) { report.targets.push({ error: String(e.message || e) }); }
      c.close();
    }
    report.ok = report.targets.some(t => t.injected);
    finish(report, quiet, report.ok ? 0 : 1);
    return;
  }

  const payload = buildPayload(cfg);
  const src = 'window.__ZTHEME_CONFIG = ' + JSON.stringify(payload) + ';\n' + BOOTSTRAP;
  report.targets = [];
  for (const c of conns) {
    const t = { url: c.target.url.slice(0, 90) };
    try {
      await c.evaluate(src);
      await c.addInitScript(src);
      t.applied = await c.evaluate('!!window.__ZTHEME_INSTALLED');
    } catch (e) { t.error = String(e.message || e); }
    if (shotIdx > 0) {
      try {
        const png = await c.screenshot();
        writeFileSync(resolve(argv[shotIdx + 1]), png);
        t.screenshot = resolve(argv[shotIdx + 1]);
      } catch (e) { t.screenshotError = String(e.message || e); }
    }
    report.targets.push(t);
    c.close();
  }
  report.ok = report.targets.some(t => t.applied);
  report.injected = report.targets.filter(t => t.applied).length;
  finish(report, quiet, report.ok ? 0 : 1);
}

function finish(report, quiet, code) {
  try {
    const mirror = join(homedir(), '.zcode', 'zcode-theme-studio.inject-result.json');
    mkdirSync(dirname(mirror), { recursive: true });
    writeFileSync(mirror, JSON.stringify(report, null, 2));
  } catch {}
  if (!quiet) console.log(JSON.stringify(report, null, 1));
  process.exit(code);
}

main().catch(e => { console.error('inject failed:', e); process.exit(1); });
