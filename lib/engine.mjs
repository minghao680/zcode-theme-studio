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
    glassSidebarBlur: cfg.glassSidebarBlur,
    glassPanelBlur: cfg.glassPanelBlur,
    sidebarGlass: cfg.sidebarGlass === true || (cfg.active && cfg.active.sidebarGlass === true),
    unifySidebar: cfg.unifySidebar === true,
    tintMode: cfg.tintMode,
    veilOpacity: cfg.veilOpacity,
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
    // Engine-facing copies of the sidebar material switches. buildVeil/applyShell
    // read these straight off CFG, so they MUST exist at the top level — having
    // them only inside `active` made the toggle read stale state (glass=false
    // while the config said true, so the switch looked dead).
    sidebarGlass: cfg.sidebarGlass === true || (cfg.active && cfg.active.sidebarGlass === true),
    glassSidebarBlur: cfg.glassSidebarBlur,
    glassPanelBlur: cfg.glassPanelBlur,
    unifySidebar: cfg.unifySidebar === true,
    // Scene render quality: read straight off CFG by the scene mount code.
    // Keep them at the TOP level (buildVeil/buildWallpaper read CFG directly).
    sceneRenderDpr: cfg.sceneRenderDpr ?? null,
    sceneFps: cfg.sceneFps ?? 60,
    sceneAutoQuality: cfg.sceneAutoQuality !== false,
    wallpaper: wp.id && wp.mediaUrl ? {
      id: wp.id, type: wp.type, mediaUrl: wp.mediaUrl,
      fit: wp.fit || 'cover', dim: wp.dim ?? 25, blur: wp.blur ?? 0, dimRgb,
      sceneSrc: (sceneFields || {}).sceneSrc || null,
      mediaBase: (sceneFields || {}).mediaBase || null,
      rendererUrl: (sceneFields || {}).rendererUrl || null,
      engineUrl: 'http://127.0.0.1:' + UI_PORT + '/we/engine.js',
    } : null,
    glass: cfg.glass || { enabled: true, blur: 16, style: 'frosted' },
    // Tint-curtain state MUST also live at the top level: buildVeil() reads
    // CFG.tintMode / CFG.veilOpacity directly. Having them only inside `active`
    // meant the CSS rule existed while the .zt-veil element was never created —
    // the toggle appeared to do nothing on the chat area.
    tintMode: cfg.tintMode === 'veil' ? 'veil' : 'clear',
    veilOpacity: cfg.veilOpacity ?? 45,
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
      tintMode: cfg.tintMode === 'veil' ? 'veil' : 'clear',
      veilOpacity: cfg.veilOpacity ?? 45,
      // null = leave the app's own blur untouched (it already looks right);
      // the sliders fall back to a display value only.
      glassSidebarBlur: cfg.glassSidebarBlur,
      glassPanelBlur: cfg.glassPanelBlur,
      sidebarGlass: cfg.sidebarGlass === true || (cfg.active && cfg.active.sidebarGlass === true),
      unifySidebar: cfg.unifySidebar === true,
      sceneRenderDpr: cfg.sceneRenderDpr ?? null,
      sceneFps: cfg.sceneFps ?? 60,
      sceneAutoQuality: cfg.sceneAutoQuality !== false,
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
    if (!w || !w.mediaUrl) { removeById('zt-wallpaper'); removeById('zt-dim'); removeById('zt-veil'); window.__ZTHEME_WP_KEY = ''; setBootGate(false); return; }
    // Reuse the existing layer when the media is unchanged: destroying and
    // recreating a <video>/<iframe> restarts playback and flashes. Only dim/blur
    // changes are applied in place.
    var key = w.type + '|' + w.mediaUrl + '|' + (w.fit || 'cover');
    var layer = document.getElementById('zt-wallpaper');
    if (layer && window.__ZTHEME_WP_KEY === key) {
      applyLayerBlur(layer, w); buildDim(w, layer); buildVeil();
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
    // contain: layout paint isolates this subtree into its own paint scope so
    // canvas repaints never invalidate the app UI above it (the second-biggest
    // win after removing the full-screen backdrop filter). NOT strict: that
    // pins the size and would clip the slight scale() used to hide blur fringes.
    layer.style.cssText = 'position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;'
      + 'contain:layout paint;will-change:transform;transform:translateZ(0);';
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
      // blurry slab. Keep the gif at natural size but on a TRANSPARENT backdrop:
      // a solid fill here read as two grey side gutters while the scene mounted.
      // A blurred copy of the same preview fills the leftover space instead.
      var sceneFill = mkImg('scene-preview-fill', w.mediaUrl, 'cover');
      sceneFill.style.filter = 'blur(26px) brightness(.72)';
      sceneFill.style.transform = 'scale(1.08)';
      layer.appendChild(sceneFill);
      var sceneImg = mkImg('scene-preview', w.mediaUrl, 'contain');
      sceneImg.style.objectFit = 'contain';
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
          // Manual quality knobs (panel sliders) with sane automatic defaults:
          //   sceneFps        - target frame rate; lower = cooler + smoother
          //   sceneRenderDpr  - null = auto (dpr capped at 1.25), else 0.5-2
          //   sceneAutoQuality- engine's own dynamic downgrade
          // fit is always passed so the canvas keeps filling the window; changing
          // renderDpr only changes the BACKING resolution, never the layout.
          var wantFps = Number(CFG.sceneFps) > 0 ? Math.max(15, Math.min(60, Number(CFG.sceneFps))) : 60;
          var wantDpr = (CFG.sceneRenderDpr == null || Number(CFG.sceneRenderDpr) <= 0)
            ? Math.min(window.devicePixelRatio || 1, 1.25)
            : Math.max(0.5, Math.min(2, Number(CFG.sceneRenderDpr)));
          var inst = WW.createScene(canvasHost, {
            fit: w.fit === "contain" ? "contain" : "cover",
            fps: wantFps, volume: 0, mountTimeoutMs: 0,
            renderDpr: wantDpr,
            autoQuality: CFG.sceneAutoQuality !== false,
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
                if (sceneFill.parentNode) sceneFill.remove();
                window.__ZTHEME_SCENE_INST = inst;
                mountedOk = true;
                setBootGate(false); // live frames are on screen: release the boot gate
                report("mounted", probeTries);
                // Adaptive quality: sample real frame pacing for a few seconds. If
                // the scene cannot hold ~50fps, drop the target to 30 — a steady 30
                // reads far smoother than a jittery 40-55 and costs much less GPU.
                // The engine's own throttle reads cfg.sceneFps, so we adjust that
                // (inst.setFps exists only on its internal renderer).
                try {
                  var frames = 0, t0 = 0;
                  var sample = function (ts) {
                    if (!t0) { t0 = ts; frames = 0; requestAnimationFrame(sample); return; }
                    frames++;
                    var elapsed = ts - t0;
                    if (elapsed < 2200) { requestAnimationFrame(sample); return; }
                    var fps = frames / (elapsed / 1000);
                    report("frames-sample", Math.round(fps));
                    if (fps < 50) {
                      try {
                        if (inst && inst.cfg) inst.cfg.sceneFps = 30;
                        else if (inst && inst.setFps) inst.setFps(30);
                        report("fps-lowered", Math.round(fps));
                      } catch (e) {}
                    }
                  };
                  requestAnimationFrame(sample);
                } catch (e) {}
                // Pause when the window is not visible / not focused. The engine's
                // own occlusion detection cannot trigger here (our layer never
                // "occludes" anything), so idle windows used to keep rendering at
                // full speed forever — pure waste while you work elsewhere.
                try {
                  if (!window.__ZTHEME_VIS_HOOK) {
                    window.__ZTHEME_VIS_HOOK = true;
                    var setPaused = function (paused) {
                      try {
                        var ins = window.__ZTHEME_SCENE_INST;
                        if (!ins) return;
                        if (typeof ins.setOccluded === "function") ins.setOccluded(paused);
                        else if (ins.sceneCtl && typeof ins.sceneCtl.setOccluded === "function") ins.sceneCtl.setOccluded(paused);
                        else if (ins.sceneCtl && typeof ins.sceneCtl.pause === "function") { paused ? ins.sceneCtl.pause() : ins.sceneCtl.resume(); }
                      } catch (e) {}
                    };
                    window.__ZTHEME_SCENE_PAUSE = setPaused;
                    document.addEventListener("visibilitychange", function () { setPaused(document.hidden); });
                    window.addEventListener("blur", function () { setPaused(true); });
                    window.addEventListener("focus", function () { setPaused(false); });
                    setPaused(document.hidden);
                  }
                } catch (e) {}
              } catch (e) { report("probe-error", e && e.message); }
            };
            // Probe fast: the first frame usually lands within a few hundred ms of
            // load() resolving, so the old 2500ms initial wait added a visible
            // stall between the preview and the live scene. Back off gradually for
            // the retries rather than waiting 3s from the start.
            var scheduleProbe = function () {
              var delay = probeTries === 0 ? 120 : (probeTries === 1 ? 250 : 500);
              setTimeout(probe, delay);
            };
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
    buildVeil();
    // Opaque surfaces until the media actually paints (see html[data-zt-boot]).
    setBootGate(true);
    releaseBootGateWhenPainted(layer);
  }
  // Optional full-window theme curtain (config tintMode: 'veil'). Kept as its own
  // layer at z-index 0 (same band as the wallpaper, below #root's z-index 1) so it
  // never intercepts clicks and never paints over the UI. Existing layer is left
  // alone when the mode did not change — rebuilding it every apply would flash.
  function buildVeil() {
    // Config may carry the state at top level (fresh payload) or only inside
    // .active (panel toggle applies before the endpoint round-trip). Accept both,
    // otherwise the toggle reads stale state and the curtain flips wrongly.
    var mode = CFG.tintMode || (CFG.active && CFG.active.tintMode) || 'clear';
    var op = CFG.veilOpacity != null ? CFG.veilOpacity
      : (CFG.active && CFG.active.veilOpacity != null ? CFG.active.veilOpacity : 45);
    var want = mode === 'veil' && CFG.wallpaper && CFG.wallpaper.mediaUrl;
    var el = document.getElementById('zt-veil');
    if (!want) { if (el) el.remove(); window.__ZTHEME_VEIL_KEY = ''; return; }
    // Key on the MODE + opacity, never on css length: a panel toggle ships the
    // previous payload (its CSS still describes the old mode), so a css-derived
    // key compared equal and the curtain was left in its prior state.
    var key = mode + '|' + op;
    if (el && window.__ZTHEME_VEIL_KEY === key) return;
    removeById('zt-veil');
    el = document.createElement('div');
    el.id = 'zt-veil';
    el.className = 'zt-veil';
    el.setAttribute('data-zt-layer', '1');
    el.setAttribute('aria-hidden', 'true');
    // Inline paint (no dependency on the stylesheet): the .zt-veil rule only
    // exists once the endpoint rebuilds CSS for veil mode, but a panel click
    // applies the OLD css — without this the layer would be present yet invisible
    // until the next round-trip.
    var tintHex = (CFG.palette && CFG.palette['--color-background']) || '#0d1626';
    if (!/^#[0-9a-fA-F]{6}$/.test(tintHex)) tintHex = '#0d1626';
    el.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;'
      + 'background:linear-gradient(180deg,'
      + 'color-mix(in srgb, ' + tintHex + ' ' + Math.min(100, op + 8) + '%, transparent) 0%,'
      + 'color-mix(in srgb, ' + tintHex + ' ' + op + '%, transparent) 42%,'
      + 'color-mix(in srgb, ' + tintHex + ' ' + Math.max(0, op - 10) + '%, transparent) 100%);';
    // after the wallpaper layer (so it sits on top of it) but before #root
    var wp = document.getElementById('zt-wallpaper');
    document.body.insertBefore(el, wp ? wp.nextSibling : document.body.firstChild);
    window.__ZTHEME_VEIL_KEY = key;
  }
  // Tag REAL user-message bubbles. A CSS attribute selector cannot do this:
  // ZCode's Tailwind arbitrary-variant classes contain substrings like
  // 'rounded-tr-' on huge layout wrappers, so an attribute-contains selector
  // painted a page-sized backdrop-filter over the chat list (rectangular fog bug).
  // Measure each candidate instead and only tag small, message-sized boxes.
  function tagUserBubbles() {
    var out = [];
    try {
      var MAXW = 980, MAXH = 480;
      var all = document.querySelectorAll('[class*="user-row"] *, [class*="rounded-tr-"]');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (el.getAttribute('data-zt-bubble') === '1') { out.push(el); continue; }
        if (el.hasAttribute('data-zt-scene') || el.hasAttribute('data-zt-layer')) continue;
        var r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        // bubbles are compact and content-sized; layout wrappers span the pane
        if (r.width > MAXW || r.height > MAXH) continue;
        if (r.width < 40 || r.height < 20) continue;
        var cs = null;
        try { cs = getComputedStyle(el); } catch (e) {}
        if (!cs || cs.position === 'fixed') continue;
        // the bubble is the element that actually paints a rounded corner
        var tr = cs.borderTopRightRadius || cs.borderRadius || '';
        if (!tr || tr === '0px') continue;
        el.setAttribute('data-zt-bubble', '1');
        out.push(el);
      }
      // sweep markers whose node went away or grew into a wrapper
      var marked = document.querySelectorAll('[data-zt-bubble="1"]');
      for (var k = 0; k < marked.length; k++) {
        if (out.indexOf(marked[k]) !== -1) continue;
        var rr = marked[k].getBoundingClientRect();
        if (!rr.width || rr.width > MAXW || rr.height > MAXH) marked[k].removeAttribute('data-zt-bubble');
      }
    } catch (e) {}
    return out;
  }
  // Diagnostic: list every element that covers (most of) the viewport and still
  // paints a non-transparent background. Such a node sits ON TOP of the wallpaper
  // and tints the whole window — the "theme colour covers everything" report.
  // Reported to the daemon log so machines without CDP can be diagnosed.
  function reportFullscreenTints() {
    try {
      var vw = window.innerWidth, vh = window.innerHeight;
      var hits = [];
      var all = document.querySelectorAll('body *');
      for (var i = 0; i < all.length && hits.length < 12; i++) {
        var el = all[i];
        if (el.hasAttribute && (el.hasAttribute('data-zt-layer') || el.hasAttribute('data-zt-scene'))) continue;
        // never neutralise surfaces we deliberately styled (glass panels, bubbles)
        if (el.hasAttribute && (el.hasAttribute('data-zt-glass') || el.hasAttribute('data-zt-bubble'))) continue;
        // never touch the app skeleton: html/body/#root and its direct children
        // must keep their own paint model, or the whole UI loses its layout paint
        try {
          if (el === document.body || el === document.documentElement) continue;
          if (el.id === 'root') continue;
          if (el.parentElement && el.parentElement.id === 'root') continue;
        } catch (e) { continue; }
        var r = el.getBoundingClientRect();
        if (r.width < vw * 0.8 || r.height < vh * 0.8) continue;
        var cs = null;
        try { cs = getComputedStyle(el); } catch (e) { continue; }
        if (!cs) continue;
        var bg = cs.backgroundColor || '';
        var bgi = cs.backgroundImage || '';
        var m = bg.match(/rgba?\(([^)]+)\)/);
        var alpha = 1;
        if (m) { var parts = m[1].split(','); alpha = parts.length > 3 ? Number(parts[3]) : 1; }
        var opaque = alpha > 0.02;
        var hasGradient = bgi && bgi !== 'none';
        if (!opaque && !hasGradient) continue;
        hits.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className || '').slice(0, 90),
          bg: bg.slice(0, 40),
          grad: hasGradient ? bgi.slice(0, 40) : null,
          rect: [Math.round(r.width), Math.round(r.height)],
        });
        // Clear it: a full-viewport opaque/gradient surface sits above the
        // wallpaper and tints (or hides) the entire window. Neutralising the
        // paint here is what actually restores the wallpaper; the report above
        // records what was found for future reference.
        try {
          if (opaque) el.style.setProperty('background-color', 'transparent', 'important');
          if (hasGradient) el.style.setProperty('background-image', 'none', 'important');
          el.setAttribute('data-zt-cleared', '1');
        } catch (e) {}
      }
      try {
        fetch(((CFG.wallpaper && CFG.wallpaper.engineUrl) || 'http://127.0.0.1:9337').replace(new RegExp('/we/[a-z]+\\.js$'), '') + '/zt/scene-report', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ stage: 'fullscreen-tints', detail: JSON.stringify(hits).slice(0, 1500), ts: Date.now() }),
        }).catch(function () {});
      } catch (e) {}
    } catch (e) {}
  }
  function applyShell() {
    var glassOn = CFG.glass && CFG.glass.enabled;
    var liquid = glassOn && CFG.glass.style === 'liquid';
    var matched = [];
    // ---- 1. mark glass panels FIRST ----
    // Order matters: the shell pass below skips glass nodes, so they must already
    // be identifiable. Glass panels own their paint through --color-sidebar, which
    // is what the sidebar-opacity slider drives.
    if (glassOn) {
      var gs = CFG.glassCandidates || [];
      var sidebarNodes = [];
      // Remember the sidebar's LEFT EDGE so the panel scan can exclude it.
      var sidebarRight = 0;
      for (var j = 0; j < gs.length; j++) {
        try {
          var gn = document.querySelectorAll(gs[j]);
          for (var m = 0; m < gn.length; m++) {
            // Sanity gate: a glass node must be a real panel, not a shrink-wrapped
            // absolute strip (floating glass block) and not the whole app frame.
            // Measuring beats guessing at Tailwind class names.
            var gr = null;
            try { gr = gn[m].getBoundingClientRect(); } catch (e) {}
            if (!gr || gr.width < 80 || gr.height < 120) continue;
            if (gr.width > window.innerWidth * 0.55) continue;
            if (sidebarNodes.indexOf(gn[m]) === -1) sidebarNodes.push(gn[m]);
            if (gr.right > sidebarRight) sidebarRight = gr.right;
          }
        } catch (e) {}
      }
      // ---- geometric fallback for the sidebar ----
      // The configured selectors can miss after a ZCode update (diagnostics
      // reported sidebar=0: the toggle loop then had nothing to act on, which is
      // why the material switch appeared to do nothing). Find the left-hand
      // full-height column directly — with permissive bounds, because the real
      // sidebar is only ~250-300px wide and may be shorter than a full viewport.
      if (!sidebarNodes.length) {
        var cand2 = document.querySelectorAll('body *');
        var bestScore = -1, bestEl = null, geoLog = [];
        for (var ci = 0; ci < cand2.length; ci++) {
          var ce = cand2[ci];
          if (ce.hasAttribute && (ce.hasAttribute('data-zt-layer') || ce.hasAttribute('data-zt-scene'))) continue;
          var cr2 = null;
          try { cr2 = ce.getBoundingClientRect(); } catch (e) { continue; }
          if (!cr2 || !cr2.width || !cr2.height) continue;
          // Permissive bounds: the panel diagnostics showed sidebar children only
          // ~269-289px wide, so a narrow window is likely. Only require that the
          // node hugs the left edge and is a vertical strip.
          if (cr2.left > window.innerWidth * 0.15) continue;
          if (cr2.height < window.innerHeight * 0.4) continue;
          if (cr2.width > window.innerWidth * 0.5) continue;
          if (cr2.width < 30) continue;
          // prefer the widest tall-left node (the sidebar beats its wrappers)
          var score = cr2.width * cr2.height;
          if (geoLog.length < 6) geoLog.push(ce.tagName.toLowerCase() + (ce.id ? '#' + ce.id : '')
            + '[' + Math.round(cr2.left) + ',' + Math.round(cr2.width) + 'x' + Math.round(cr2.height) + ']');
          if (score > bestScore) { bestScore = score; bestEl = ce; }
        }
        if (bestEl) {
          sidebarNodes.push(bestEl);
          sidebarRight = bestEl.getBoundingClientRect().right;
          try {
            fetch(((CFG.wallpaper && CFG.wallpaper.engineUrl) || 'http://127.0.0.1:9337').replace(new RegExp('/we/[a-z]+\\.js$'), '') + '/zt/scene-report', {
              method: 'POST', headers: { 'Content-Type': 'text/plain' },
              body: JSON.stringify({ stage: 'sidebar-geo-found', detail: bestEl.tagName.toLowerCase() + '.' + String(bestEl.className || '').slice(0, 70) + ' right=' + Math.round(sidebarRight) + ' cands=' + geoLog.join(','), ts: Date.now() }),
            }).catch(function () {});
          } catch (e) {}
        } else {
          try {
            fetch(((CFG.wallpaper && CFG.wallpaper.engineUrl) || 'http://127.0.0.1:9337').replace(new RegExp('/we/[a-z]+\\.js$'), '') + '/zt/scene-report', {
              method: 'POST', headers: { 'Content-Type': 'text/plain' },
              body: JSON.stringify({ stage: 'sidebar-geo-miss', detail: 'vw=' + window.innerWidth + ' vh=' + window.innerHeight + ' selMissed=' + gs.join('|'), ts: Date.now() }),
            }).catch(function () {});
          } catch (e) {}
        }
      } else {
        try {
          fetch(((CFG.wallpaper && CFG.wallpaper.engineUrl) || 'http://127.0.0.1:9337').replace(new RegExp('/we/[a-z]+\\.js$'), '') + '/zt/scene-report', {
            method: 'POST', headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ stage: 'sidebar-selector-hit', detail: 'n=' + sidebarNodes.length + ' w=' + Math.round(sidebarNodes[0].getBoundingClientRect().width), ts: Date.now() }),
          }).catch(function () {});
        } catch (e) {}
      }
      // ---- right-hand glass panels (composer / status bar) ----
      // These carry the app's OWN backdrop-filter, which is why they looked
      // different from the sidebar. Discovery is geometric: right half, wide but
      // SHORT (the composer and the status bar are bars, not the message list —
      // a tall container here would blur the whole conversation).
      var vw = window.innerWidth, vh = window.innerHeight;
      var all = document.querySelectorAll('body *');
      var panelNodes = [];
      var nativeFilter = '';
      for (var pi = 0; pi < all.length; pi++) {
        var el = all[pi];
        if (el.hasAttribute && el.hasAttribute('data-zt-layer')) continue;
        if (el.hasAttribute && (el.hasAttribute('data-zt-glass') || el.hasAttribute('data-zt-bubble') || el.hasAttribute('data-zt-shell'))) continue;
        var pr = null;
        try { pr = el.getBoundingClientRect(); } catch (e) { continue; }
        if (!pr || pr.width < 200 || pr.height < 28) continue;
        if (pr.width > vw * 0.95) continue;
        // a bar, not a column: keeps the message list and side panels out
        if (pr.height > vh * 0.4) continue;
        // must live in the right half of the window, and clear of the sidebar
        if (pr.left < vw * 0.3) continue;
        if (sidebarRight && pr.left < sidebarRight - 4) continue;
        // reject nested duplicates (child fully inside an already-matched panel):
        // the diagnostics showed 50 matches, mostly wrappers inside wrappers.
        var isNested = false;
        for (var qi = 0; qi < panelNodes.length; qi++) {
          var qr = panelNodes[qi].getBoundingClientRect();
          if (pr.left >= qr.left - 2 && pr.right <= qr.right + 2 && pr.top >= qr.top - 2 && pr.bottom <= qr.bottom + 2) { isNested = true; break; }
        }
        if (isNested) continue;
        var pcs = null;
        try { pcs = getComputedStyle(el); } catch (e) { continue; }
        if (!pcs) continue;
        // Skip bare text/spacer wrappers: a real bar paints its own surface.
        var bgc = pcs.backgroundColor || '';
        var am = bgc.match(/rgba?\(([^)]+)\)/);
        var al = 1;
        if (am) { var ap = am[1].split(','); al = ap.length > 3 ? Number(ap[3]) : 1; }
        var bf = pcs.backdropFilter || pcs.webkitBackdropFilter || '';
        var hasBlur = bf && bf !== 'none' && bf.indexOf('blur') !== -1;
        // adopt when it already blurs, or when it is a translucent surface
        if (!hasBlur && al >= 0.9) continue;
        panelNodes.push(el);
        // Remember the app's own filter so the sidebar can copy it VERBATIM.
        // Our saturate/brightness recipe could never match the app's look.
        if (hasBlur && !nativeFilter) nativeFilter = bf;
      }
      // ---- apply: sidebar is either MERGED or GLASS (explicit user choice) ----
      // Two mutually exclusive looks, switchable at any time:
      //   sidebarGlass=false -> remove every filter: the sidebar shows the raw
      //                         wallpaper and blends into the panels' colour.
      //   sidebarGlass=true  -> copy the app's own filter string VERBATIM so the
      //                         material matches the composer/status bar exactly.
      // A numeric "=== 0" test was wrong: an absent config value is undefined, so
      // the merged state was never selected and the blur stuck forever.
      var wantGlass = CFG.sidebarGlass === true || (CFG.active && CFG.active.sidebarGlass === true);
      var overrideBlur = Number(CFG.glassSidebarBlur);
      // Glass strength: explicit slider > the app's own filter > the panel slider.
      // Without the middle fallback a missing native value silently produced
      // blur(18px) even though the user had set the slider to 0.
      var sideFilter = (overrideBlur > 0)
        ? ('blur(' + overrideBlur + 'px)')
        : (nativeFilter || ('blur(' + (Number(CFG.glassPanelBlur) > 0 ? Number(CFG.glassPanelBlur) : 18) + 'px)'));
      // A stale live-preview stylesheet would keep forcing a filter with
      // !important, making the toggle look one-way. Always drop it on apply.
      var liveGlassEl = document.getElementById('zt-live-glass');
      if (liveGlassEl) liveGlassEl.remove();
      for (var si = 0; si < sidebarNodes.length; si++) {
        var sn = sidebarNodes[si];
        if (wantGlass) {
          sn.style.setProperty('backdrop-filter', sideFilter, 'important');
          sn.style.setProperty('-webkit-backdrop-filter', sideFilter, 'important');
        } else {
          sn.style.removeProperty('backdrop-filter');
          sn.style.removeProperty('-webkit-backdrop-filter');
        }
        sn.setAttribute('data-zt-glass', wantGlass ? 'sidebar' : 'sidebar-plain');
        matched.push(sn);
      }
      for (var pn = 0; pn < panelNodes.length; pn++) {
        // Panels keep the app's filter; only the slider can change it.
        var pb = CFG.glassPanelBlur;
        if (pb != null) {
          panelNodes[pn].style.setProperty('backdrop-filter', 'blur(' + pb + 'px)', 'important');
        } else {
          panelNodes[pn].style.removeProperty('backdrop-filter');
        }
        panelNodes[pn].setAttribute('data-zt-glass', 'panel');
        matched.push(panelNodes[pn]);
      }
      // Report what the geometric discovery actually found: without this the
      // "panel blur does nothing" report is indistinguishable from "no panel was
      // ever matched".
      try {
        var sCount = 0, pCount = 0, pSamples = [];
        var marked = document.querySelectorAll('[data-zt-glass]');
        for (var mi = 0; mi < marked.length; mi++) {
          var gv = marked[mi].getAttribute('data-zt-glass');
          if (gv === 'sidebar' || gv === 'sidebar-plain') sCount++;
          else if (gv === 'panel') {
            pCount++;
            if (pSamples.length < 4) {
              var mr = marked[mi].getBoundingClientRect();
              pSamples.push(marked[mi].tagName.toLowerCase() + '.' + String(marked[mi].className || '').slice(0, 40)
                + ' [' + Math.round(mr.width) + 'x' + Math.round(mr.height) + ']');
            }
          }
        }
        fetch(((CFG.wallpaper && CFG.wallpaper.engineUrl) || 'http://127.0.0.1:9337').replace(new RegExp('/we/[a-z]+\\.js$'), '') + '/zt/scene-report', {
          method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            stage: 'glass-groups',
            detail: 'sidebarNodes=' + sidebarNodes.length + ' glass=' + (CFG.sidebarGlass === true)
              + ' filter="' + String(sideFilter).slice(0, 60) + '" native="' + String(nativeFilter).slice(0, 60) + '"'
              + ' markedSidebar=' + sCount + ' panel=' + pCount + ' :: ' + pSamples.join(' | '),
            ts: Date.now(),
          }),
        }).catch(function () {});
      } catch (e) {}
    }
    // ---- 2. shell transparency (never on glass panels) ----
    var sels = CFG.shellCandidates || [];
    for (var i = 0; i < sels.length; i++) {
      try {
        var ns = document.querySelectorAll(sels[i]);
        for (var k = 0; k < ns.length; k++) {
          // Skip glass panels: they own their background via --color-sidebar.
          // Forcing an inline transparent background on the sidebar silently
          // disabled the sidebar-opacity slider (inline !important beats the
          // variable), so the slider appeared to do nothing.
          if (ns[k].hasAttribute && ns[k].hasAttribute('data-zt-glass')) continue;
          ns[k].style.setProperty('background', 'transparent', 'important');
          ns[k].setAttribute('data-zt-shell', '1');
        }
      } catch (e) {}
    }
    // ---- 3. undo shell inline background left on a node that is now glass ----
    // (freshly marked on this pass, or glass was enabled after a shell pass)
    try {
      var gl = document.querySelectorAll('[data-zt-glass]');
      for (var q2 = 0; q2 < gl.length; q2++) {
        if (gl[q2].getAttribute('data-zt-shell') === '1') {
          gl[q2].style.removeProperty('background');
          gl[q2].removeAttribute('data-zt-shell');
        }
      }
    } catch (e) {}
    // sweep stale glass markers (candidates removed / glass disabled)
    try {
      var stale = document.querySelectorAll('[data-zt-glass]');
      for (var q = 0; q < stale.length; q++) {
        if (!glassOn || matched.indexOf(stale[q]) === -1) {
          stale[q].classList.remove('zt-glass');
          stale[q].removeAttribute('data-zt-glass');
        }
      }
    } catch (e) {}
    // one-shot diagnostic per apply: which full-viewport nodes still paint a
    // background over the wallpaper (only when a wallpaper is active)
    if (CFG.wallpaper && CFG.wallpaper.mediaUrl) reportFullscreenTints();
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
    tagUserBubbles();
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
    try { if (window.__ZTHEME_DOM_OBSERVER) { window.__ZTHEME_DOM_OBSERVER.disconnect(); window.__ZTHEME_DOM_OBSERVER = null; } } catch (e) {}
    try { if (window.__ZTHEME_SCENE_ARM) { clearInterval(window.__ZTHEME_SCENE_ARM); window.__ZTHEME_SCENE_ARM = null; } } catch (e) {}
    try {
      document.querySelectorAll('[data-zt-shell]').forEach(function (n) {
        n.style.removeProperty('background'); n.removeAttribute('data-zt-shell');
      });
      document.querySelectorAll('[data-zt-glass]').forEach(function (n) {
        n.classList.remove('zt-glass');
        n.style.removeProperty('backdrop-filter'); n.removeAttribute('data-zt-glass');
      });
      document.querySelectorAll('[data-zt-bubble]').forEach(function (n) {
        n.removeAttribute('data-zt-bubble');
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
        // The curtain rides along with the wallpaper layer: if the media is on
        // screen but .zt-veil is missing (removed by an external re-render, or
        // because an older payload lacked the flag), re-create it here.
        var needVeil = CFG.tintMode === 'veil' && wp && wp.mediaUrl && !document.getElementById('zt-veil');
        if (needWp || needDim || needCss || needRoot || needOv || needVeil) apply();
        else {
          var shellMissing = false;
          try {
            var s0 = (CFG.shellCandidates || [])[0];
            if (s0 && !document.querySelector('[data-zt-shell]')) shellMissing = true;
          } catch (e) {}
          if (shellMissing) applyShell();
          // Messages stream in continuously, but sweeping the whole document with
          // attribute selectors every 3s is expensive on a long transcript. Tag
          // only when a MutationObserver flagged a change since the last pass.
          try {
            if (window.__ZTHEME_DOM_DIRTY) {
              window.__ZTHEME_DOM_DIRTY = false;
              tagUserBubbles();
            }
          } catch (e) { tagUserBubbles(); }
        }
      } catch (e) {}
    }, 3000);
    window.__ZTHEME_BOOTSTRAP_ACTIVE = true;
    // Lightweight dirty flag instead of polling the DOM: any structural change in
    // the app marks the bubble sweep as needed, and the 3s timer does the work
    // only when that flag is set.
    if (!window.__ZTHEME_DOM_OBSERVER) {
      try {
        var rootEl = document.getElementById('root') || document.body;
        var domObs = new MutationObserver(function () { window.__ZTHEME_DOM_DIRTY = true; });
        domObs.observe(rootEl, { childList: true, subtree: true });
        window.__ZTHEME_DOM_OBSERVER = domObs;
        window.__ZTHEME_DOM_DIRTY = true;
      } catch (e) {}
    }
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
