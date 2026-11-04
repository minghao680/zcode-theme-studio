#!/usr/bin/env node
// zcode-theme-studio MCP server (stdio, JSON-RPC 2.0, zero dependencies).
// Tools drive theme/wallpaper application; every apply re-runs inject.mjs so the
// running ZCode window updates immediately.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanWallpapers, findById } from './lib/scanner.mjs';
import { listPresets, getPreset } from './lib/themes.mjs';
import { paletteFromFile } from './lib/palette.mjs';
import { syncBridge, isAsarPatched, asarPath } from './lib/sync.mjs';
import { fileUrl } from './lib/bridge.mjs';


const here = dirname(fileURLToPath(import.meta.url));

// ---------- config storage ----------
const DATA_DIR = process.env.ZCODE_PLUGIN_DATA || join(homedir(), '.zcode', 'zcode-theme-studio');
const CONFIG_PATH = join(DATA_DIR, 'config.json');
const MIRROR_PATH = join(homedir(), '.zcode', 'zcode-theme-studio.config.json');

const DEFAULT_CONFIG = {
  version: 2,
  enabled: true,
  debugPort: Number(process.env.THEME_STUDIO_DEBUG_PORT) || 9333,
  theme: { preset: 'starsea-blue', overrides: {} },
  wallpaper: { id: null, type: null, mediaUrl: null, fit: 'cover', dim: 25, blur: 0 },
  surfaceOpacity: 88,
  sidebarOpacity: 76,
  bubbleOpacity: 78,
  glass: { enabled: true, blur: 16, style: 'liquid' },
};

function readConfig() {
  try { return { ...structuredClone(DEFAULT_CONFIG), ...JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) }; }
  catch { return structuredClone(DEFAULT_CONFIG); }
}
function writeConfig(cfg) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  try { writeFileSync(MIRROR_PATH, JSON.stringify(cfg, null, 2)); } catch {}
}

// ---------- settings page (userConfig) sync ----------
// The plugin settings page (设置 → 插件管理 → 本插件) renders manifest userConfig and
// passes values via env. First run seeds config.json; a later CHANGE of the env value
// (user edited the setting) overrides the chat-managed value. Within a session the
// theme_apply tools remain authoritative.
function syncEnvSettings() {
  const cfg = readConfig();
  const seen = cfg._envSeen || {};
  let changed = false;
  const env = k => (process.env[k] ?? '').trim();
  const num = v => { const n = Number(v); return Number.isFinite(n) && v !== '' ? n : null; };
  const bool = v => v === 'true' ? true : v === 'false' ? false : null;
  const set = (key, val, apply) => {
    if (val === null || val === undefined || val === '') return; // '' = userConfig default unset, never apply or record
    const s = String(val);
    if (seen[key] === undefined || seen[key] !== s) { apply(val); changed = true; }
    seen[key] = s;
  };

  set('debug_port', num(env('THEME_STUDIO_DEBUG_PORT')), v => { cfg.debugPort = v; });
  set('enabled', bool(env('THEME_STUDIO_ENABLED')), v => { cfg.enabled = v; });
  set('preset', env('THEME_STUDIO_PRESET'), v => { cfg.theme = { ...(cfg.theme || {}), preset: v }; });
  set('surface_opacity', num(env('THEME_STUDIO_SURFACE_OPACITY')), v => { cfg.surfaceOpacity = Math.max(0, Math.min(100, v)); });
  set('sidebar_opacity', num(env('THEME_STUDIO_SIDEBAR_OPACITY')), v => { cfg.sidebarOpacity = Math.max(0, Math.min(100, v)); });
  set('bubble_opacity', num(env('THEME_STUDIO_BUBBLE_OPACITY')), v => { cfg.bubbleOpacity = Math.max(30, Math.min(100, v)); });
  set('glass_enabled', bool(env('THEME_STUDIO_GLASS_ENABLED')), v => { cfg.glass = { ...(cfg.glass || {}), enabled: v }; });
  set('glass_style', env('THEME_STUDIO_GLASS_STYLE'), v => { if (v === 'liquid' || v === 'frosted') cfg.glass = { ...(cfg.glass || {}), style: v }; });
  set('glass_blur', num(env('THEME_STUDIO_GLASS_BLUR')), v => { cfg.glass = { ...(cfg.glass || {}), blur: Math.max(0, Math.min(40, v)) }; });
  set('rotation_enabled', bool(env('THEME_STUDIO_ROTATION_ENABLED')), v => { cfg.rotation = { ...(cfg.rotation || {}), enabled: v }; });
  set('rotation_interval', num(env('THEME_STUDIO_ROTATION_INTERVAL')), v => { cfg.rotation = { ...(cfg.rotation || {}), intervalSec: Math.max(30, v) }; });
  set('dim', num(env('THEME_STUDIO_DIM')), v => { cfg.wallpaper = { ...(cfg.wallpaper || {}), dim: Math.max(0, Math.min(50, v)) }; });
  set('blur', num(env('THEME_STUDIO_BLUR')), v => { cfg.wallpaper = { ...(cfg.wallpaper || {}), blur: Math.max(0, Math.min(40, v)) }; });
  set('fit', env('THEME_STUDIO_FIT'), v => { if (v === 'cover' || v === 'contain') cfg.wallpaper = { ...(cfg.wallpaper || {}), fit: v }; });
  set('wallpaper_id', env('THEME_STUDIO_WALLPAPER_ID'), v => {
    try {
      const hit = resolveWallpaperId(scanOnce(), v);
      if (hit) {
        const media = hit.playable ? hit.mediaPath : hit.previewPath;
        if (media) cfg.wallpaper = { ...(cfg.wallpaper || {}), id: hit.id, type: hit.playable ? hit.type : 'image', mediaUrl: toFileUrl(media) };
      }
    } catch {}
  });

  if (changed) {
    cfg._envSeen = seen;
    writeConfig(cfg);
    syncBridge(cfg); // keep plain-launch bridge in sync with settings page changes
    log(`settings page sync applied (${Object.keys(seen).length} keys tracked)`);
  }
  return changed;
}

