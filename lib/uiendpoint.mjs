// Tiny local endpoint for the sidebar UI to persist changes.
// Listens on 127.0.0.1:9337 for POST /zt/apply with {patches:[...]}.
// Applies patches to config.json (same semantics as theme_apply) and refreshes
// bridge.js so both launch modes stay in sync.
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { scanWallpapers, findById } from './scanner.mjs';
import { writeBridge } from './bridge.mjs';

/** The bridge path the asar loader references. Single source of truth. */
export function canonicalBridgePath() {
  return join(homedir(), '.zcode', 'zcode-theme-studio', 'bridge.js');
}

export const UI_PORT = 9337;

function configPath() {
  return process.env.ZCODE_PLUGIN_DATA
    ? join(process.env.ZCODE_PLUGIN_DATA, 'config.json')
    : join(homedir(), '.zcode', 'zcode-theme-studio', 'config.json');
}
function readCfg() { try { return JSON.parse(readFileSync(configPath(), 'utf8')); } catch { return null; } }
function writeCfg(c) {
  mkdirSync(join(configPath(), '..'), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(c, null, 2));
}
function toFileUrl(p) {
  const s = String(p).replace(/\\/g, '/');
  const m = /^([A-Za-z]):(.*)$/.exec(s);
  if (m) return `file:///${m[1]}:/` + m[2].split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return 'file:///' + s.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function applyPatch(cfg, p, scan) {
  // NOTE: do NOT touch cfg._envSeen here. That map records the last value seen from
  // the settings page, and the session-start sync only applies an env value when it
  // DIFFERS from the record. Leaving it alone means a UI tweak (dim=41) survives the
  // next session (env still 22 == seen 22 → no override), while a genuine settings
  // page change (env 22 → 30) still wins.
  if (p.preset !== undefined) { cfg.theme = cfg.theme || {}; cfg.theme.preset = p.preset; }
  if (p.wallpaperClear) { cfg.wallpaper = { id: null, type: null, mediaUrl: null, fit: 'cover', dim: 25, blur: 0 }; }
  if (p.wallpaperId) {
    const hit = findById(scan(), p.wallpaperId);
    if (hit) {
      const media = hit.playable ? hit.mediaPath : hit.previewPath;
      if (media) cfg.wallpaper = { ...(cfg.wallpaper || {}), id: hit.id, type: hit.playable ? hit.type : 'image', mediaUrl: toFileUrl(media) };
    }
  }
  if (p.dim !== undefined) cfg.wallpaper = { ...(cfg.wallpaper || {}), dim: Math.max(0, Math.min(50, p.dim)) };
  if (p.fit !== undefined) cfg.wallpaper = { ...(cfg.wallpaper || {}), fit: p.fit };
  if (p.surfaceOpacity !== undefined) cfg.surfaceOpacity = Math.max(0, Math.min(100, p.surfaceOpacity));
  if (p.sidebarOpacity !== undefined) cfg.sidebarOpacity = Math.max(0, Math.min(100, p.sidebarOpacity));
  if (p.bubbleOpacity !== undefined) cfg.bubbleOpacity = Math.max(30, Math.min(100, p.bubbleOpacity));
  if (p.glass) cfg.glass = { ...(cfg.glass || {}), ...p.glass };
  if (p.setOverride) {
    // Dual-write: config file keeps theme.overrides; the payload/UI reads the
    // top-level overrides. Keep both in sync or the panel loses state on refresh.
    cfg.theme = cfg.theme || {};
    cfg.theme.overrides = cfg.theme.overrides || {};
    cfg.overrides = cfg.overrides || {};
    if (p.setOverride.value) {
      cfg.theme.overrides[p.setOverride.token] = p.setOverride.value;
      cfg.overrides[p.setOverride.token] = p.setOverride.value;
    } else {
      delete cfg.theme.overrides[p.setOverride.token];
      delete cfg.overrides[p.setOverride.token];
    }
  }
  if (p.clearOverrides) {
    if (cfg.theme) cfg.theme.overrides = {};
    cfg.overrides = {};
  }
}

let cachedScan = null, cachedAt = 0;
function scanCached() {
  if (!cachedScan || Date.now() - cachedAt > 60000) {
    try { cachedScan = scanWallpapers(); } catch { cachedScan = cachedScan || []; }
    cachedAt = Date.now();
  }
  return cachedScan;
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST,GET,OPTIONS' });
  res.end(JSON.stringify(obj));
}

/** Start the UI endpoint. Returns the http server (already listening) or null. */
export function startUiEndpoint() {
  const srv = createServer((req, res) => {
    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (req.method === 'POST' && req.url === '/zt/apply') {
      let body = '';
      req.on('data', d => { body += d; if (body.length > 1e6) req.destroy(); });
      req.on('end', () => {
        try {
          const { patches } = JSON.parse(body || '{}');
          const cfg = readCfg();
          if (!cfg) return json(res, 500, { error: 'no config' });
          for (const p of (patches || [])) applyPatch(cfg, p, scanCached);
          writeCfg(cfg);
          // rebuild the bridge snapshot AND return the fresh payload so the panel
          // can apply immediately without waiting for the 3 s refresher
          let payload = null;
          try {
            // The asar loader points at the CANONICAL bridge path (~/.zcode/zcode-theme-studio).
            // Always write there (same path lib/sync.mjs uses), never into plugin-data,
            // or the page keeps reading a stale snapshot.
            const bp = canonicalBridgePath();
            writeBridge(bp, cfg, scanCached());
            const snap = readFileSync(join(dirname(bp), 'config-snapshot.json'), 'utf8');
            payload = JSON.parse(snap);
          } catch {}
          return json(res, 200, { ok: true, payload, config: { preset: cfg.theme && cfg.theme.preset, wallpaper: cfg.wallpaper && cfg.wallpaper.id } });
        } catch (e) { return json(res, 400, { error: String(e.message || e) }); }
      });
      return;
    }
    json(res, 404, { error: 'not found' });
  });
  try {
    srv.listen(UI_PORT, '127.0.0.1');
    srv.on('error', () => {});
    return srv;
  } catch { return null; }
}
