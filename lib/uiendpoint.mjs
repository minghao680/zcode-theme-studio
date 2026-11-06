// Tiny local endpoint for the sidebar UI to persist changes.
// Listens on 127.0.0.1:9337 for POST /zt/apply with {patches:[...]}.
// Applies patches to config.json (same semantics as theme_apply) and refreshes
// bridge.js so both launch modes stay in sync.
import { createServer } from 'node:http';
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
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
  if (process.env.ZCODE_PLUGIN_DATA) return join(process.env.ZCODE_PLUGIN_DATA, 'config.json');
  // No env var (detached daemon / manual node run): resolve the canonical
  // plugin-data config. The old fallback (~/.zcode/zcode-theme-studio/config.json)
  // is a legacy mirror that drifts to `wallpaper: null`, and a daemon reading it
  // re-writes the bridge snapshot blank — the exact "wallpaper disappeared" bug.
  try {
    const base = join(homedir(), '.zcode', 'cli', 'plugins', 'data');
    const dirs = readdirSync(base).filter(d => d.startsWith('zcode-theme-studio@'));
    let best = null, bestAt = 0;
    for (const d of dirs) {
      const p = join(base, d, 'config.json');
      try { const st = statSync(p); if (st.mtimeMs > bestAt) { bestAt = st.mtimeMs; best = p; } } catch {}
    }
    if (best) return best;
  } catch {}
  return join(homedir(), '.zcode', 'zcode-theme-studio', 'config.json');
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
  // Full-window theme curtain over the wallpaper: 'veil' | 'clear'
  if (p.tintMode !== undefined) cfg.tintMode = p.tintMode === 'veil' ? 'veil' : 'clear';
  if (p.veilOpacity !== undefined) cfg.veilOpacity = Math.max(0, Math.min(100, p.veilOpacity));
  if (p.glass) cfg.glass = { ...(cfg.glass || {}), ...p.glass };
  // Independent blur strengths: sidebar vs right-hand composer/status panels
  if (p.glassSidebarBlur !== undefined) cfg.glassSidebarBlur = Math.max(0, Math.min(60, p.glassSidebarBlur));
  if (p.glassPanelBlur !== undefined) cfg.glassPanelBlur = Math.max(0, Math.min(60, p.glassPanelBlur));
  // Sidebar uses the panels' colour + opacity so it merges with the right side
  if (p.unifySidebar !== undefined) cfg.unifySidebar = !!p.unifySidebar;
  // Sidebar material: false = merged with panels (no extra blur),
  //                   true  = glass, copying the app's native filter.
  if (p.sidebarGlass !== undefined) cfg.sidebarGlass = !!p.sidebarGlass;
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
  if (p.saveCustomPreset) {
    cfg.customPresets = cfg.customPresets || [];
    const snap = snapshotScheme(cfg, p.saveCustomPreset.name);
    // replace an existing scheme with the same name (overwrite semantics)
    cfg.customPresets = cfg.customPresets.filter(x => x.name !== snap.name);
    cfg.customPresets.push(snap);
  }
  if (p.applyCustomPreset) {
    const scheme = (cfg.customPresets || []).find(x => x.id === p.applyCustomPreset || x.name === p.applyCustomPreset);
    if (scheme) {
      cfg.theme = cfg.theme || {};
      cfg.theme.preset = scheme.preset;
      cfg.theme.overrides = { ...(scheme.overrides || {}) };
      cfg.overrides = { ...(scheme.overrides || {}) };
      if (scheme.glass) cfg.glass = { ...scheme.glass };
      if (scheme.surfaceOpacity !== undefined) cfg.surfaceOpacity = scheme.surfaceOpacity;
      if (scheme.sidebarOpacity !== undefined) cfg.sidebarOpacity = scheme.sidebarOpacity;
      if (scheme.bubbleOpacity !== undefined) cfg.bubbleOpacity = scheme.bubbleOpacity;
    }
  }
  if (p.deleteCustomPreset) {
    cfg.customPresets = (cfg.customPresets || []).filter(x => x.id !== p.deleteCustomPreset);
  }
}