function log(msg) {
  try { appendFileSync(join(homedir(), '.zcode', 'zcode-theme-studio.server.log'), `[${new Date().toISOString()}] ${msg}\n`); } catch {}
}

function toFileUrl(p) {
  let u = 'file:///' + encodeURI(String(p).replace(/\\/g, '/'));
  u = u.replace(/#/g, '%23').replace(/\?/g, '%3F');
  return u;
}

// Flexible wallpaper id resolution: exact id first, then unique prefix/substring match.
function resolveWallpaperId(list, id) {
  const exact = findById(list, id);
  if (exact) return exact;
  const q = String(id).toLowerCase();
  const matches = list.filter(w => w.id.toLowerCase().startsWith(q) || w.id.toLowerCase().includes(q) || (w.title || '').toLowerCase().includes(q));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error('Ambiguous wallpaper reference "' + id + '", candidates: ' + matches.slice(0, 5).map(m => m.id + ' ' + m.title).join(' | '));
  return null;
}

function inferMediaType(p) {
  const e = extname(p).toLowerCase();
  if (['.mp4', '.webm', '.ogv', '.mov', '.m4v'].includes(e)) return 'video';
  if (['.html', '.htm'].includes(e)) return 'web';
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif'].includes(e)) return 'image';
  return null;
}

function runInject(args = []) {
  return new Promise(res => {
    const child = spawn(process.execPath, [join(here, 'inject.mjs'), ...args], { timeout: 30000 });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('close', code => {
      let json = null;
      try { json = JSON.parse(out); } catch {}
      res({ code, json, err });
    });
    child.on('error', e => res({ code: -1, json: null, err: String(e) }));
  });
}

// Ensure the resident watcher is running (it self-locks; a redundant spawn exits immediately).
// The watcher holds the persistent CDP session, so registrations survive reloads and the
// app's self-navigations, and config file changes hot-apply.
function ensureWatcher() {
  return new Promise(res => {
    const child = spawn(process.execPath, [join(here, 'watch.mjs')], { detached: true, stdio: 'ignore' });
    child.on('error', () => res(false));
    child.unref();
    // give the watcher a moment to attach before we report
    setTimeout(() => res(true), 1500);
  });
}

function scanOnce(cfg) {
  return scanWallpapers({
    steamRoots: process.env.THEME_STEAM_ROOTS ? process.env.THEME_STEAM_ROOTS.split(';') : undefined,
    workshopDir: process.env.THEME_STUDIO_WORKSHOP_DIR || undefined,
    projectsDir: process.env.THEME_STUDIO_PROJECTS_DIR || undefined,
  });
}

// ---------- tool implementations ----------
function applyWallpaper(cfg, wp) {
  cfg.wallpaper = { ...(cfg.wallpaper || {}), ...wp };
  if (!cfg.wallpaper.id) cfg.wallpaper.mediaUrl = null;
}

const TOOLS = [
  {
    name: 'theme_presets',
    description: 'List built-in theme presets for ZCode (color schemes: accent/foreground/surface).',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      return listPresets();
    },
  },
  {
    name: 'wallpaper_list',
    description: 'List Wallpaper Engine wallpapers installed on this machine (Steam workshop + local projects). Returns id, title, type (video/web/image/scene/...), playable flag and preview path.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Case-insensitive substring filter on title/id/type.' },
      },
    },
    async run(args) {
      const list = scanOnce();
      const f = (args.filter || '').toLowerCase();
      const rows = list
        .filter(w => !f || w.title.toLowerCase().includes(f) || w.id.toLowerCase().includes(f) || w.type.includes(f))
        .map(w => ({ id: w.id, title: w.title, type: w.type, playable: w.playable, previewFallback: w.previewFallback, previewPath: w.previewPath, source: w.source }));
      return { count: rows.length, wallpapers: rows };
    },
  },
  {
    name: 'theme_apply',
    description: 'Apply theme and/or wallpaper to the running ZCode window (CDP injection; requires ZCode launched with --remote-debugging-port). Persists config and survives reloads until ZCode restarts. Supports preset tokens, custom local media, playlist rotation and glass/dim tuning.',
    inputSchema: {
      type: 'object',
      properties: {
        preset: { type: 'string', description: 'Preset id from theme_presets (e.g. carbon-code, cyber-neon, aurora, paper-reading).' },
        overrides: { type: 'object', description: 'Raw CSS variable overrides, e.g. {"--color-accent":"#ff0"}.' },
        clearOverrides: { type: 'boolean', description: 'Clear all raw overrides.' },
        wallpaperId: { type: 'string', description: 'Wallpaper id (or unique prefix/title substring) from wallpaper_list. Null/empty clears the wallpaper.' },
        wallpaperPath: { type: 'string', description: 'Absolute path to ANY local media file (mp4/webm video, html page, jpg/png/gif/webp image) to use as wallpaper - not limited to Wallpaper Engine content.' },
        forcePreview: { type: 'boolean', description: 'For scene/application wallpapers: apply the static preview image (animated gif when available) instead of failing.' },
        dim: { type: 'number', description: 'Background dim overlay 0-50 (default 25; dark presets use black, light presets use a white frost).' },
        blur: { type: 'number', description: 'Wallpaper blur overlay px 0-40 (blurs the wallpaper behind the dim layer).' },
        fit: { type: 'string', enum: ['cover', 'contain'], description: 'Fit mode (default cover; contain uses blurred fill).' },
        surfaceOpacity: { type: 'number', description: 'Panel surface opacity 0-100 (default 88). Lower = more see-through panels.' },
        sidebarOpacity: { type: 'number', description: 'Sidebar surface opacity 0-100 (default 76).' },
        bubbleOpacity: { type: 'number', description: 'User message bubble opacity 30-100 (default 78). Raises chat bubble readability over wallpaper.' },
        glass: { type: 'object', properties: { enabled: { type: 'boolean' }, blur: { type: 'number' }, style: { type: 'string', enum: ['frosted', 'liquid'] } }, description: 'Glassmorphism on sidebar/top bar: frosted = plain blur; liquid = Apple liquid-glass look (saturated blur + specular highlights + gradient sheen).' },
        rotation: { type: 'object', properties: { enabled: { type: 'boolean' }, ids: { type: 'array', items: { type: 'string' } }, intervalSec: { type: 'number' } }, description: 'Wallpaper playlist rotation; watcher switches wallpapers in-memory (config keeps the base entry). Minimum interval 30s.' },
        enabled: { type: 'boolean', description: 'Master switch for the injected theme. false tears down the injected layer.' },
      },
    },
    async run(args) {
      const cfg = readConfig();
      if (args.enabled !== undefined) cfg.enabled = args.enabled;
      if (args.preset !== undefined) {
        if (args.preset && !getPreset(args.preset)) throw new Error('Unknown preset: ' + args.preset + ' (see theme_presets)');
        cfg.theme.preset = args.preset || null;
        cfg.theme.overrides = {};
        cfg.overrides = {};
      }
      if (args.clearOverrides) { cfg.theme.overrides = {}; cfg.overrides = {}; }
      if (args.overrides && typeof args.overrides === 'object') {
        cfg.theme.overrides = { ...(cfg.theme.overrides || {}), ...args.overrides };
        cfg.overrides = { ...(cfg.overrides || {}), ...args.overrides };
      }
      if (args.surfaceOpacity !== undefined) cfg.surfaceOpacity = Math.max(0, Math.min(100, args.surfaceOpacity));
      if (args.sidebarOpacity !== undefined) cfg.sidebarOpacity = Math.max(0, Math.min(100, args.sidebarOpacity));
      if (args.bubbleOpacity !== undefined) cfg.bubbleOpacity = Math.max(30, Math.min(100, args.bubbleOpacity));
      if (args.glass) cfg.glass = { ...(cfg.glass || {}), ...args.glass };
      if (args.rotation) {
        cfg.rotation = { ...(cfg.rotation || {}), ...args.rotation };
        if (cfg.rotation.intervalSec !== undefined) cfg.rotation.intervalSec = Math.max(30, Number(cfg.rotation.intervalSec) || 600);
      }
      if (args.wallpaperPath !== undefined) {
        if (!args.wallpaperPath) { applyWallpaper(cfg, { id: null, type: null, mediaUrl: null }); }
        else {
          const p = String(args.wallpaperPath);
          if (!existsSync(p)) throw new Error('File not found: ' + p);
          const type = inferMediaType(p);
          if (!type) throw new Error('Unsupported media type: ' + extname(p) + ' (use mp4/webm/ogv/mov, html, jpg/png/gif/webp)');
          applyWallpaper(cfg, { id: 'custom:' + p, type, mediaUrl: toFileUrl(p), fit: args.fit ?? cfg.wallpaper?.fit ?? 'cover', dim: args.dim ?? cfg.wallpaper?.dim ?? 25, blur: args.blur ?? cfg.wallpaper?.blur ?? 0 });
        }
      } else if (args.wallpaperId !== undefined) {
        if (!args.wallpaperId) { applyWallpaper(cfg, { id: null, type: null, mediaUrl: null }); }
        else {
          const hit = resolveWallpaperId(scanOnce(), args.wallpaperId);
          if (!hit) throw new Error('Wallpaper not found: ' + args.wallpaperId + ' (run wallpaper_list)');
          if (!hit.playable && !args.forcePreview) {
            throw new Error('Wallpaper "' + hit.title + '" (' + hit.type + ') uses Wallpaper Engine proprietary runtime and cannot play inside ZCode. Retry with {"forcePreview":true} to show its preview image (' + (hit.previewPath ? 'available' : 'no preview file found') + ').');
          }
          const media = hit.playable ? hit.mediaPath : hit.previewPath;
          if (!media) throw new Error('Wallpaper "' + hit.title + '" has no usable media or preview.');
          const fallbackFit = hit.playable ? 'cover' : 'contain'; // scene previews are square — contain shows the full composition
          applyWallpaper(cfg, { id: hit.id, type: hit.playable ? hit.type : 'image', mediaUrl: toFileUrl(media), previewUrl: hit.previewPath ? toFileUrl(hit.previewPath) : null, fit: args.fit ?? (hit.previewFallback ? 'contain' : (cfg.wallpaper?.fit ?? 'cover')), dim: args.dim ?? cfg.wallpaper?.dim ?? 25, blur: args.blur ?? cfg.wallpaper?.blur ?? 0 });
        }
      } else {
        const wpUpdate = {};
        if (args.dim !== undefined) wpUpdate.dim = Math.max(0, Math.min(50, args.dim));
        if (args.blur !== undefined) wpUpdate.blur = Math.max(0, Math.min(40, args.blur));
        if (args.fit !== undefined) wpUpdate.fit = args.fit;
        if (Object.keys(wpUpdate).length) applyWallpaper(cfg, wpUpdate);
      }
      writeConfig(cfg);
      syncBridge(cfg); // plain-launch (patched asar) pick-up via bridge self-refresher
      await ensureWatcher();
      await new Promise(r => setTimeout(r, 2300)); // watcher polls config (700ms) + attaches; avoid reporting races
      const r = await runInject(['--status']);
      const plainLaunch = isAsarPatched();
      return {
        applied: r.json?.ok === true || r.json?.targets?.some(t => t.injected) === true || plainLaunch === true,
        config: { preset: cfg.theme.preset, wallpaper: cfg.wallpaper?.id, rotation: cfg.rotation, surfaceOpacity: cfg.surfaceOpacity, glass: cfg.glass },
        injection: r.json || { code: r.code, error: r.err || 'no output' },
        plainLaunch: plainLaunch === true ? 'patched asar detected - config synced to bridge, takes effect without CDP' : (plainLaunch === false ? 'asar not patched: CDP/themed-shortcut required' : 'asar state unknown'),
        hint: r.json?.targets?.some(t => t.injected) || plainLaunch === true ? undefined : 'Not applied yet. If ZCode was launched normally, run asar_patch (one-time, needs admin); otherwise use shortcut_install and the themed shortcut.',
      };
    },
  },
  {
    name: 'wallpaper_random',
    description: 'Apply a random playable Wallpaper Engine wallpaper (optionally restricted to video/web).',
    inputSchema: {
      type: 'object',
      properties: { kind: { type: 'string', enum: ['video', 'web', 'any'], description: 'Restrict to a kind (default any).' } },
    },
    async run(args) {
      const list = scanOnce().filter(w => w.playable && (args.kind === undefined || args.kind === 'any' || w.type === args.kind));
      if (!list.length) throw new Error('No playable wallpapers found.');
      const pick = list[Math.floor(Math.random() * list.length)];
      const cfg = readConfig();
      applyWallpaper(cfg, { id: pick.id, type: pick.type, mediaUrl: toFileUrl(pick.mediaPath), dim: cfg.wallpaper?.dim ?? 25, blur: cfg.wallpaper?.blur ?? 0, fit: cfg.wallpaper?.fit ?? 'cover' });
      writeConfig(cfg);
      syncBridge(cfg);
      await ensureWatcher();
      await new Promise(r => setTimeout(r, 1200));
      return { applied: pick.id, title: pick.title, type: pick.type };
    },
  },
  {
    name: 'palette_from_wallpaper',
    description: 'Extract a color palette from a wallpaper preview image (via renderer canvas) and optionally apply it: vivid color becomes --color-accent, dark tone becomes --color-surface-tint.',
    inputSchema: {
      type: 'object',
      properties: {
        wallpaperId: { type: 'string', description: 'Wallpaper id or unique prefix (scene wallpapers sample their preview).' },
        path: { type: 'string', description: 'Alternative: absolute path to an image file.' },
        apply: { type: 'boolean', description: 'Apply the extracted palette as token overrides (default false - returns suggestions only).' },
      },
    },
    async run(args) {
      const cfg = readConfig();
      let imgPath = args.path || null;
      if (!imgPath && args.wallpaperId) {
        const hit = resolveWallpaperId(scanOnce(), args.wallpaperId);
        if (!hit) throw new Error('Wallpaper not found: ' + args.wallpaperId);
        imgPath = hit.previewPath || hit.mediaPath;
        if (!imgPath) throw new Error('No image available for "' + hit.title + '"');
      }
      if (!imgPath) throw new Error('Provide wallpaperId or path.');
      const palette = await paletteFromFile(cfg.debugPort || 9333, imgPath);
      if (args.apply && palette.accent) {
        cfg.theme.overrides = { ...(cfg.theme.overrides || {}), '--color-accent': palette.accent, ...(palette.surfaceTint ? { '--color-surface-tint': palette.surfaceTint } : {}) };
        cfg.overrides = { ...(cfg.overrides || {}), ...(cfg.theme.overrides) };
        writeConfig(cfg);
        syncBridge(cfg);
        await ensureWatcher();
        await new Promise(r => setTimeout(r, 1200));
      }
      return { palette, applied: args.apply && !!palette.accent ? { '--color-accent': palette.accent, ...(palette.surfaceTint ? { '--color-surface-tint': palette.surfaceTint } : {}) } : false };
    },
  },
  {
    name: 'wallpaper_clear',
    description: 'Remove the wallpaper layer (keep theme preset).',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const cfg = readConfig();
      applyWallpaper(cfg, { id: null, type: null, mediaUrl: null });
      writeConfig(cfg);
      syncBridge(cfg);
      await ensureWatcher();
      await new Promise(r => setTimeout(r, 1200));
      const r = await runInject(['--status']);
      return { cleared: true, injection: r.json };
    },
  },
  {
    name: 'studio_status',
    description: 'Report plugin config and whether the theme is currently injected into the running ZCode window.',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const cfg = readConfig();
      const r = await runInject(['--status']);
      return {
        configPath: CONFIG_PATH,
        enabled: cfg.enabled,
        preset: cfg.theme?.preset,
        wallpaper: cfg.wallpaper?.id,
        rotation: cfg.rotation,
        glass: cfg.glass,
        bubbleOpacity: cfg.bubbleOpacity,
        debugPort: cfg.debugPort,
        settingsPage: {
          where: '设置 → 插件管理 → zcode-theme-studio → 设置（userConfig，分①连接/②壁纸/③主题/④效果/⑤轮换五组）',
          note: '设置页修改在下次会话生效；对话内 theme_apply 即时生效',
          trackedKeys: Object.keys(cfg._envSeen || {}).length,
        },
        injection: r.json || { code: r.code, error: r.err || 'no output' },
      };
    },
  },
  {
    name: 'shortcut_install',
    description: 'Create a desktop shortcut "ZCode (Themed).lnk" that launches ZCode with --remote-debugging-port so theming works. Safe: only adds the local debugging switch.',
    inputSchema: {
      type: 'object',
      properties: { port: { type: 'number', description: 'Debug port (default from config, 9333).' } },
    },
    async run(args) {
      const cfg = readConfig();
      const port = args.port || cfg.debugPort || 9333;
      const ps1 = join(here, 'assets', 'shortcut-helper.ps1');
      const r = await new Promise(res => {
        const c = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-Port', String(port)], { timeout: 30000 });
        let out = '', err = '';
        c.stdout.on('data', d => { out += d; });
        c.stderr.on('data', d => { err += d; });
        c.on('close', code => res({ code, out: out.trim(), err: err.trim() }));
        c.on('error', e => res({ code: -1, out: '', err: String(e) }));
      });
      return { installed: r.code === 0, port, output: r.out || r.err };
    },
  },
  {
    name: 'asar_patch',
    description: 'ONE-TIME admin operation: patch ZCode app.asar so the theme also works on normal launches (no debug port needed). Writes a loader into out/renderer/index.html and generates the bridge engine file. Creates a timestamped backup automatically; restore with {"restore":true}. ZCode must be closed while patching. On failure due to permissions, relaunch ZCode as administrator.',
    inputSchema: {
      type: 'object',
      properties: {
        restore: { type: 'boolean', description: 'Restore the most recent backup instead of patching.' },
      },
    },
    async run(args) {
      const target = asarPath();
      if (!existsSync(target)) throw new Error('app.asar not found at ' + target + ' - set THEME_STUDIO_ASAR_PATH if ZCode is installed elsewhere.');
      if (args.restore) {
        const r = await new Promise(res => {
          const c = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(here, 'assets', 'asar-restore.ps1'), '-Asar', target], { timeout: 60000 });
          let out = '', err = '';
          c.stdout.on('data', d => { out += d; });
          c.stderr.on('data', d => { err += d; });
          c.on('close', code => res({ code, out: out.trim(), err: err.trim() }));
          c.on('error', e => res({ code: -1, out: '', err: String(e) }));
        });
        return { restored: r.code === 0, output: r.out || r.err };
      }
      const state = isAsarPatched();
      if (state === true) {
        // already patched: just refresh the bridge with current config
        const cfg = readConfig();
        syncBridge(cfg);
        return { alreadyPatched: true, bridgeRefreshed: true, note: 'asar already patched; bridge refreshed with current config. Restart ZCode to see changes.' };
      }
      const cfg = readConfig();
      const bPath = bridgePath();
      const bridgeUrl = fileUrl(bPath);
      const ps1 = join(here, 'assets', 'asar-patch.ps1');
      const r = await new Promise(res => {
        const c = spawn('powershell.exe', [
          '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1,
          '-Asar', target, '-PluginRoot', here, '-BridgeUrl', bridgeUrl, '-BridgePath', bPath,
        ], { timeout: 180000 });
        let out = '', err = '';
        c.stdout.on('data', d => { out += d; });
        c.stderr.on('data', d => { err += d; });
        c.on('close', code => res({ code, out: out.trim(), err: err.trim() }));
        c.on('error', e => res({ code: -1, out: '', err: String(e) }));
      });
      if (r.code !== 0) {
        return { patched: false, output: r.out || r.err, hint: r.out.includes('administrator') || r.err.includes('denied') ? 'Permission denied: relaunch ZCode as administrator and retry asar_patch.' : undefined };
      }
      syncBridge(cfg);
      // record opt-in so the SessionStart self-heal may silently re-patch after ZCode updates
      try {
        const dataDir = process.env.ZCODE_PLUGIN_DATA || join(homedir(), '.zcode', 'zcode-theme-studio');
        mkdirSync(dataDir, { recursive: true });
        writeFileSync(join(dataDir, 'asar-patch.optin'), new Date().toISOString());
      } catch {}
      let parsed = {};
      try { parsed = JSON.parse(r.out); } catch {}
      return { patched: true, ...parsed, note: 'Restart ZCode (normal launch) - theme now applies without the debug port. After future ZCode updates the patch auto-reapplies at session start.' };
    },
  },
  {
    name: 'wallpaper_thumbs',
    description: 'Copy wallpaper preview images to a directory (for rendering preview grids in chat). Returns file mapping.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: 'Wallpaper ids; empty = first 24 playable.' },
        outDir: { type: 'string', description: 'Target directory for copied previews.' },
        max: { type: 'number', description: 'Max previews (default 24).' },
      },
    },
    async run(args) {
      if (!args.outDir) throw new Error('outDir required');
      const list = scanOnce();
      let picks = (args.ids?.length ? args.ids.map(id => findById(list, id)).filter(Boolean) : list.filter(w => w.playable && w.previewPath));
      picks = picks.slice(0, Math.min(args.max ?? 24, 48));
      mkdirSync(args.outDir, { recursive: true });
      const files = [];
      for (const w of picks) {
        const ext = w.previewPath.match(/\.(gif|jpe?g|png)$/i)?.[0] || '.jpg';
        const dest = join(args.outDir, 'wp-' + w.id + ext);
        try { copyFileSync(w.previewPath, dest); files.push({ id: w.id, title: w.title, type: w.type, file: dest }); } catch {}
      }
      return { count: files.length, files };
    },
  },
];

