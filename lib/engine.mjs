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

export const UI_PORT = 9337;

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
  // Scene live rendering fields: catalog lookup for the active wallpaper id.
  // Self-heal: configs saved while scene wallpapers were "not playable" carry
  // type 'image' — the catalog is authoritative, upgrade it here.
  var catForActive = wp.id ? ((catalog || []).find(function (c) { return c.id === wp.id; }) || null) : null;
  if (catForActive && catForActive.sceneSrc) wp.type = 'scene';
  var sceneFields = catForActive && catForActive.sceneSrc ? {
    sceneSrc: catForActive.sceneSrc,
    mediaBase: 'http://127.0.0.1:' + UI_PORT + '/we/media/' + encodeURIComponent(wp.id),
    rendererUrl: 'http://127.0.0.1:' + UI_PORT + '/we/renderer.html'
  } : null;
  // Light presets need a light frosted dim layer to stay readable over wallpaper.
  const presetDark = theme.preset ? (getPreset(theme.preset)?.dark ?? true) : true;
  const dimRgb = wp.dimRgb || (presetDark ? '0,0,0' : '255,255,255');
  return {
    enabled: cfg.enabled !== false,
    css,
    wallpaper: wp.id && wp.mediaUrl ? {
      id: wp.id, type: wp.type, mediaUrl: wp.mediaUrl,
      fit: wp.fit || 'cover', dim: wp.dim ?? 25, blur: wp.blur ?? 0, dimRgb,
      sceneSrc: (sceneFields || {}).sceneSrc || null,
      mediaBase: (sceneFields || {}).mediaBase || null,
      rendererUrl: (sceneFields || {}).rendererUrl || null,
      engineUrl: 'http://127.0.0.1:' + UI_PORT + '/we/engine.js',
    } : null,
    glass: cfg.glass || { enabled: true, blur: 16, style: 'frosted' },
    shellCandidates: sel.shellCandidates || [],
    glassCandidates: sel.glassCandidates || [],
    // panel data (sidebar UI): preset list + browsable wallpaper catalog
    presets: listPresets(),
    // user-saved custom schemes (name + preset + overrides + glass + opacities)
    customPresets: cfg.customPresets || [],
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
  // Backdrop blur belongs on the WALLPAPER LAYER, never on a full-screen overlay:
  // a backdrop-filter overlay also blurs whatever is behind it when the wallpaper
  // has not painted yet (startup), so the whole window turns into a tinted blurry
  // veil that only a re-apply clears. Blurring the layer itself can only ever
  // affect the wallpaper, and the slight upscale hides blur's transparent fringe.
  function applyLayerBlur(layer, w) {
    if (!layer) return;
    var b = (w && w.blur) || 0;
    if (b > 0) {
      layer.style.filter = 'blur(' + b + 'px)';
      layer.style.transform = 'scale(' + (1 + Math.min(b, 40) / 200).toFixed(4) + ')';
      layer.style.transformOrigin = 'center center';
    } else {
      layer.style.filter = '';
      layer.style.transform = '';
    }
  }
  function buildDim(w, layer) {
    removeById('zt-dim');
    // No wallpaper layer on screen -> no dim. A dim overlay over the bare theme
    // background is exactly the "whole window tinted at startup" symptom: during
    // boot the wallpaper has not painted yet, and any overlay that survives
    // independently of it darkens the app itself.
    var wpLayer = layer || document.getElementById('zt-wallpaper');
    if (!w || !(w.dim > 0) || !wpLayer) return;
    var dim = document.createElement('div');
    dim.id = 'zt-dim';
    dim.setAttribute('data-zt-layer', '1');
    var rgb = w.dimRgb || '0,0,0';
    // Tint only — blur is handled by applyLayerBlur so the UI / theme background
    // can never be blurred by this overlay.
    dim.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;background:rgba(' + rgb + ',' + (w.dim / 100) + ');';
    document.body.insertBefore(dim, wpLayer.nextSibling);
  }
  // Auto readability: sample the wallpaper brightness (its preview is a faithful
  // proxy) and deepen the dim overlay when it clashes with the preset polarity —
  // dark presets need a darker backdrop on bright wallpapers, light presets the
  // opposite. The user slider sets the base; this only ever strengthens it.
  var autoDimSampling = {};
  function autoDimFor(w) {
    if (!w) { applyAutoDim(w, 0); return; }
    var src = w.previewUrl || (w.type === 'image' ? w.mediaUrl : null);
    if (!src) { applyAutoDim(w, 0); return; }
    var key = src + '|' + (w.dimRgb || '0,0,0') + '|' + (w.dim || 0);
    if (autoDimSampling[key]) { applyAutoDim(w, autoDimSampling[key]); return; }
    fetch(src).then(function (r) { return r.blob(); }).then(function (blob) {
      return createImageBitmap(blob);
    }).then(function (bmp) {
      try {
        var c = document.createElement("canvas"); c.width = 32; c.height = 18;
        var ctx = c.getContext("2d");
        ctx.drawImage(bmp, 0, 0, 32, 18);
        var d = ctx.getImageData(0, 0, 32, 18).data, sum = 0, n = 0;
        for (var i = 0; i < d.length; i += 4) { sum += d[i] + d[i + 1] + d[i + 2]; n += 3; }
        var avg = sum / n;
        var boost = avg > 180 ? 30 : avg > 150 ? 20 : avg > 120 ? 10 : 0;
        autoDimSampling[key] = { avg: avg, boost: boost };
        applyAutoDim(w, boost);
      } catch (e) { applyAutoDim(w, 0); }
    }).catch(function () { applyAutoDim(w, 0); });
  }
  function applyAutoDim(w, boost) {
    // w is null whenever no wallpaper is active (autoDimFor(null) defers here,
    // and a throw would kill the rest of apply() — glass, shell, UI all die).
    if (!w) { var dl = document.getElementById('zt-dim'); if (dl) dl.remove(); return; }
    var dimEl = document.getElementById('zt-dim');
    var userDim = w.dim || 0;
    var eff = Math.min(62, Math.max(userDim, boost));
    if (eff <= 0 && !(w.blur > 0)) { if (dimEl) dimEl.remove(); return; }
    if (!dimEl) {
      dimEl = document.createElement('div');
      dimEl.id = 'zt-dim';
      dimEl.setAttribute('data-zt-layer', '1');
      dimEl.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;';
      var layer = document.getElementById("zt-wallpaper");
      document.body.insertBefore(dimEl, layer ? layer.nextSibling : document.body.firstChild);
    }
    var rgb = w.dimRgb || '0,0,0';
    dimEl.style.background = 'rgba(' + rgb + ',' + (eff / 100) + ');';
    // blur lives on the wallpaper layer (applyLayerBlur) — never on this overlay,
    // or it blurs the whole app when the wallpaper has not painted yet.
    dimEl.style.backdropFilter = '';
  }
  // Boot gate companion to the html[data-zt-boot] CSS block: keep wallpaper-mode
  // translucent surfaces OPAQUE until the wallpaper is actually on screen, then
  // release. Without it, see-through panels stack on the app's own background
  // during startup and read as a tinted fog over the whole window.
  function setBootGate(on) {
    try {
      var h = document.documentElement;
      if (on) h.setAttribute('data-zt-boot', '1');
      else h.removeAttribute('data-zt-boot');
    } catch (e) {}
  }
  function releaseBootGateWhenPainted(layer) {
    if (!layer) { setBootGate(false); return; }
    var done = false;
    var release = function () { if (done) return; done = true; setBootGate(false); };
    var v = layer.querySelector('video');
    if (v) {
      if (v.readyState >= 2) { release(); return; }
      v.addEventListener('loadeddata', release, { once: true });
      v.addEventListener('canplay', release, { once: true });
      setTimeout(release, 4000); // never stay gated on a broken/offline video
      return;
    }
    var im = layer.querySelector('img');
    if (im) {
      if (im.complete && im.naturalWidth) { release(); return; }
      im.addEventListener('load', release, { once: true });
      im.addEventListener('error', release, { once: true });
      setTimeout(release, 4000);
      return;
    }
    var fr = layer.querySelector('iframe');
    if (fr) { fr.addEventListener('load', release, { once: true }); setTimeout(release, 4000); return; }
    // CSS-background image / canvas: one frame is enough (no load event to await)
    setTimeout(release, 120);
  }
  function buildWallpaper(w) {
    if (!w || !w.mediaUrl) { removeById('zt-wallpaper'); removeById('zt-dim'); window.__ZTHEME_WP_KEY = ''; setBootGate(false); return; }
    // Reuse the existing layer when the media is unchanged: destroying and
    // recreating a <video>/<iframe> restarts playback and flashes. Only dim/blur
    // changes are applied in place.
    var key = w.type + '|' + w.mediaUrl + '|' + (w.fit || 'cover');
    var layer = document.getElementById('zt-wallpaper');
    if (layer && window.__ZTHEME_WP_KEY === key) {
      applyLayerBlur(layer, w); buildDim(w, layer);
      // Already painted in a previous pass -> the gate must stay open, otherwise
      // a later apply() would re-fog an already-working window.
      releaseBootGateWhenPainted(layer);
      return;
    }
    removeById('zt-wallpaper'); removeById('zt-dim');
    window.__ZTHEME_WP_KEY = key;
    layer = document.createElement('div');
    layer.id = 'zt-wallpaper';
    layer.setAttribute('data-zt-layer', '1');
    layer.style.cssText = 'position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;';
    applyLayerBlur(layer, w);
    var mkImg = function (cls, src, fit) {
      var im = document.createElement('img');
      im.src = src; im.alt = '';
      im.setAttribute('data-zt-role', cls);
      im.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:' + (fit === 'contain' ? 'contain' : 'cover') + ';';
      return im;
    };
    if (w.type === 'video') {
      // contain on a wide window leaves pillarbox bars. Instead of painting them
      // black, underlay a blurred COPY of the same video to fill: the video is
      // letterboxed on top, the fill covers the bars edge to edge.
      if (w.fit === 'contain') {
        var vFill = document.createElement('video');
        vFill.src = w.mediaUrl; vFill.muted = true; vFill.loop = true; vFill.autoplay = true;
        vFill.setAttribute('playsinline', '');
        vFill.setAttribute('aria-hidden', 'true');
        vFill.style.cssText = 'position:absolute;inset:-24px;width:calc(100% + 48px);height:calc(100% + 48px);'
          + 'object-fit:cover;filter:blur(28px) brightness(.7);transform:translateZ(0);';
        layer.appendChild(vFill);
        try { vFill.play().catch(function () {}); } catch (e) {}
      }
      var v = document.createElement('video');
      v.src = w.mediaUrl; v.muted = true; v.loop = true; v.autoplay = true;
      v.setAttribute('playsinline', '');
      v.style.cssText = 'position:relative;width:100%;height:100%;object-fit:' + (w.fit === 'contain' ? 'contain;' : 'cover;')
        + (w.fit === 'contain' ? 'background:transparent;' : '');
      layer.appendChild(v);
      try { v.play().catch(function () {}); } catch (e) {}
    } else if (w.type === 'scene' && w.sceneSrc && w.mediaBase) {
      // Scene live rendering via WebWallGL, IN-PROCESS (no iframe): measured a
      // fully working 960x540 canvas in-process; in-iframe asset probes (HEAD
      // then GET) behaved differently. Static preview renders first, the WebGL
      // canvas fades in once it actually produces frames.
      // Static preview is a PLACEHOLDER, never the finished look: a WE preview
      // gif is ~200x150, so covering a 1700px window magnifies it 8x into a
      // blurry slab. Keep it at natural size, letterboxed on a dark backdrop.
      var sceneImg = mkImg('scene-preview', w.mediaUrl, 'contain');
      sceneImg.style.objectFit = 'contain';
      sceneImg.style.background = '#0a0c10';
      sceneImg.style.imageRendering = 'auto';
      layer.appendChild(sceneImg);
      var canvasHost = document.createElement('div');
      canvasHost.setAttribute('data-zt-scene', '1');
      canvasHost.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;opacity:0;transition:opacity .35s linear;';
      layer.appendChild(canvasHost);
      var report = function (stage, detail) {
        try {
          fetch((w.engineUrl || "http://127.0.0.1:9337").replace(new RegExp("/we/[a-z]+\\.js$"), "") + "/zt/scene-report", {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({
              id: w.id, stage: stage, detail: detail == null ? null : String(detail).slice(0, 300),
              dpr: window.devicePixelRatio, vw: window.innerWidth, vh: window.innerHeight,
              ts: Date.now()
            }),
          }).catch(function () {});
        } catch (e) {}
      };
      // Persistent mounting: the daemon may not be listening yet at boot (it
      // starts in parallel), so a bounded retry used to give up during boot and
      // leave the static preview up forever. This arm() loop keeps trying for the
      // whole page lifetime with backoff, and re-arms if the canvas is lost.
      window.__ZTHEME_SCENE_TRIES = 0;
      var mountedOk = false;
      var lastTryAt = 0;
      var mountScene = function (attempt) {
        if (mountedOk) return true;
        if (canvasHost.querySelector('canvas') && window.__ZTHEME_SCENE_INST) { mountedOk = true; return true; }
        try {
          var WW = window.WebWallGL;
          if (!WW || !WW.createScene) return false;
          var inst = WW.createScene(canvasHost, {
            fit: w.fit === "contain" ? "contain" : "cover",
            fps: 60, volume: 0, mountTimeoutMs: 0,
            onDiagnostic: function () {},
          });
          report("create-ok", attempt);
          var src = WW.httpSource(w.mediaBase.replace(new RegExp("/+" + "$"), ""));
          inst.load(src).then(function () {
            var probeTries = 0;
            var probe = function () {
              probeTries++;
              try {
                var c = canvasHost.querySelector("canvas");
                if (!c || !c.width) { report("probe-no-canvas", probeTries); return scheduleProbe(); }
                var pc = document.createElement("canvas"); pc.width = 32; pc.height = 18;
                var ctx = pc.getContext("2d");
                ctx.drawImage(c, 0, 0, 32, 18);
                var d = ctx.getImageData(0, 0, 32, 18).data, sum = 0, n = 0;
                for (var i = 0; i < d.length; i += 4) { sum += d[i] + d[i + 1] + d[i + 2]; n += 3; }
                if (sum / n < 3) {
                  report("probe-black", probeTries);
                  if (probeTries < 3) return scheduleProbe();
                  return;
                }
                canvasHost.style.opacity = "1";
                if (sceneImg.parentNode) sceneImg.remove();
                window.__ZTHEME_SCENE_INST = inst;
                mountedOk = true;
                setBootGate(false); // live frames are on screen: release the boot gate
                report("mounted", probeTries);
              } catch (e) { report("probe-error", e && e.message); }
            };
            var scheduleProbe = function () { setTimeout(probe, probeTries === 0 ? 2500 : 3000); };
            scheduleProbe();
          }).catch(function (e) {
            report("load-reject", e && (e.message || e));
          });
          return true;
        } catch (e) { report("create-throw", e && e.message); return false; }
      };
      // engine script loader (idempotent; safe to call repeatedly)
      var loadEngine = function (attempt) {
        if (window.WebWallGL) { mountScene(attempt); return; }
        report("engine-script-append", attempt);
        var es = document.createElement("script");
        es.src = w.engineUrl || "http://127.0.0.1:9337/we/engine.js";
        es.onload = function () { report("engine-loaded"); mountScene(attempt); };
        es.onerror = function () { report("engine-script-error", attempt); };
        (document.head || document.documentElement).appendChild(es);
      };
      // watchdog: every 5s (up to 10min) retry until the scene is actually live.
      // Also re-arms after the canvas is removed by a re-render.
      if (window.__ZTHEME_SCENE_ARM) { try { clearInterval(window.__ZTHEME_SCENE_ARM); } catch (e) {} }
      window.__ZTHEME_SCENE_ARM = setInterval(function () {
        try {
          window.__ZTHEME_SCENE_TRIES++;
          if (window.__ZTHEME_SCENE_TRIES > 120) { clearInterval(window.__ZTHEME_SCENE_ARM); window.__ZTHEME_SCENE_ARM = null; return; }
          if (mountedOk) { if (!canvasHost.querySelector('canvas')) { mountedOk = false; } else return; }
          if (Date.now() - lastTryAt < 4500) return;
          lastTryAt = Date.now();
          loadEngine(window.__ZTHEME_SCENE_TRIES);
        } catch (e) {}
      }, 5000);
      loadEngine(1);
            } else if (w.type === 'web') {
      var f = document.createElement('iframe');
      f.src = w.mediaUrl;
      f.setAttribute('allow', 'autoplay');
      f.setAttribute('referrerpolicy', 'no-referrer');
      f.style.cssText = 'width:100%;height:100%;border:0;pointer-events:none;';
      layer.appendChild(f);
    } else {
      if (w.fit === 'contain') {
        var fill = document.createElement('div');
        fill.style.cssText = 'position:absolute;inset:-48px;background-image:url("' + w.mediaUrl + '");background-size:cover;background-position:center;filter:blur(28px) brightness(.62);transform:translateZ(0);';
        layer.appendChild(fill);
      }
      var img = document.createElement('div');
      img.style.cssText = 'position:absolute;inset:0;background-image:url("' + w.mediaUrl + '");background-size:' + (w.fit === 'contain' ? 'contain' : 'cover') + ';background-position:center;background-repeat:no-repeat;';
      layer.appendChild(img);
    }
    document.body.insertBefore(layer, document.body.firstChild);
    buildDim(w, layer);
    // Opaque surfaces until the media actually paints (see html[data-zt-boot]).
    setBootGate(true);
    releaseBootGateWhenPainted(layer);
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
    // No wallpaper at all -> there is nothing to wait for; never stay gated.
    if (!CFG.wallpaper || !CFG.wallpaper.mediaUrl) setBootGate(false);
    autoDimFor(CFG.wallpaper);
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
        // Repair only what is actually missing/stale. Rebuilding media here would
        // restart the video and flash every 3 s.
        var wp = CFG.wallpaper;
        var needWp = wp && wp.mediaUrl && !document.getElementById('zt-wallpaper');
        var needDim = wp && wp.mediaUrl && !document.getElementById('zt-dim') && ((wp.dim > 0) || (wp.blur > 0));
        var needCss = CFG.css && !document.getElementById('zt-style');
        var needRoot = !document.getElementById('zt-root-z');
        var needOv = CFG.overrides && Object.keys(CFG.overrides).length > 0 && !document.getElementById('zt-overrides');
        if (needWp || needDim || needCss || needRoot || needOv) apply();
        else {
          var shellMissing = false;
          try {
            var s0 = (CFG.shellCandidates || [])[0];
            if (s0 && !document.querySelector('[data-zt-shell]')) shellMissing = true;
          } catch (e) {}
          if (shellMissing) applyShell();
        }
      } catch (e) {}
    }, 3000);
    window.__ZTHEME_BOOTSTRAP_ACTIVE = true;
    if (!window.__ZTHEME_MSG_LISTENER) {
      window.__ZTHEME_MSG_LISTENER = function (ev) {
        try {
          var d = ev.data || {};
          if (d.source !== 'zt-scene') return;
          if (d.status === 'ready') {
            var imgs = document.querySelectorAll('#zt-wallpaper img[data-zt-role="scene-preview"]');
            for (var i = 0; i < imgs.length; i++) imgs[i].remove();
          } else if (d.status === 'error') {
            var frame = document.querySelector('iframe[data-zt-scene]');
            if (frame) frame.remove();
          }
        } catch (e) {}
      };
      window.addEventListener('message', window.__ZTHEME_MSG_LISTENER);
    }
    apply();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { start(); }, { once: true });
  } else {
    start();
  }
})();
`;