// ---- user-imported wallpapers (local files + Bing daily downloads) ----
// Entries live outside the WE workshop scan in their own manifest so the panel
// grid, the apply path (wallpaperId) and the bridge catalog all see them.
const IMPORT_DIR = join(homedir(), '.zcode', 'zcode-theme-studio', 'imported');
const IMPORTED_JSON = join(homedir(), '.zcode', 'zcode-theme-studio', 'imported.json');
const VIDEO_PREVIEW_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#10151f"/>' +
  '<path d="M142 62l44 28-44 28z" fill="#5b8def" opacity=".85"/>' +
  '<text x="160" y="152" font-size="14" fill="#8ea3bd" text-anchor="middle" font-family="sans-serif">video</text></svg>'
);
function readImported() {
  try { return JSON.parse(readFileSync(IMPORTED_JSON, 'utf8')); } catch { return []; }
}
function writeImported(list) {
  mkdirSync(dirname(IMPORTED_JSON), { recursive: true });
  writeFileSync(IMPORTED_JSON, JSON.stringify(list, null, 1));
}
function importedHits() {
  const list = readImported();
  const out = [];
  for (const e of list) {
    if (!e.file || !existsSync(e.file)) continue;
    out.push({
      id: e.id, title: e.title || e.name || e.id, type: e.type,
      playable: true, mediaPath: e.file,
      previewPath: e.type === 'image' ? e.file : null,
    });
  }
  return out;
}
function scanMerged() {
  const base = scanCached();
  return base.concat(importedHits());
}
const SAFE_EXT = { image: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"], video: ["mp4", "webm", "mov", "mkv", "avi"] };
function extOf(name) {
  const m = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}
function kindFor(name) {
  const e = extOf(name);
  if (SAFE_EXT.image.includes(e)) return 'image';
  if (SAFE_EXT.video.includes(e)) return 'video';
  return null;
}

// ---- Bing daily wallpaper (fetched server-side: bing.com sends no CORS headers) ----
let bingCache = null, bingCacheAt = 0;
async function bingList(n) {
  if (bingCache && Date.now() - bingCacheAt < 3600e3) return bingCache.slice(0, n);
  const url = 'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=' + Math.min(15, Math.max(1, n)) + '&mkt=zh-CN';
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('bing http ' + r.status);
  const j = await r.json();
  const out = (j.images || []).map(im => {
    const base = 'https://www.bing.com' + (im.url || '').replace(/^\./, '');
    return {
      date: im.enddate, title: im.copyright || im.title || im.enddate,
      full: base, thumb: base.replace(/_1920x1080\.jpg/, '_640x360.jpg'),
    };
  });
  bingCache = out; bingCacheAt = Date.now();
  return out.slice(0, n);
}

// ---- custom preset schemes ----
// A scheme snapshots theme (preset+overrides), glass and panel opacities. Saved
// schemes live in cfg.customPresets and are exposed to the panel in the payload.
function snapshotScheme(cfg, name) {
  const theme = cfg.theme || {};
  return {
    id: 'custom-' + Date.now().toString(36),
    name: String(name || ('方案 ' + ((cfg.customPresets || []).length + 1))).slice(0, 40),
    preset: theme.preset || null,
    overrides: { ...(theme.overrides || {}), ...(cfg.overrides || {}) },
    glass: { ...(cfg.glass || {}) },
    surfaceOpacity: cfg.surfaceOpacity,
    sidebarOpacity: cfg.sidebarOpacity,
    bubbleOpacity: cfg.bubbleOpacity,
    savedAt: Date.now(),
  };
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
          applyPatchesCore(res, patches || []);
        } catch (e) { return json(res, 400, { error: String(e.message || e) }); }
      });
      return;
    }
    // ---- user imports (local files) + Bing daily ----
    if (req.method === 'POST' && req.url.startsWith('/zt/import')) return handleImport(req, res, req.url);
    if (req.method === 'DELETE' && req.url.startsWith('/zt/import')) return handleImportDelete(req, res, req.url);
    if (req.method === 'GET' && req.url.startsWith('/zt/bing') && !req.url.startsWith('/zt/bing-apply')) return handleBingList(res, req.url);
    if (req.method === 'POST' && req.url === '/zt/bing-apply') return handleBingApply(req, res);
// Shared apply core: patches -> config -> bridge rebuild -> fresh payload out.
function applyPatchesCore(res, patches) {
  try {
    const cfg = readCfg();
    if (!cfg) return json(res, 500, { error: 'no config' });
    for (const p of (patches || [])) applyPatch(cfg, p, scanMerged);
    writeCfg(cfg);
  // rebuild the bridge snapshot AND return the fresh payload so the panel
  // can apply immediately without waiting for the 3 s refresher
  let payload = null;
  try {
    // The asar loader points at the CANONICAL bridge path (~/.zcode/zcode-theme-studio).
    // Always write there (same path lib/sync.mjs uses), never into plugin-data,
    // or the page keeps reading a stale snapshot.
    const bp = canonicalBridgePath();
    // Use the MERGED scan: imported wallpapers (local files / Bing downloads)
    // live outside the workshop scan, and rebuilding the catalog from scanCached
    // alone made a freshly imported wallpaper vanish from the panel.
    writeBridge(bp, cfg, scanMerged());
    const snap = readFileSync(join(dirname(bp), 'config-snapshot.json'), 'utf8');
    payload = JSON.parse(snap);
  } catch {}
  return json(res, 200, { ok: true, payload, config: { preset: cfg.theme && cfg.theme.preset, wallpaper: cfg.wallpaper && cfg.wallpaper.id } });
  } catch (e) { return json(res, 400, { error: String(e.message || e) }); }
}

