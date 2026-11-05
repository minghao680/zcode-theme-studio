// Tiny local endpoint for the sidebar UI to persist changes.
// Listens on 127.0.0.1:9337 for POST /zt/apply with {patches:[...]}.
// Applies patches to config.json (same semantics as theme_apply) and refreshes
// bridge.js so both launch modes stay in sync.
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
import { join, dirname } from 'node:path';
import { scanWallpapers, findById, wallpaperRef } from './scanner.mjs';
import { writeBridge } from './bridge.mjs';
import { buildRendererHtml } from './scene-renderer.mjs';

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
      const ref = wallpaperRef(hit);
      if (ref) {
        cfg.wallpaper = {
          ...(cfg.wallpaper || {}),
          id: ref.id,
          type: ref.type,
          mediaUrl: toFileUrl(ref.mediaUrl),
          previewUrl: ref.previewUrl ? toFileUrl(ref.previewUrl) : null,
          sceneSrc: ref.sceneSrc,
          mediaBase: ref.mediaBase,
          rendererUrl: ref.rendererUrl,
          fit: ref.fit,
        };
      }
    }
  }
  if (p.dim !== undefined) cfg.wallpaper = { ...(cfg.wallpaper || {}), dim: Math.max(0, Math.min(50, p.dim)) };
  if (p.blur !== undefined) cfg.wallpaper = { ...(cfg.wallpaper || {}), blur: Math.max(0, Math.min(40, p.blur)) };
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

// Hold the listening server at module level: a listening server whose only
// reference is a short-lived local variable can be garbage-collected, which
// silently CLOSES the port (daemon stayed alive but stopped serving).
let activeServer = null;
function epLog(m) {
  try { appendFileSync(join(homedir(), '.zcode', 'zcode-theme-studio.endpoint.log'), '[' + new Date().toISOString() + '] ' + m + '\n'); } catch {}
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
    // ---- scene live rendering routes (WebWallGL) ----
    // WebWallGL probes files with HEAD (size/existence) before downloading, and
    // streams big assets with GET. Both must be served or scene.pkg "404s".
    if ((req.method === 'GET' || req.method === 'HEAD') && req.url.startsWith('/we/')) return serveSceneRoute(req, res, req.url);
    json(res, 404, { error: 'not found' });
  });
  try {
    srv.on('error', (e) => epLog('endpoint error: ' + (e.message || e)));
    srv.listen(UI_PORT, '127.0.0.1', () => epLog('listening on ' + UI_PORT));
    activeServer = srv; // never GC a listening server
    return srv;
  } catch { return null; }
}

// ---- static assets for the scene renderer ----
const SCENE_MIME = {
  '.json': 'application/json; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.pkg': 'application/octet-stream',
  '.frag': 'text/plain; charset=utf-8',
  '.vert': 'text/plain; charset=utf-8',
  '.glsl': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.html': 'text/html; charset=utf-8',
};

function serveSceneRoute(req, res, url) {
  try {
    const u = new URL(url, 'http://127.0.0.1');
    if (u.pathname === '/we/engine.js') {
      const p = join(here, '..', 'assets', 'webwallgl', 'webwallgl.global.min.js');
      if (!existsSync(p)) return json(res, 404, { error: 'engine not vendored' });
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
      return res.end(readFileSync(p));
    }
    if (u.pathname === '/we/probe.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end('<!doctype html><html><body><script>window.parent.postMessage({source:"probe",ok:true},"*")<\/script></body></html>');
    }
    if (u.pathname === '/we/renderer.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
      return res.end(buildRendererHtml());
    }
    if (u.pathname.startsWith('/we/media/')) {
      // /we/media/<wallpaperId>/<file path inside the wallpaper dir>
      const rest = decodeURIComponent(u.pathname.slice('/we/media/'.length));
      const sep = rest.indexOf('/');
      if (sep < 0) return json(res, 400, { error: 'missing file path' });
      const id = rest.slice(0, sep);
      const hit = findById(scanCached(), id);
      if (!hit) return json(res, 404, { error: 'unknown wallpaper id' });
      const rel = rest.slice(sep + 1);
      const root = hit.dir;
      const resolved = join(root, rel);
      // path containment: the resolved path must stay inside the wallpaper dir
      if (!resolved.startsWith(root)) return json(res, 403, { error: 'path traversal' });
      if (!existsSync(resolved) || statSync(resolved).isDirectory()) return json(res, 404, { error: 'not found' });
      const ext = resolved.slice(resolved.lastIndexOf('.')).toLowerCase();
      const size = statSync(resolved).size;
      const headers = {
        'Content-Type': SCENE_MIME[ext] || 'application/octet-stream',
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      };
      // HEAD: metadata only. The PKG reader probes size/existence this way; a
      // GET-only endpoint makes every probe report "404", which is what broke
      // scene.pkg loading.
      if (req.method === 'HEAD') { res.writeHead(200, headers); return res.end(); }
      // Range support for large assets (video textures / pkg streaming).
      const range = req.headers.range;
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        if (m) {
          const start = m[1] ? parseInt(m[1], 10) : 0;
          const end = m[2] ? parseInt(m[2], 10) : size - 1;
          if (start >= size || end >= size) { res.writeHead(416, { 'Content-Range': 'bytes */' + size }); return res.end(); }
          const len = end - start + 1;
          let chunk;
          try { chunk = readFileSync(resolved).subarray(start, end + 1); } catch (e) { return json(res, 500, { error: 'read failed' }); }
          res.writeHead(206, { ...headers, 'Content-Length': String(len), 'Content-Range': 'bytes ' + start + '-' + end + '/' + size });
          return res.end(chunk);
        }
      }
      let body;
      try { body = readFileSync(resolved); } catch (e) { return json(res, 500, { error: 'read failed' }); }
      res.writeHead(200, headers);
      return res.end(body);
    }
    json(res, 404, { error: 'not found' });
  } catch (e) { if (!res.headersSent) json(res, 500, { error: String(e.message || e) }); else res.destroy(); }
}
