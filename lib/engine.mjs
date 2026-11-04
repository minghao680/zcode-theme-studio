// Shared injection engine: bootstrap source (runs inside the renderer) and
// payload builder. Single source of truth used by inject.mjs and watch.mjs.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { buildThemeCss, getPreset, listPresets } from './themes.mjs';

const here = dirname(fileURLToPath(import.meta.url));

export function loadSelectors() {
  try {
    return JSON.parse(readFileSync(join(here, 'selectors.json'), 'utf-8'));
  } catch { return { shellCandidates: [], glassCandidates: [] }; }
}

export function toFileUrl(p) {
  let u = 'file:///' + encodeURI(String(p).replace(/\\/g, '/'));
  u = u.replace(/#/g, '%23').replace(/\?/g, '%3F');
  return u;
}

// Palette tokens surfaced by the sidebar panel's color pickers. The panel needs a
// concrete hex per swatch: computed styles are color-mix()/transparent once a
// wallpaper is active, so the host resolves them here instead.
const PALETTE_TOKENS = [
  ['--color-background', '\u4e3b\u80cc\u666f'], ['--color-background-alt', '\u80cc\u666f\u53d8\u4f53'],
  ['--color-card', '\u5361\u7247'], ['--color-popover', '\u5f39\u7a97'],
  ['--color-secondary', '\u6b21\u7ea7\u8868\u9762'], ['--color-sidebar', '\u4fa7\u680f'],
  ['--color-input', '\u8f93\u5165\u6846'], ['--color-tab', '\u6807\u7b7e\u9875'],
  ['--color-foreground', '\u4e3b\u6587\u5b57'], ['--color-foreground-subtle', '\u6b21\u8981\u6587\u5b57'],
  ['--color-foreground-subtlest', '\u5f31\u6587\u5b57'], ['--color-primary', '\u4e3b\u6309\u94ae\u5b57'],
  ['--color-accent', '\u5f3a\u8c03\u4e3b\u8272'], ['--color-accent-primary', '\u94fe\u63a5/\u4e3b\u8272'],
  ['--color-border', '\u901a\u7528\u8fb9\u6846'], ['--color-card-border', '\u5361\u7247\u8fb9\u6846'],
  ['--color-popover-border', '\u5f39\u7a97\u8fb9\u6846'], ['--color-input-border', '\u8f93\u5165\u8fb9\u6846'],
  ['--color-destructive', '\u5371\u9669/\u5220\u9664'], ['--color-destructive-foreground', '\u5371\u9669\u6587\u5b57'],
  ['--color-terminal-green', '\u7ec8\u7aef\u7eff'], ['--color-terminal-bright-yellow', '\u7ec8\u7aef\u9ec4'],
  ['--color-terminal-selection', '\u7ec8\u7aef\u9009\u4e2d'],
];

/** Resolve each palette token to a concrete #rrggbb for picker initialisation. */
function resolvePalette(preset, overrides, themeOverrides) {
  const base = preset?.tokens || {};
  const ov = { ...(themeOverrides || {}), ...(overrides || {}) };
  const tint = ov['--color-surface-tint'] || base['--color-surface-tint'] || '#202020';
  const sidebarTint = ov['--color-sidebar-tint'] || base['--color-sidebar-tint'] || tint;
  const fg = ov['--color-foreground'] || base['--color-foreground'] || '#eaeaea';
  const accent = ov['--color-accent'] || base['--color-accent'] || '#38bdf8';
  const border = ov['--color-border'] || base['--color-border'] || '#ffffff1a';
  // Engine-derived tokens show the color they are derived from.
  const derived = {
    '--color-background': tint,
    '--color-background-alt': tint,
    '--color-card': tint,
    '--color-popover': tint,
    '--color-secondary': tint,
    '--color-sidebar': sidebarTint,
    '--color-input': tint,
    '--color-tab': tint,
    '--color-foreground-subtle': fg,
    '--color-foreground-subtlest': fg,
    '--color-primary': ov['--color-primary'] || base['--color-primary'] || '#ffffff',
    '--color-accent-primary': accent,
    '--color-card-border': border,
    '--color-popover-border': border,
    '--color-input-border': border,
    '--color-destructive': '#ff5c5c',
    '--color-destructive-foreground': '#ffffff',
    '--color-terminal-green': '#46bf72',
    '--color-terminal-bright-yellow': '#ffb26b',
    '--color-terminal-selection': '#4099ff',
  };
  const out = {};
  for (const [token] of PALETTE_TOKENS) {
    let v = ov[token] || base[token] || derived[token] || null;
    if (!v) continue;
    const m = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(v);
    if (m) out[token] = '#' + m[1].toLowerCase();
  }
  return out;
}

export function buildPayload(cfg, catalog) {
  const theme = cfg.theme || {};
  const wp = cfg.wallpaper || {};
  const sel = loadSelectors();
  // Panel UI reads/writes the payload's top-level `overrides`; the config file
  // stores them under theme.overrides. Accept both, prefer the top-level.
  const overrides = { ...(theme.overrides || {}), ...(cfg.overrides || {}) };
  const css = buildThemeCss({
    preset: theme.preset,
    overrides,
    wallpaper: wp.id ? wp : null,
    surfaceOpacity: cfg.surfaceOpacity,
    sidebarOpacity: cfg.sidebarOpacity,
    bubbleOpacity: cfg.bubbleOpacity,
    glass: cfg.glass,
  });
  // Light presets need a light frosted dim layer to stay readable over wallpaper.
  const presetDark = theme.preset ? (getPreset(theme.preset)?.dark ?? true) : true;
  const dimRgb = wp.dimRgb || (presetDark ? '0,0,0' : '255,255,255');
  return {
    enabled: cfg.enabled !== false,
    css,
    wallpaper: wp.id && wp.mediaUrl ? {
      id: wp.id, type: wp.type, mediaUrl: wp.mediaUrl, previewUrl: wp.previewUrl || null,
      fit: wp.fit || 'cover', dim: wp.dim ?? 25, blur: wp.blur ?? 0, dimRgb,
    } : null,
    glass: cfg.glass || { enabled: true, blur: 16, style: 'frosted' },
    shellCandidates: sel.shellCandidates || [],
    glassCandidates: sel.glassCandidates || [],
    // panel data (sidebar UI): preset list + browsable wallpaper catalog
    presets: listPresets(),
    catalog: catalog || [],
    overrides: { ...overrides },
    palette: resolvePalette(getPreset(theme.preset), overrides, theme.overrides),
    active: {
      preset: theme.preset || null,
      fit: wp.fit || 'cover',
      dim: wp.dim ?? 25,
      blur: wp.blur ?? 0,
      surfaceOpacity: cfg.surfaceOpacity ?? 88,
      sidebarOpacity: cfg.sidebarOpacity ?? 76,
      bubbleOpacity: cfg.bubbleOpacity ?? 78,
    },
  };
}

// Bootstrap: plain ES5, no template literals. document-start scripts run before
// <body> exists, so DOM work is deferred to DOMContentLoaded. Every injection
// REINSTALLS the engine functions (cheap + idempotent): an older watcher's copy
// may still be live in the page, and a version-gated early-return would keep
// calling stale code instead of upgrading it.
export const BOOTSTRAP = `
(function () {
  var CFG = window.__ZTHEME_CONFIG || {};
  window.__ZTHEME_ENGINE_VERSION = '1.2';
  function ensureStyle(id, css) {
    var el = document.getElementById(id);
    if (!el) { el = document.createElement('style'); el.id = id; (document.head || document.documentElement).appendChild(el); }
    if (el.textContent !== css) el.textContent = css;
    return el;
  }
  // Remove an element ONLY if it is one of our injected layers (marked with
  // data-zt-layer). A bare getElementById+remove is dangerous: host DOM or our own
  // panel may legitimately use the same id (this bug deleted the dim slider).
  function removeById(id) {
    var el = document.getElementById(id);
    if (el && el.getAttribute('data-zt-layer') === '1') el.remove();
  }
  // Dim/blur overlay is cheap to rebuild and never causes a flash (no media reload).
  function buildDim(w, layer) {
    removeById('zt-dim');
    if (!w || (!(w.dim > 0) && !(w.blur > 0))) return;
    var dim = document.createElement('div');
    dim.id = 'zt-dim';
    dim.setAttribute('data-zt-layer', '1');
    var rgb = w.dimRgb || '0,0,0';
    dim.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;background:rgba(' + rgb + ',' + (w.dim / 100) + ');'
      + (w.blur > 0 ? 'backdrop-filter:blur(' + w.blur + 'px);' : '');
    document.body.insertBefore(dim, layer ? layer.nextSibling : document.body.firstChild);
  }
  function buildWallpaper(w) {
    if (!w || !w.mediaUrl) { removeById('zt-wallpaper'); removeById('zt-dim'); window.__ZTHEME_WP_KEY = ''; return; }
    // Reuse the existing layer when the media is unchanged: destroying and
    // recreating a <video>/<iframe> restarts playback and flashes. Only dim/blur
    // changes are applied in place.
    var key = w.type + '|' + w.mediaUrl + '|' + (w.fit || 'cover') + '|' + (w.previewUrl || '');
    var layer = document.getElementById('zt-wallpaper');
    if (layer && window.__ZTHEME_WP_KEY === key) { buildDim(w, layer); return; }
    removeById('zt-wallpaper'); removeById('zt-dim');
    window.__ZTHEME_WP_KEY = key;
    layer = document.createElement('div');
    layer.id = 'zt-wallpaper';
    layer.setAttribute('data-zt-layer', '1');
    layer.style.cssText = 'position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;';
    if (w.type === 'video') {
      var v = document.createElement('video');
      v.src = w.mediaUrl; v.muted = true; v.loop = true; v.autoplay = true;
      v.setAttribute('playsinline', '');
      v.style.cssText = 'width:100%;height:100%;object-fit:' + (w.fit === 'contain' ? 'contain;background:#000;' : 'cover;');
      layer.appendChild(v);
      try { v.play().catch(function () {}); } catch (e) {}
    } else if (w.type === 'web') {
      var f = document.createElement('iframe');
      f.src = w.mediaUrl;
      f.setAttribute('allow', 'autoplay');
      f.setAttribute('referrerpolicy', 'no-referrer');
      f.style.cssText = 'width:100%;height:100%;border:0;pointer-events:none;';
      layer.appendChild(f);
    } else {
      // Static image — rendered as <img> with object-fit (dsh-wallpaper-engine
      // style) so a broken source can fall back to the preview via onerror.
      var mkImg = function (cls, src, fit) {
        var im = document.createElement('img');
        im.src = src;
        im.alt = '';
        im.setAttribute('data-zt-role', cls);
        im.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:' + (fit === 'contain' ? 'contain' : 'cover') + ';';
        return im;
      };
      var fallback = function (im) {
        if (!w.previewUrl || im.getAttribute('data-fallback') === '1') return;
        im.setAttribute('data-fallback', '1');
        im.src = w.previewUrl;
      };
      if (w.fit === 'contain') {
        var fill = document.createElement('img');
        fill.src = w.mediaUrl; fill.alt = '';
        fill.style.cssText = 'position:absolute;inset:-48px;width:calc(100% + 96px);height:calc(100% + 96px);object-fit:cover;filter:blur(28px) brightness(.62);transform:translateZ(0);';
        fill.onerror = function () { if (w.previewUrl) fill.src = w.previewUrl; };
        layer.appendChild(fill);
        var main = mkImg('main', w.mediaUrl, 'contain');
        main.onerror = function () { fallback(main); if (fill.src !== main.src && w.previewUrl) fill.src = w.previewUrl; };
        layer.appendChild(main);
      } else {
        var img = mkImg('main', w.mediaUrl, 'cover');
        img.onerror = function () { fallback(img); };
        layer.appendChild(img);
      }
    }
    document.body.insertBefore(layer, document.body.firstChild);
    buildDim(w, layer);
  }
  function applyShell() {
    var sels = CFG.shellCandidates || [];
    for (var i = 0; i < sels.length; i++) {
      try {
        var ns = document.querySelectorAll(sels[i]);
        for (var k = 0; k < ns.length; k++) {
          ns[k].style.setProperty('background', 'transparent', 'important');
          ns[k].setAttribute('data-zt-shell', '1');
        }
      } catch (e) {}
    }
    var glassOn = CFG.glass && CFG.glass.enabled;
    var liquid = glassOn && CFG.glass.style === 'liquid';
    var matched = [];
    if (glassOn) {
      var b = liquid
        ? 'blur(' + (CFG.glass.blur || 16) + 'px) saturate(1.8) brightness(1.04)'
        : 'saturate(1.35) blur(' + (CFG.glass.blur || 16) + 'px)';
      var gs = CFG.glassCandidates || [];
      for (var j = 0; j < gs.length; j++) {
        try {
          var gn = document.querySelectorAll(gs[j]);
          for (var m = 0; m < gn.length; m++) {
            if (liquid) {
              gn[m].classList.add('zt-glass');
              gn[m].style.removeProperty('backdrop-filter'); // texture comes from the .zt-glass rule
            } else {
              gn[m].classList.remove('zt-glass');
              gn[m].style.setProperty('backdrop-filter', b, 'important');
            }
            gn[m].setAttribute('data-zt-glass', '1');
            matched.push(gn[m]);
          }
        } catch (e) {}
      }
    }
    // sweep stale glass markers (candidates removed / glass disabled)
    try {
      var stale = document.querySelectorAll('[data-zt-glass]');
      for (var q = 0; q < stale.length; q++) {
        if (!glassOn || matched.indexOf(stale[q]) === -1) {
          stale[q].classList.remove('zt-glass');
          stale[q].style.removeProperty('backdrop-filter');
          stale[q].removeAttribute('data-zt-glass');
        }
      }
    } catch (e) {}
  }
  // Overrides applied as a SEPARATE style tag so the panel can change them live
  // without a full CSS rebuild from the host: __ZTHEME_APPLY with a payload that
  // lacks a new "css" string still updates token overrides instantly.
  function applyOverrideStyle(overrides) {
    var el = document.getElementById('zt-overrides');
    var keys = [];
    for (var k in overrides) { if (Object.prototype.hasOwnProperty.call(overrides, k)) keys.push(k); }
    if (!keys.length) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('style'); el.id = 'zt-overrides'; (document.head || document.documentElement).appendChild(el); }
    var css = ':root, html.dark, html {';
    for (var i = 0; i < keys.length; i++) css += keys[i] + ':' + overrides[keys[i]] + ';';
    css += '}';
    if (el.textContent !== css) el.textContent = css;
  }
  function apply() {
    CFG = window.__ZTHEME_CONFIG || CFG;
    if (!CFG || CFG.enabled === false) { if (window.__ZTHEME_TEARDOWN) window.__ZTHEME_TEARDOWN(); return; }
    if (CFG.css) ensureStyle('zt-style', CFG.css);
    // live overrides (panel color pickers): highest priority, separate layer
    applyOverrideStyle(CFG.overrides || {});
    if (!document.getElementById('zt-root-z')) {
      var s = document.createElement('style');
      s.id = 'zt-root-z';
      s.textContent = '#root{position:relative;z-index:1;background:transparent !important;}html,body{background:transparent !important;}';
      (document.head || document.documentElement).appendChild(s);
    }
    buildWallpaper(CFG.wallpaper);
    applyShell();
    window.__ZTHEME_INSTALLED = true;
  }
  window.__ZTHEME_APPLY = function (newCfg) {
    if (newCfg) { window.__ZTHEME_CONFIG = newCfg; }
    apply();
  };
  window.__ZTHEME_TEARDOWN = function () {
    removeById('zt-wallpaper'); removeById('zt-dim'); removeById('zt-style'); removeById('zt-root-z'); removeById('zt-overrides');
    window.__ZTHEME_WP_KEY = '';
    if (window.__ZTHEME_TIMER) { clearInterval(window.__ZTHEME_TIMER); window.__ZTHEME_TIMER = null; }
    try {
      document.querySelectorAll('[data-zt-shell]').forEach(function (n) {
        n.style.removeProperty('background'); n.removeAttribute('data-zt-shell');
      });
      document.querySelectorAll('[data-zt-glass]').forEach(function (n) {
        n.classList.remove('zt-glass');
        n.style.removeProperty('backdrop-filter'); n.removeAttribute('data-zt-glass');
      });
    } catch (e) {}
    window.__ZTHEME_INSTALLED = false;
  };
  function start() {
    // Always replace the self-heal timer: a stale timer from an older engine
    // version would keep re-applying outdated inline styles forever.
    if (window.__ZTHEME_TIMER) { clearInterval(window.__ZTHEME_TIMER); }
    window.__ZTHEME_TIMER = setInterval(function () {
      try {
        if (!window.__ZTHEME_CONFIG || window.__ZTHEME_CONFIG.enabled === false) { if (window.__ZTHEME_TEARDOWN) window.__ZTHEME_TEARDOWN(); return; }
        // Media rebuild is guarded (rebuilding the video restarts playback = flash).
        // applyShell itself is unconditional: it is idempotent and MUST re-run when
        // React swaps the shell DOM (e.g. after the startup splash is replaced by
        // the real UI, our transparency marks live on elements that got removed).
        var wp = CFG.wallpaper;
        var needWp = wp && wp.mediaUrl && !document.getElementById('zt-wallpaper');
        var needDim = wp && wp.mediaUrl && !document.getElementById('zt-dim') && ((wp.dim > 0) || (wp.blur > 0));
        var needCss = CFG.css && !document.getElementById('zt-style');
        var needRoot = !document.getElementById('zt-root-z');
        var needOv = CFG.overrides && Object.keys(CFG.overrides).length > 0 && !document.getElementById('zt-overrides');
        if (needWp || needDim || needCss || needRoot || needOv) apply();
        else applyShell();
      } catch (e) {}
    }, 3000);
    window.__ZTHEME_BOOTSTRAP_ACTIVE = true;
    apply();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { start(); }, { once: true });
  } else {
    start();
  }
})();
`;