// ---- import / bing route handlers ----
function handleImport(req, res, url) {
  try {
    const u = new URL(url, "http://127.0.0.1");
    const name = decodeURIComponent(u.searchParams.get('name') || 'wallpaper');
    const title = decodeURIComponent(u.searchParams.get('title') || '') || name;
    const kind = u.searchParams.get('kind') || kindFor(name);
    if (!kind) return json(res, 400, { error: "unsupported file type: " + extOf(name) });
    const chunks = [];
    let size = 0;
    req.on('data', d => { size += d.length; if (size > 500 * 1024 * 1024) req.destroy(); chunks.push(d); });
    req.on('end', () => {
      try {
      const id = 'imp' + Date.now().toString(36);
      const dir = join(IMPORT_DIR, id);
      mkdirSync(dir, { recursive: true });
      const safe = name.replace(/[\\/:*?"<>|]/g, "_");
      const file = join(dir, safe);
      writeFileSync(file, Buffer.concat(chunks));
      const list = readImported();
      list.push({ id, title, name: safe, type: kind, file, addedAt: Date.now() });
      writeImported(list);
      epLog('import saved ' + id + ' ' + kind + ' ' + Math.round(size / 1024) + 'KB');
      return json(res, 200, { ok: true, id, type: kind, title });
      } catch (e) { return json(res, 500, { error: String(e.message || e) }); }
    });
  } catch (e) { return json(res, 400, { error: String(e.message || e) }); }
}
function handleImportDelete(req, res, url) {
  try {
    const u = new URL(url, "http://127.0.0.1");
    const id = u.searchParams.get('id');
    const list = readImported();
    const hit = list.find(e => e.id === id);
    if (!hit) return json(res, 404, { error: "no such import" });
    try { if (hit.file) rmSync(dirname(hit.file), { recursive: true, force: true }); } catch {}
    writeImported(list.filter(e => e.id !== id));
    return json(res, 200, { ok: true });
  } catch (e) { return json(res, 500, { error: String(e.message || e) }); }
}
async function handleBingList(res, url) {
  try {
    const u = new URL(url, "http://127.0.0.1");
    const n = Number(u.searchParams.get('n') || 8);
    const images = await bingList(n);
    return json(res, 200, { ok: true, images });
  } catch (e) { return json(res, 502, { error: String(e.message || e) }); }
}
function handleBingApply(req, res) {
  let body = '';
  req.on('data', d => { body += d; if (body.length > 1e6) req.destroy(); });
  req.on('end', async () => {
    try {
      const { url: imgUrl, title, date } = JSON.parse(body || "{}");
      if (!imgUrl || !/^https:\/\/www\.bing\.com\//.test(imgUrl)) return json(res, 400, { error: "bad url" });
      const id = 'impbing' + (date || Date.now().toString(36));
      const dir = join(IMPORT_DIR, id);
      mkdirSync(dir, { recursive: true });
      const file = join(dir, "bing-" + (date || "daily") + ".jpg");
      if (!existsSync(file)) {
        const r = await fetch(imgUrl, { signal: AbortSignal.timeout(30000) });
        if (!r.ok) throw new Error("download http " + r.status);
        writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      }
      const list = readImported();
      if (!list.some(e => e.id === id)) {
        list.push({ id, title: title || ("Bing " + (date || "")), name: file.split(/[\\/]/).pop(), type: "image", file, addedAt: Date.now() });
        writeImported(list);
      }
      applyPatchesCore(res, [{ wallpaperId: id }]);
    } catch (e) { return json(res, 502, { error: String(e.message || e) }); }
  });
}
    // ---- scene live rendering routes (WebWallGL) ----
    // WebWallGL probes files with HEAD (size/existence) before downloading, and
    // streams big assets with GET. Both must be served or scene.pkg "404s".
    if ((req.method === 'GET' || req.method === 'HEAD') && req.url.startsWith('/we/')) return serveSceneRoute(req, res, req.url);
    // Diagnostics from injected pages: scene mount lifecycle on machines without
    // CDP (normal asar startup). text/plain POST keeps it a simple CORS request.
    if (req.method === 'POST' && req.url === '/zt/scene-report') {
      let body = '';
      req.on('data', d => { body += d; if (body.length > 4e3) req.destroy(); });
      req.on('end', () => {
        try { epLog('scene-report ' + body.slice(0, 400)); } catch {}
        json(res, 204, {});
      });
      return;
    }
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
      const st = statSync(resolved);
      const size = st.size;
      // Precondition on mtime instead of forbidding caching. scene.pkg is often
      // tens of MB and was re-downloaded on EVERY scene switch because of
      // no-cache — the dominant cost behind the slow preview->live transition.
      const etag = '"' + st.size.toString(36) + '-' + Math.round(st.mtimeMs).toString(36) + '"';
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, { 'ETag': etag, 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' });
        return res.end();
      }
      const headers = {
        'Content-Type': SCENE_MIME[ext] || 'application/octet-stream',
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
        'ETag': etag,
        'Cache-Control': 'public, max-age=3600',
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