// ---------- JSON-RPC over stdio ----------
const serverInfo = { name: 'zcode-theme-studio', version: '1.2.0' };
function reply(id, result) { writeOut({ jsonrpc: '2.0', id, result }); }
function replyErr(id, code, message) { writeOut({ jsonrpc: '2.0', id, error: { code, message } }); }
function writeOut(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }

// Settings page (userConfig) sync at startup: seeds config.json on first run and
// applies changes the user made in 设置 → 插件管理; then hot-pushes via the watcher.
try {
  try { spawn(process.execPath, [join(here, 'ui-daemon.mjs')], { detached: true, stdio: 'ignore' }).unref(); } catch {}
  if (syncEnvSettings()) ensureWatcher();
} catch (e) { log('settings sync failed: ' + (e.message || e)); }

function textResult(payload, isError = false) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 1) }], isError };
}

let buffer = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (line) handleMessage(line).catch(e => console.error('handler error:', e));
  }
});
process.stdin.on('end', () => process.exit(0));

async function handleMessage(line) {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return reply(id, { protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo });
  }
  if (method === 'ping') return reply(id, {});
  if (!id) return; // notification
  if (method === 'tools/list') {
    return reply(id, { tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
  }
  if (method === 'tools/call') {
    const tool = TOOLS.find(t => t.name === params?.name);
    if (!tool) return reply(id, textResult({ error: 'unknown tool: ' + params?.name }, true));
    try {
      const result = await tool.run(params.arguments || {});
      return reply(id, textResult(result));
    } catch (e) {
      return reply(id, textResult({ error: String(e.message || e) }, true));
    }
  }
  return replyErr(id, -32601, 'method not found: ' + method);
}
