// Sidebar UI: injects a "主题工作台" nav item right after 插件市场 and renders a
// self-contained settings overlay. Runs inside the renderer (ES5-ish, no deps).
// Exported as source text so bridge.mjs can inline it into bridge.js.
// Depends on: window.__ZTHEME_CONFIG, window.__ZTHEME_APPLY, window.__ZTHEME_WP_KEY

export const UI_SOURCE = `
(function () {
  var CFG = window.__ZTHEME_CONFIG || {};
  if (!CFG || CFG.enabled === false) return;

  var NAV_TEXT = '主题工作台';
  var STYLE_ID = 'zt-ui-style';
  var PANEL_ID = 'zt-panel';
  var NAV_ID = 'zt-nav-item';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#zt-panel{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.42);backdrop-filter:blur(6px);}',
      '#zt-panel[data-open="1"]{display:flex;}',
      '#zt-panel .zt-card{width:min(760px,92vw);max-height:86vh;overflow:auto;border-radius:16px;padding:18px;',
      '  background:color-mix(in srgb, var(--color-popover, #2b2b2b) 92%, transparent);color:var(--color-foreground,#eaeaea);',
      '  border:1px solid var(--color-border,#ffffff1a);box-shadow:0 24px 64px rgba(0,0,0,.45);}',
      '#zt-panel h3{margin:0 0 4px;font-size:15px;font-weight:600;}',
      '#zt-panel .zt-sub{font-size:12px;opacity:.6;margin-bottom:14px;}',
      '#zt-panel .zt-sect{font-size:12px;font-weight:600;opacity:.75;margin:16px 0 8px;}',
      '#zt-panel .zt-presets{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;}',
      '#zt-panel .zt-preset{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:9px;cursor:pointer;font-size:12px;',
      '  background:var(--color-card,#2b2b2b);border:1px solid var(--color-border,#ffffff1a);color:inherit;text-align:left;}',
      '#zt-panel .zt-preset[data-active="1"]{outline:2px solid var(--color-accent,#38bdf8);}',
      '#zt-panel .zt-dot{width:16px;height:16px;border-radius:50%;flex:none;}',
      '#zt-panel .zt-walls{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px;max-height:230px;overflow:auto;padding-right:4px;}',
      '#zt-panel .zt-wall{position:relative;border-radius:8px;overflow:hidden;cursor:pointer;border:1px solid var(--color-border,#ffffff1a);',
      '  aspect-ratio:16/10;background:var(--color-card,#2b2b2b);padding:0;}',
      '#zt-panel .zt-wall img{width:100%;height:100%;object-fit:cover;display:block;}',
      '#zt-panel .zt-wall[data-active="1"]{outline:2px solid var(--color-accent,#38bdf8);}',
      '#zt-panel .zt-badge{position:absolute;top:3px;right:3px;font-size:9px;padding:1px 5px;border-radius:99px;background:rgba(0,0,0,.66);color:#fff;}',
      '#zt-panel .zt-row{display:flex;align-items:center;gap:10px;margin:7px 0;font-size:12px;}',
      '#zt-panel .zt-row label{width:130px;flex:none;opacity:.8;}',
      '#zt-panel .zt-row input[type=range]{flex:1;accent-color:var(--color-accent,#38bdf8);}',
      '#zt-panel .zt-val{width:44px;text-align:right;opacity:.7;font-variant-numeric:tabular-nums;}',
      '#zt-panel .zt-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;}',
      '#zt-panel .zt-btn{padding:6px 14px;border-radius:8px;font-size:12px;cursor:pointer;border:1px solid var(--color-border,#ffffff1a);',
      '  background:var(--color-secondary,#363636);color:inherit;}',
      '#zt-panel .zt-btn.zt-primary{background:var(--color-accent,#38bdf8);color:#04121c;border-color:transparent;font-weight:600;}',
      '#zt-panel .zt-toggle{min-width:64px;font-weight:600;}',
      '#zt-panel .zt-toggle[data-on="1"]{background:var(--color-accent,#38bdf8);color:#04121c;border-color:transparent;}',
      '#zt-panel .zt-close{position:absolute;right:14px;top:12px;font-size:18px;cursor:pointer;opacity:.6;background:none;border:0;color:inherit;}',
      '#zt-nav-item{cursor:pointer;}',
      '#zt-panel .zt-palette{display:flex;flex-direction:column;gap:10px;}',
      '#zt-panel .zt-pal-title{font-size:11px;opacity:.6;margin-bottom:5px;}',
      '#zt-panel .zt-pal-row{display:flex;flex-wrap:wrap;gap:8px;}',
      '#zt-panel .zt-swatch{position:relative;width:72px;cursor:pointer;text-align:center;}',
      '#zt-panel .zt-swatch input[type=color]{width:100%;height:34px;border-radius:8px;border:1px solid var(--color-border,#ffffff1a);',
      '  padding:0;background:none;cursor:pointer;}',
      '#zt-panel .zt-swatch input[type=color]::-webkit-color-swatch-wrapper{padding:2px;}',
      '#zt-panel .zt-swatch input[type=color]::-webkit-color-swatch{border:none;border-radius:6px;}',
      '#zt-panel .zt-swatch.zt-custom input[type=color]{outline:2px solid var(--color-accent,#38bdf8);outline-offset:1px;}',
      '#zt-panel .zt-swatch-name{display:block;font-size:10px;opacity:.65;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '#zt-panel .zt-swatch .zt-reset-one{position:absolute;top:-6px;right:-4px;width:16px;height:16px;border-radius:50%;',
      '  background:var(--color-destructive,#ff5c5c);color:#fff;font-size:11px;line-height:15px;text-align:center;cursor:pointer;border:0;display:none;padding:0;}',
      '#zt-panel .zt-swatch.zt-custom .zt-reset-one{display:block;}',
      '#zt-panel .zt-swatch .zt-alpha{width:100%;height:12px;margin:3px 0 0;accent-color:var(--color-accent,#38bdf8);cursor:pointer;display:block;}',
      '#zt-panel .zt-swatch .zt-alpha-val{display:block;font-size:9px;opacity:.6;line-height:10px;}',
      '#zt-panel .zt-swatch.zt-translucent input[type=color]{background-image:linear-gradient(45deg,#666 25%,transparent 25%),linear-gradient(-45deg,#666 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#666 75%),linear-gradient(-45deg,transparent 75%,#666 75%);background-size:8px 8px;background-position:0 0,0 4px,4px -4px,-4px 0;}',
      '#zt-panel .zt-myrow{display:flex;gap:6px;margin:2px 0 6px;}',
      '#zt-panel .zt-myrow input{flex:1;min-width:0;background:var(--color-input,rgba(255,255,255,.06));border:1px solid var(--color-border,rgba(255,255,255,.12));border-radius:8px;color:inherit;padding:5px 9px;font-size:12px;outline:none;}',
      '#zt-panel .zt-mylist{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;}',
      '#zt-panel .zt-mypreset{display:inline-flex;align-items:center;gap:4px;padding:4px 6px 4px 10px;border-radius:999px;border:1px solid var(--color-border,rgba(255,255,255,.12));cursor:pointer;font-size:12px;background:var(--color-secondary,rgba(255,255,255,.06));}',
      '#zt-panel .zt-mypreset:hover{border-color:var(--color-accent,#38bdf8);}',
      '#zt-panel .zt-mydel{width:16px;height:16px;border-radius:50%;border:0;background:transparent;color:inherit;font-size:12px;line-height:14px;cursor:pointer;opacity:.6;padding:0;}',
      '#zt-panel .zt-mydel:hover{background:var(--color-destructive,#ff5c5c);color:#fff;opacity:1;}',
      '#zt-panel .zt-walltools{display:inline-flex;gap:6px;}',
      '#zt-panel .zt-bing{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin:6px 0 10px;}',
    ].join('');
    document.head.appendChild(s);
  }

  function navContainer() {
    // the sidebar nav list: the flex column that holds 新建任务 / 自动化 / 插件市场
    var btns = document.querySelectorAll('#sidebar button');
    for (var i = 0; i < btns.length; i++) {
      if ((btns[i].textContent || '').indexOf('\u63d2\u4ef6\u5e02\u573a') !== -1) {
        var parent = btns[i].parentElement;
        if (parent && parent.children.length >= 2) return { row: btns[i], container: parent };
      }
    }
    return null;
  }

  function buildNavItem(template) {
    var btn = document.createElement('button');
    btn.id = NAV_ID;
    btn.type = 'button';
    // copy the exact classes of the sibling nav button so styling matches ZCode
    if (template && template.className) btn.className = template.className;
    btn.setAttribute('aria-label', NAV_TEXT);
    var icon = (template && template.querySelector('svg')) ? template.querySelector('svg').cloneNode(true) : null;
    var iconWrap = document.createElement('span');
    iconWrap.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex:none;';
    if (icon) { iconWrap.appendChild(icon); }
    else { iconWrap.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>'; }
    var label = document.createElement('span');
    label.textContent = NAV_TEXT;
    label.style.cssText = 'margin-left:8px;';
    btn.appendChild(iconWrap);
    btn.appendChild(label);
    btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); openPanel(); });
    return btn;
  }

  // The nav item is a FIXED-POSITION OVERLAY that mirrors the rect of the
  // 插件市场 button. It is deliberately NOT inserted into the React-managed nav
  // list: a foreign node there crashes React's reconciliation on re-render
  // ("removeChild: not a child") and unmounts the whole app (blank screen under
  // the wallpaper). An overlay is never touched by React.
  var navRect = null;

  function findMarketButton() {
    var btns = document.querySelectorAll('#sidebar button');
    for (var i = 0; i < btns.length; i++) {
      if ((btns[i].textContent || '').indexOf('\u63d2\u4ef6\u5e02\u573a') !== -1) return btns[i];
    }
    // fallback: the sidebar id may change across app updates — scan every button
    btns = document.querySelectorAll('button');
    for (var j = 0; j < btns.length; j++) {
      if ((btns[j].textContent || '').indexOf('\u63d2\u4ef6\u5e02\u573a') !== -1 && btns[j].offsetParent) return btns[j];
    }
    return null;
  }

  // Mirror the market button's exact classes so the overlay looks IDENTICAL to a
  // native nav item (transparent background, native hover styles, same paddings).
  // ZCode's Tailwind stylesheet is global, so cloned classes work on our element too.
  // The ICON is our own palette glyph (cloning the market icon would look duplicated).
  function buildOverlayButton(ref) {
    var existing = document.getElementById(NAV_ID);
    if (existing) return existing;
    var btn = document.createElement('button');
    btn.id = NAV_ID;
    btn.type = 'button';
    btn.setAttribute('aria-label', NAV_TEXT);
    // clone classes for identical look + hover behavior (but keep it out of the
    // React tree — position:fixed overlay, never touched by reconciliation)
    if (ref && ref.className) btn.className = ref.className;
    var iconWrap = document.createElement('span');
    iconWrap.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex:none;opacity:.9;';
    iconWrap.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">'
      + '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125 0-.907.907-1.648 1.648-1.688h3.542A7.46 7.46 0 0 0 22 12c0-5.5-4.78-10-10-10Z"/>'
      + '</svg>';
    var label = document.createElement('span');
    label.textContent = NAV_TEXT;
    btn.appendChild(iconWrap);
    btn.appendChild(label);
    // Explicit high z-index: without it the overlay sits at z-index:auto and ANY
    // React element with a z-index (sticky chat header, sidebar chrome) hit-tests
    // above it — the button stays VISIBLE (transparent overlaps) but clicks land
    // on the element above. 2147482000 keeps it under the panel (2147483000).
    btn.style.zIndex = '2147482000';
    btn.style.pointerEvents = 'auto';
    btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); try { openPanel(); } catch (err) { reportUiError('panel-open', err); } });
    document.body.appendChild(btn);
    return btn;
  }

  function positionOverlay() {
    var btn = document.getElementById(NAV_ID);
    if (!btn) return;
    var ref = findMarketButton();
    if (!ref) { btn.style.display = 'none'; return; }
    var r = ref.getBoundingClientRect();
    if (r.width < 24 || r.bottom < 0 || r.top > window.innerHeight) { btn.style.display = 'none'; return; }
    // position:fixed is REQUIRED — the cloned Tailwind classes set display/spacing
    // but the button lives at the END of <body>; without fixed positioning it
    // flows below the app (y≈912, off-screen) and top/left are ignored.
    btn.style.position = 'fixed';
    btn.style.display = 'flex';
    // sit directly below the market button, same width/height/left
    btn.style.left = Math.round(r.left) + 'px';
    btn.style.top = Math.round(r.bottom + 6) + 'px';
    btn.style.width = Math.round(r.width) + 'px';
    btn.style.height = Math.round(r.height) + 'px';
    // collapsed sidebar: icon-only mirror (hide the label below 120px rows)
    var lbl = btn.querySelector('span:last-child');
    if (lbl) lbl.style.display = r.width >= 120 ? '' : 'none';
    // reserve space in the nav list so the button doesn't cover the section below
    var container = ref.closest('#sidebar div') && ref.parentElement ? ref.parentElement : null;
    if (container) {
      var want = Math.round(r.height + (r.width >= 120 ? 14 : 6)) + 'px';
      if (container.style.marginBottom !== want) container.style.marginBottom = want;
    }
  }

  function ensureNav() {
    var ref = findMarketButton();
    if (!ref) { var b = document.getElementById(NAV_ID); if (b) b.style.display = 'none'; return; }
    buildOverlayButton(ref);
    positionOverlay();
  }
  // keep it aligned: sidebar layout shifts with window resizes
  window.addEventListener('resize', positionOverlay);


  function closePanel() {
    var p = document.getElementById(PANEL_ID);
    if (p) p.setAttribute('data-open', '0');
  }

  function applyActive(sel, attr, val) {
    var nodes = document.querySelectorAll(sel);
    for (var i = 0; i < nodes.length; i++) {
      var on = nodes[i].getAttribute(attr) === val;
      nodes[i].setAttribute('data-active', on ? '1' : '0');
    }
  }

  function previewWallpaper() {
    // build a wallpaper payload from current panel selection and apply live
    var p = document.getElementById(PANEL_ID);
    if (!p) return;
    var activeWall = p.querySelector('.zt-wall[data-active="1"]');
    var wp = activeWall ? JSON.parse(decodeURIComponent(activeWall.getAttribute('data-wp') || '{}')) : null;
    var cfg = JSON.parse(JSON.stringify(window.__ZTHEME_CONFIG || {}));
    cfg.wallpaper = wp ? { id: wp.id, type: wp.type, mediaUrl: wp.mediaUrl, fit: cfg.active ? cfg.active.fit : 'cover', dim: cfg.active ? cfg.active.dim : 25, blur: cfg.active ? cfg.active.blur : 0 } : null;
    window.__ZTHEME_APPLY(cfg);
  }

  // UI-side error reporting: lands in ~/.zcode/zcode-theme-studio.endpoint.log
  // via the daemon, so panel problems on machines without CDP are observable.
  function reportUiError(stage, err) {
    try {
      fetch('http://127.0.0.1:9337/zt/scene-report', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ stage: 'ui-' + stage, detail: String((err && err.message) || err).slice(0, 300), ts: Date.now() }),
      }).catch(function () {});
    } catch (e) {}
  }

  function openPanel() {
    try {
    injectStyle();
    var existing = document.getElementById(PANEL_ID);
    if (existing) { existing.setAttribute('data-open', '1'); return; }
    var cfg = window.__ZTHEME_CONFIG || {};
    var active = cfg.active || {};
    var presets = cfg.presets || [];
    var catalog = cfg.catalog || [];

    var root = document.createElement('div');
    root.id = PANEL_ID;
    root.setAttribute('data-open', '1');

    var card = document.createElement('div');
    card.className = 'zt-card';
    card.style.position = 'relative';
    card.addEventListener('click', function (e) { e.stopPropagation(); });
    root.addEventListener('click', function (e) { if (e.target === root) closePanel(); });

    var html = '';
    html += '<button class="zt-close" aria-label="\u5173\u95ed">\u00d7</button>';
    html += '<h3>\u4e3b\u9898\u5de5\u4f5c\u53f0</h3>';
    html += '<div class="zt-sub">\u6240\u6709\u8c03\u6574\u5b9e\u65f6\u751f\u6548\uff0c\u81ea\u52a8\u4fdd\u5b58</div>';

    // presets
    html += '<div class="zt-sect">\u914d\u8272\u9884\u8bbe</div><div class="zt-presets">';
    var accentOf = { 'carbon-code': '#2596be', 'cyber-neon': '#ff2bd6', 'aurora': '#00e5a0', 'paper-reading': '#9a6a2f', 'sakura-pink': '#ff7eb6', 'forest': '#4ade80', 'amber-warm': '#f59e0b', 'starsea-blue': '#38bdf8' };
    for (var i = 0; i < presets.length; i++) {
      var pr = presets[i];
      var isActive = active.preset === pr.id;
      html += '<button class="zt-preset" data-preset="' + esc(pr.id) + '" data-active="' + (isActive ? '1' : '0') + '">'
        + '<span class="zt-dot" style="background:' + esc(accentOf[pr.id] || '#888') + '"></span>'
        + '<span>' + esc(pr.nameZh || pr.name) + '</span></button>';
    }
    html += '</div>';

    // custom schemes (user-saved snapshots of preset+overrides+glass+opacity)
    var myPresets = cfg.customPresets || [];
    html += '<div class="zt-sect">我的方案 <span style="opacity:.55;font-weight:400">(配色+玻璃+透明度快照)</span></div>';
    html += '<div class="zt-myrow"><input id="zt-preset-name" type="text" placeholder="方案名称…"><button class="zt-btn" data-act="save-preset">保存当前</button></div>';
    html += '<div class="zt-mylist">';
    if (myPresets.length === 0) html += '<div class="zt-sub">暂无自定义方案，调好配色后点“保存当前”</div>';
    for (var mp = 0; mp < myPresets.length; mp++) {
      var mpv = myPresets[mp];
      html += '<span class="zt-mypreset" data-myid="' + esc(mpv.id) + '" title="' + esc(mpv.name) + '">'
        + '<span class="zt-myname">' + esc(mpv.name) + '</span>'
        + '<button type="button" class="zt-mydel" data-mydel="1" title="删除">×</button></span>';
    }
    html += '</div>';

    // wallpapers
    html += '<div class="zt-sect" style="display:flex;align-items:center;justify-content:space-between;">'
      + '<span>壁纸（点击立即应用）</span>'
      + '<span class="zt-walltools">'
      + '<button class="zt-btn" data-act="import-file">导入本地</button>'
      + '<button class="zt-btn" data-act="bing-load">必应每日</button>'
      + '<input type="file" id="zt-import-file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif,video/mp4,video/webm,video/quicktime,.mkv,.avi" style="display:none">'
      + '</span></div><div class="zt-walls">';
    var shown = 0;
    for (var j = 0; j < catalog.length && shown < 80; j++) {
      var w = catalog[j];
      // Show every wallpaper that has a usable image. Non-playable (scene /
      // application) ones apply their preview via the forcePreview fallback.
      if (!w.previewUrl) continue;
      shown++;
      var wActive = active && cfg.wallpaper && cfg.wallpaper.id === w.id;
      // Carry the FULL catalog entry, not just 3 fields: scene wallpapers need
      // sceneSrc/mediaBase/rendererUrl to mount, and dropping them here made a
      // scene click render nothing at all (wallpaper vanished).
      var wpPayload = encodeURIComponent(JSON.stringify({
        id: w.id, type: w.type, mediaUrl: w.mediaUrl, previewUrl: w.previewUrl || null,
        sceneSrc: w.sceneSrc || null, pkgUrl: w.pkgUrl || null,
        fit: w.type === 'scene' ? 'contain' : 'cover',
      }));
      var badge = w.playable ? w.type : '\u573a\u666f\u00b7\u9759\u6001';
      html += '<button class="zt-wall" data-wp="' + wpPayload + '" data-active="' + (wActive ? '1' : '0') + '" title="' + esc(w.title) + '">'
        + '<img loading="lazy" src="' + esc(w.previewUrl) + '" alt="">'
        + '<span class="zt-badge">' + esc(badge) + '</span></button>';
    }
    html += '</div>';
    if (shown === 0) html += '<div class="zt-sub">\u672a\u627e\u5230\u58c1\u7eb8\uff0c\u8bf7\u68c0\u67e5 Wallpaper Engine \u5b89\u88c5\u76ee\u5f55\u8bbe\u7f6e</div>';
    html += '<div class="zt-bing" id="zt-bing-grid" style="display:none"></div>';

    // sliders
    html += '<div class="zt-sect">\u8c03\u6574</div>';
    // NOTE: the input id must NOT be 'zt-' + key — the wallpaper dim overlay uses
    // id="zt-dim" and apply() removes it by id, which would delete this slider.
    function slider(id, label, val, min, max) {
      return '<div class="zt-row"><label for="zt-sl-' + id + '">' + label + '</label>'
        + '<input id="zt-sl-' + id + '" type="range" data-key="' + id + '" min="' + min + '" max="' + max + '" value="' + val + '">'
        + '<span class="zt-val" data-for="' + id + '">' + val + '</span></div>';
    }
    html += slider('dim', '\u80cc\u666f\u538b\u6697', active.dim, 0, 50);
    html += slider('wpBlur', '\u80cc\u666f\u6a21\u7cca', active.blur, 0, 40);
    // ---- scene render quality (only affects scene wallpapers) ----
    html += '<div class="zt-sect">\u573a\u666f\u753b\u8d28 <span style="opacity:.55;font-weight:400">(\u4ec5 scene \u7c7b\u58c1\u7eb8)</span></div>';
    // Resolution multiplier: 0 = auto. Displayed as x1.25 style labels.
    var dprVal = active.sceneRenderDpr == null ? 0 : active.sceneRenderDpr;
    html += '<div class="zt-row"><label for="zt-sl-sceneRenderDpr">\u6e32\u67d3\u5206\u8fa8\u7387</label>'
      + '<input id="zt-sl-sceneRenderDpr" type="range" data-key="sceneRenderDpr" min="0" max="20" step="5" value="' + Math.round(dprVal * 10) + '">'
      + '<span class="zt-val" data-for="sceneRenderDpr">' + (dprVal ? 'x' + dprVal : '\u81ea\u52a8') + '</span></div>';
    html += slider('sceneFps', '\u5e27\u7387', active.sceneFps == null ? 60 : active.sceneFps, 15, 60);
    var autoQ = active.sceneAutoQuality !== false;
    html += '<div class="zt-row"><label>\u81ea\u52a8\u753b\u8d28</label>'
      + '<button class="zt-btn zt-toggle" data-act="toggle-autoq" data-on="' + (autoQ ? '1' : '0') + '">'
      + (autoQ ? '\u5f00\u542f\u4e2d \u00b7 \u70b9\u51fb\u5173\u95ed' : '\u5df2\u5173\u95ed \u00b7 \u70b9\u51fb\u5f00\u542f') + '</button>'
      + '<span class="zt-val" style="width:auto;opacity:.55;font-size:11px;">\u5361\u987f\u65f6\u81ea\u52a8\u964d\u753b\u8d28</span></div>';
    html += '<div class="zt-sub" style="margin:-2px 0 8px;">\u5206\u8fa8\u7387\u4e0d\u5f71\u54cd\u94fa\u6ee1\uff08\u753b\u5e03\u59cb\u7ec8 cover\uff09\uff0c\u53ea\u6539\u6e32\u67d3\u7cbe\u5ea6</div>';
    html += slider('surfaceOpacity', '\u9762\u677f\u4e0d\u900f\u660e\u5ea6', active.surfaceOpacity, 0, 100);
    html += slider('sidebarOpacity', '\u4fa7\u680f\u4e0d\u900f\u660e\u5ea6', active.sidebarOpacity, 0, 100);
    html += slider('bubbleOpacity', '\u6d88\u606f\u6c14\u6ce1', active.bubbleOpacity, 30, 100);
    // Material: ONE choice that keeps fill and blur paired. Two independent
    // toggles produced invalid combinations (translucent fill with no blur),
    // which showed the wallpaper through each card differently -> patchy panel.
    var mat = active.material === "clear" || active.material === "solid" ? active.material : "frosted";
    var mats = [
      ["frosted", "磨砂玻璃", "填色+模糊（经典）"],
      ["clear", "透彻壁纸", "无填色无模糊"],
      ["solid", "不透底色", "不透壁纸，对比度最高"],
    ];
    html += '<div class="zt-row" style="flex-wrap:wrap;"><label>\u754c\u9762\u6750\u8d28</label>';
    for (var mi = 0; mi < mats.length; mi++) {
      var mid = mats[mi][0], mname = mats[mi][1], mdesc = mats[mi][2];
      var onStyle = (mat === mid)
        ? 'background:var(--color-accent,#38bdf8);color:#04121c;border-color:transparent;font-weight:600;'
        : '';
      html += '<button class="zt-btn" data-act="set-material" data-mat="' + esc(mid) + '" data-on="' + (mat === mid ? '1' : '0') + '"'
        + ' title="' + esc(mdesc) + '" style="' + onStyle + '">' + esc(mname) + '</button>';
    }
    html += '</div>';
    html += '<div class="zt-sub" style="margin:-2px 0 8px;">\u586b\u8272\u4e0e\u6a21\u7cca\u59cb\u7ec8\u6210\u5bf9\uff0c\u4e0d\u4f1a\u51fa\u73b0\u201c\u534a\u900f\u660e\u4f46\u65e0\u6a21\u7cca\u201d\u7684\u8272\u5757</div>';
    html += slider('glassSidebarBlur', '\u4fa7\u680f\u6a21\u7cca\u5f3a\u5ea6', active.glassSidebarBlur == null ? 0 : active.glassSidebarBlur, 0, 60);
    html += slider('glassPanelBlur', '\u9762\u677f\u6a21\u7cca\u5f3a\u5ea6', active.glassPanelBlur == null ? 0 : active.glassPanelBlur, 0, 60);
    html += '<div class="zt-sub" style="margin:-2px 0 8px;">0 = \u8ddf\u968f\u53f3\u4fa7\u539f\u751f\u503c\uff1b>0 \u5219\u8986\u76d6\u4e3a blur(Npx)\uff08\u4ec5\u78e8\u7802\u73bb\u7483\u6a21\u5f0f\u751f\u6548\uff09</div>';
    // Full-window theme curtain over the wallpaper (readability mode).
    // The button label states the ACTION (what a click will do), not the current
    // state — "关闭"/"开启" as state labels read as commands and made the toggle
    // feel inverted.
    var veilOn = active.tintMode === 'veil';
    html += '<div class="zt-row"><label>\u4e3b\u9898\u8272\u8499\u5c42</label>'
      + '<button class="zt-btn zt-toggle" data-act="toggle-veil" data-on="' + (veilOn ? '1' : '0') + '">'
      + (veilOn ? '\u5f00\u542f\u4e2d \u00b7 \u70b9\u51fb\u5173\u95ed' : '\u5df2\u5173\u95ed \u00b7 \u70b9\u51fb\u5f00\u542f') + '</button>'
      + '<span class="zt-val" style="width:auto;opacity:.55;font-size:11px;">\u58c1\u7eb8\u4e0a\u76d6\u4e3b\u9898\u8272\uff0c\u63d0\u9ad8\u53ef\u8bfb\u6027</span></div>';
    html += slider('veilOpacity', '\u8499\u5c42\u6d53\u5ea6', active.veilOpacity, 0, 100);

    // color palette (custom token overrides)
    var overrides = (cfg.overrides || {});

    // Live opacity helpers: the payload ships resolved hex values, so a slider can
    // paint the same colour at a new alpha without rebuilding the whole stylesheet.
    function liveTint(c, token) {
      var pal = c.palette || cfg.palette || {};
      var v = pal[token] || pal['--color-surface-tint'];
      return /^#[0-9a-fA-F]{6}$/.test(v || '') ? v : '#0d1626';
    }
    function liveMix(c, token, opacity) {
      var hex = (token === '--color-sidebar-tint') ? liveTint(c, '--color-sidebar') : liveTint(c, token);
      var op = Math.max(0, Math.min(100, Number(opacity) || 0));
      return 'color-mix(in srgb, ' + hex + ' ' + op + '%, transparent)';
    }
    // Read the alpha % out of an override value: color-mix(... N% ...) => N,
    // rgba(...)/hex or empty => 100 (fully opaque / not set).
    function alphaOf(val) {
      if (!val) return 100;
      var m = String(val).match(/color-mix\([^)]*?(\d+(?:\.\d+)?)%\s*,\s*transparent\)/);
      if (m) return Math.round(Number(m[1]));
      var r = String(val).match(/rgba?\([^)]*?,\s*([\d.]+)\s*\)/);
      if (r) return Math.round(Number(r[1]) * 100);
      return 100;
    }

    // Resolve any CSS color (color-mix/oklch/rgb/hex) to #rrggbb. The browser does
    // the work: assign it to a throwaway element and read back the computed rgb().
    function toHex(cssColor) {
      if (!cssColor) return null;
      if (/^#[0-9a-fA-F]{6}$/.test(cssColor)) return cssColor.toLowerCase();
      try {
        var probe = document.createElement('span');
        probe.style.color = cssColor;
        probe.style.display = 'none';
        document.body.appendChild(probe);
        var rgb = getComputedStyle(probe).color;
        probe.remove();
        var m = rgb.match(/\d+(\.\d+)?/g);
        if (!m || m.length < 3) return null;
        var hex = '#' + [0, 1, 2].map(function (i) {
          return ('0' + Math.round(Number(m[i])).toString(16)).slice(-2);
        }).join('');
        // fully transparent colors read as rgba(0,0,0,0) - not useful as a swatch value
        if (m.length >= 4 && Number(m[3]) === 0) return null;
        return hex;
      } catch (e) { return null; }
    }
    var paletteGroups = [
      ['\u80cc\u666f\u8868\u9762', [
        ['--color-background', '\u4e3b\u80cc\u666f'], ['--color-background-alt', '\u80cc\u666f\u53d8\u4f53'],
        ['--color-card', '\u5361\u7247'], ['--color-popover', '\u5f39\u7a97'],
        ['--color-secondary', '\u6b21\u7ea7\u8868\u9762'], ['--color-sidebar', '\u4fa7\u680f'],
        ['--color-input', '\u8f93\u5165\u6846'], ['--color-tab', '\u6807\u7b7e\u9875'],
      ]],
      ['\u6587\u5b57', [
        ['--color-foreground', '\u4e3b\u6587\u5b57'], ['--color-foreground-subtle', '\u6b21\u8981\u6587\u5b57'],
        ['--color-foreground-subtlest', '\u5f31\u6587\u5b57'], ['--color-primary', '\u4e3b\u6309\u94ae\u5b57'],
      ]],
      ['\u5f3a\u8c03\u8272', [
        ['--color-accent', '\u5f3a\u8c03\u4e3b\u8272'], ['--color-accent-primary', '\u94fe\u63a5/\u4e3b\u8272'],
      ]],
      ['\u8fb9\u6846', [
        ['--color-border', '\u901a\u7528\u8fb9\u6846'], ['--color-card-border', '\u5361\u7247\u8fb9\u6846'],
        ['--color-popover-border', '\u5f39\u7a97\u8fb9\u6846'], ['--color-input-border', '\u8f93\u5165\u8fb9\u6846'],
      ]],
      ['\u72b6\u6001\u8272', [
        ['--color-destructive', '\u5371\u9669/\u5220\u9664'], ['--color-destructive-foreground', '\u5371\u9669\u6587\u5b57'],
      ]],
      ['\u7ec8\u7aef', [
        ['--color-terminal-green', '\u7ec8\u7aef\u7eff'], ['--color-terminal-bright-yellow', '\u7ec8\u7aef\u9ec4'],
        ['--color-terminal-selection', '\u7ec8\u7aef\u9009\u4e2d'],
      ]],
    ];
    var hasOverrides = false;
    for (var gi = 0; gi < paletteGroups.length; gi++) {
      var tokens = paletteGroups[gi][1];
      for (var ti = 0; ti < tokens.length; ti++) {
        if (overrides[tokens[ti][0]]) { hasOverrides = true; break; }
      }
      if (hasOverrides) break;
    }
    html += '<div class="zt-sect" style="display:flex;align-items:center;justify-content:space-between;">'
      + '<span>\u8c03\u8272\u76d8 <span style="opacity:.55;font-weight:400">(\u70b9\u8272\u5757\u81ea\u5b9a\u4e49)</span></span>'
      + '<button class="zt-btn" data-act="reset-palette" style="padding:3px 10px;font-size:11px;' + (hasOverrides ? '' : 'display:none;') + '">\u91cd\u7f6e\u5168\u90e8</button>'
      + '</div>';
    html += '<div class="zt-palette">';
    for (var pg = 0; pg < paletteGroups.length; pg++) {
      var groupName = paletteGroups[pg][0];
      var groupTokens = paletteGroups[pg][1];
      html += '<div class="zt-pal-group"><div class="zt-pal-title">' + esc(groupName) + '</div><div class="zt-pal-row">';
      for (var pt = 0; pt < groupTokens.length; pt++) {
        var token = groupTokens[pt][0], label = groupTokens[pt][1];
        var cur = overrides[token] || '';
        var isCustom = !!cur;
        // Prefer host-resolved hex (payload.palette). Computed styles are
        // color-mix()/transparent under a wallpaper, so they are only a fallback.
        var hostPalette = cfg.palette || {};
        var pickerVal = toHex(cur) || (hostPalette[token] && /^#[0-9a-fA-F]{6}$/.test(hostPalette[token]) ? hostPalette[token] : null);
        if (!pickerVal) {
          try { pickerVal = toHex(getComputedStyle(document.documentElement).getPropertyValue(token).trim()); } catch (e) {}
        }
        if (!pickerVal) pickerVal = '#5b8def';
        // Alpha: a token override may be color-mix(...) with a percentage, or a
        // plain hex (fully opaque). Read back whatever the picker can express.
        var curAlpha = alphaOf(cur);
        var translucent = curAlpha < 100 ? ' zt-translucent' : '';
        html += '<div class="zt-swatch' + (isCustom ? ' zt-custom' : '') + translucent + '" data-token="' + esc(token) + '" title="' + esc(token) + ' (' + esc(label) + ')">'
          + '<button type="button" class="zt-reset-one" aria-label="\u91cd\u7f6e" title="\u6062\u590d\u9ed8\u8ba4">\u00d7</button>'
          + '<input type="color" data-token="' + esc(token) + '" value="' + pickerVal + '">'
          + '<input type="range" class="zt-alpha" data-alpha="' + esc(token) + '" min="0" max="100" value="' + curAlpha + '" title="\u900f\u660e\u5ea6 ' + curAlpha + '%">'
          + '<span class="zt-alpha-val" data-alpha-val="' + esc(token) + '">' + curAlpha + '%</span>'
          + '<span class="zt-swatch-name">' + esc(label) + '</span></div>';
      }
      html += '</div></div>';
    }
    html += '</div>';

    html += '<div class="zt-actions">'
      + '<button class="zt-btn" data-act="clear-wall">\u6e05\u9664\u58c1\u7eb8</button>'
      + '<button class="zt-btn zt-primary" data-act="close">\u5b8c\u6210</button></div>';

    card.innerHTML = html;
    root.appendChild(card);
    document.body.appendChild(root);

    card.querySelector('.zt-close').addEventListener('click', closePanel);
    var closeBtn = card.querySelector('[data-act="close"]');
    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    var clearBtn = card.querySelector('[data-act="clear-wall"]');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      var c = JSON.parse(JSON.stringify(window.__ZTHEME_CONFIG || {}));
      c.wallpaper = null;
      window.__ZTHEME_APPLY(c);
      applyActive('#zt-panel .zt-wall', 'data-wp', '__none__');
      pushConfig({ wallpaperClear: true });
      flushPending();
    });

    // preset clicks
    var presetBtns = card.querySelectorAll('.zt-preset');
    for (var k = 0; k < presetBtns.length; k++) {
      presetBtns[k].addEventListener('click', function () {
        var id = this.getAttribute('data-preset');
        applyActive('#zt-panel .zt-preset', 'data-preset', id);
        pushConfig({ preset: id });
        // apply immediately: fetch the rebuilt payload (endpoint rewrites the
        // snapshot), then let the generic refresher pick it up; for instant
        // feedback ask the endpoint for the new css via a lightweight reload.
        instantApply();
      });
    }

    // Material selector: one choice drives fill AND blur together.
    var matBtns = card.querySelectorAll('[data-act="set-material"]');
    for (var mb = 0; mb < matBtns.length; mb++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          var next = btn.getAttribute("data-mat");
          var c = JSON.parse(JSON.stringify(window.__ZTHEME_CONFIG || {}));
          c.material = next;
          c.active = c.active || {};
          c.active.material = next;
          // legacy mirrors so older payload paths behave
          c.flatSurfaces = next === "clear";
          c.sidebarGlass = next === "frosted";
          // repaint buttons
          for (var i2 = 0; i2 < matBtns.length; i2++) {
            var same = matBtns[i2].getAttribute("data-mat") === next;
            matBtns[i2].setAttribute("data-on", same ? "1" : "0");
            matBtns[i2].style.cssText = same
              ? "background:var(--color-accent,#38bdf8);color:#04121c;border-color:transparent;font-weight:600;"
              : "";
          }
          window.__ZTHEME_APPLY(c);
          pushConfig({ material: next });
          flushPending();
        });
      })(matBtns[mb]);
    }
    // scene auto-quality toggle (engine-side dynamic downgrade)
    var autoqBtn = card.querySelector('[data-act="toggle-autoq"]');
    if (autoqBtn) autoqBtn.addEventListener('click', function () {
      var on = autoqBtn.getAttribute('data-on') === '1';
      var next = !on;
      var c = JSON.parse(JSON.stringify(window.__ZTHEME_CONFIG || {}));
      c.sceneAutoQuality = next;
      c.active = c.active || {};
      c.active.sceneAutoQuality = next;
      autoqBtn.setAttribute('data-on', next ? '1' : '0');
      autoqBtn.textContent = next ? '\u5f00\u542f\u4e2d \u00b7 \u70b9\u51fb\u5173\u95ed' : '\u5df2\u5173\u95ed \u00b7 \u70b9\u51fb\u5f00\u542f';
      try { window.__ZTHEME_WP_KEY = ''; } catch (e) {}
      window.__ZTHEME_APPLY(c);
      pushConfig({ sceneAutoQuality: next });
      flushPending();
    });

    // sidebar material toggle: merged <-> glass (both directions, instantly)
    var sglassBtn = card.querySelector('[data-act="toggle-sglass"]');
    if (sglassBtn) sglassBtn.addEventListener('click', function () {
      var on = sglassBtn.getAttribute('data-on') === '1';
      var next = !on;
      var c = JSON.parse(JSON.stringify(window.__ZTHEME_CONFIG || {}));
      c.sidebarGlass = next;
      c.active = c.active || {};
      c.active.sidebarGlass = next;
      sglassBtn.setAttribute('data-on', next ? '1' : '0');
      sglassBtn.textContent = next ? '\u73bb\u7483\u6a21\u7cca \u00b7 \u70b9\u51fb\u878d\u5408' : '\u878d\u5408\u80cc\u666f \u00b7 \u70b9\u51fb\u73bb\u7483';
      // Clear any leftover live-preview stylesheet first: it forces a filter with
      // !important and was the reason the toggle appeared one-way.
      var stale = document.getElementById('zt-live-glass');
      if (stale) stale.remove();
      window.__ZTHEME_APPLY(c);
      pushConfig({ sidebarGlass: next });
      flushPending();
    });

    // sidebar colour unification toggle
    var unifyBtn = card.querySelector('[data-act="toggle-unify"]');
    if (unifyBtn) unifyBtn.addEventListener('click', function () {
      var c = JSON.parse(JSON.stringify(window.__ZTHEME_CONFIG || {}));
      var on = unifyBtn.getAttribute('data-on') === '1';
      var next = !on;
      c.unifySidebar = next;
      c.active = c.active || {};
      c.active.unifySidebar = next;
      unifyBtn.setAttribute('data-on', next ? '1' : '0');
      unifyBtn.textContent = next ? '\u5df2\u540c\u8272 \u00b7 \u70b9\u51fb\u53d6\u6d88' : '\u672a\u540c\u8272 \u00b7 \u70b9\u51fb\u540c\u8272';
      // live: repaint --color-sidebar from the panel tint at the panel opacity
      var pal = c.palette || (window.__ZTHEME_CONFIG || {}).palette || {};
      var surfaceTint = pal['--color-background'] || '#0d1626';
      var act = c.active || {};
      var op = act.surfaceOpacity == null ? 75 : act.surfaceOpacity;
      c.overrides = c.overrides || {};
      if (next) {
        c.overrides['--color-sidebar'] = 'color-mix(in srgb, ' + surfaceTint + ' ' + op + '%, transparent)';
      } else {
        delete c.overrides['--color-sidebar'];
      }
      window.__ZTHEME_APPLY(c);
      pushConfig({ unifySidebar: next });
      flushPending();
    });

    // theme-colour curtain toggle (veil mode over the wallpaper)
    var veilBtn = card.querySelector('[data-act="toggle-veil"]');
    if (veilBtn) veilBtn.addEventListener('click', function () {
      var c = JSON.parse(JSON.stringify(window.__ZTHEME_CONFIG || {}));
      var on = veilBtn.getAttribute('data-on') === '1';
      var next = !on;
      c.tintMode = next ? 'veil' : 'clear';
      c.active = c.active || {};
      c.active.tintMode = c.tintMode;
      if (c.active.veilOpacity == null) c.active.veilOpacity = 45;
      c.veilOpacity = c.active.veilOpacity;
      veilBtn.setAttribute('data-on', next ? '1' : '0');
      veilBtn.textContent = next ? '\u5f00\u542f\u4e2d \u00b7 \u70b9\u51fb\u5173\u95ed' : '\u5df2\u5173\u95ed \u00b7 \u70b9\u51fb\u5f00\u542f';
      // Apply locally first: buildVeil() reads mode from CFG/active and creates or
      // removes the layer immediately, so the click has instant visible feedback
      // even before the endpoint rebuilds the stylesheet.
      window.__ZTHEME_APPLY(c);
      pushConfig({ tintMode: c.tintMode, veilOpacity: c.veilOpacity });
      flushPending();
    });

    // wallpaper clicks
    var wallBtns = card.querySelectorAll('.zt-wall');
    for (var m = 0; m < wallBtns.length; m++) {
      wallBtns[m].addEventListener('click', function () {
        var ids = [];
        for (var q = 0; q < wallBtns.length; q++) ids.push(wallBtns[q].getAttribute('data-wp'));
        var mine = this.getAttribute('data-wp');
        for (var q2 = 0; q2 < wallBtns.length; q2++) wallBtns[q2].setAttribute('data-active', wallBtns[q2] === this ? '1' : '0');
        var wp = JSON.parse(decodeURIComponent(mine));
        // Resolve the authoritative catalog entry: it carries sceneSrc/mediaBase
        // resolved by the host. Without them a scene wallpaper cannot mount and
        // the layer just disappears.
        var catEntry = null;
        var catList = (window.__ZTHEME_CONFIG || {}).catalog || catalog || [];
        for (var cq = 0; cq < catList.length; cq++) { if (catList[cq].id === wp.id) { catEntry = catList[cq]; break; } }
        var isScene = (catEntry && catEntry.sceneSrc) || wp.sceneSrc;
        var c = JSON.parse(JSON.stringify(window.__ZTHEME_CONFIG || {}));
        c.wallpaper = {
          id: wp.id,
          type: isScene ? 'scene' : wp.type,
          mediaUrl: wp.mediaUrl,
          previewUrl: wp.previewUrl || (catEntry && catEntry.previewUrl) || null,
          sceneSrc: isScene ? (wp.sceneSrc || catEntry.sceneSrc) : null,
          mediaBase: isScene ? ('http://127.0.0.1:9337/we/media/' + encodeURIComponent(wp.id)) : null,
          rendererUrl: isScene ? 'http://127.0.0.1:9337/we/renderer.html' : null,
          fit: wp.fit || 'cover',
          dim: (c.active && c.active.dim) || 25,
          blur: 0,
        };
        window.__ZTHEME_APPLY(c);
        var cur = c.active || {};
        // Do NOT send fit here: the endpoint derives the correct fit from the
        // wallpaper's own type (contain for scene, cover otherwise). Sending the
        // stale value used to force scenes into cover.
        pushConfig({ wallpaperId: wp.id, dim: cur.dim });
        flushPending();
      });
    }

    // sliders
    var ranges = card.querySelectorAll('input[type=range]');
    for (var r = 0; r < ranges.length; r++) {
      ranges[r].addEventListener('input', function () {
        var key = this.getAttribute('data-key');
        var val = Number(this.value);
        var out = card.querySelector('[data-for="' + key + '"]');
        if (out) out.textContent = val;
        var c = JSON.parse(JSON.stringify(window.__ZTHEME_CONFIG || {}));
        if (!c.active) c.active = {};
        if (key === 'dim') { if (c.wallpaper) c.wallpaper.dim = val; c.active.dim = val; }
        else if (key === 'wpBlur') { if (c.wallpaper) c.wallpaper.blur = val; c.active.blur = val; }
        else if (key === 'surfaceOpacity') { c.surfaceOpacity = val; c.active.surfaceOpacity = val; }
        else if (key === 'sidebarOpacity') { c.sidebarOpacity = val; c.active.sidebarOpacity = val; }
        else if (key === 'bubbleOpacity') { c.bubbleOpacity = val; c.active.bubbleOpacity = val; }
        else if (key === 'glassSidebarBlur') { c.glassSidebarBlur = val; c.active.glassSidebarBlur = val; }
        else if (key === 'glassPanelBlur') { c.glassPanelBlur = val; c.active.glassPanelBlur = val; }
        else if (key === 'veilOpacity') { c.veilOpacity = val; c.active.veilOpacity = val; }
        // Scene quality. The resolution slider works in tenths (0 = auto), so it
        // maps 0..20 -> 0..2.0. Changing either value requires a REMOUNT of the
        // scene (the engine reads these at createScene), which the rebuild below
        // triggers by resetting the wallpaper key.
        else if (key === 'sceneRenderDpr') {
          var dpr = val <= 0 ? null : Math.round(val) / 10;
          c.sceneRenderDpr = dpr; c.active.sceneRenderDpr = dpr;
          var lbl = card.querySelector('[data-for="sceneRenderDpr"]');
          if (lbl) lbl.textContent = dpr ? ('x' + dpr) : '\u81ea\u52a8';
        }
        else if (key === 'sceneFps') { c.sceneFps = val; c.active.sceneFps = val; }
        // Opacity sliders must repaint LIVE. __ZTHEME_APPLY reuses the payload's
        // prebuilt CSS string, so changing a field never regenerates tokens — the
        // slider would only take effect after the endpoint round-trip on 'change'.
        // Push the concrete value into the live override layer instead (same
        // channel the colour pickers use), then apply.
        if (key === 'sidebarOpacity') {
          c.overrides = c.overrides || {};
          c.overrides['--color-sidebar'] = liveMix(c, '--color-sidebar-tint', val);
        }
        if (key === 'surfaceOpacity') {
          c.overrides = c.overrides || {};
          var SURF = ['--color-card', '--color-card-selected', '--color-popover', '--color-popover-header',
            '--color-input', '--color-input-focused', '--color-secondary', '--color-tab'];
          for (var si = 0; si < SURF.length; si++) c.overrides[SURF[si]] = liveMix(c, '--color-surface-tint', val);
        }
        // Glass blur: applied by the engine through inline styles on the actual
        // nodes (it knows the app's native filter string). No live style tag —
        // that tag used !important and stuck around forever, which made the
        // sidebar-glass toggle one-way.
        // Scene quality only takes effect on (re)mount: createScene reads fps and
        // renderDpr once. Remount on 'change' (not on every input tick) so dragging
        // stays smooth and the scene is not torn down dozens of times.
        window.__ZTHEME_APPLY(c);
      });
      ranges[r].addEventListener('change', function () {
        var key = this.getAttribute('data-key');
        var val = Number(this.value);
        var patch = {};
        if (key === 'dim') patch.dim = val;
        else if (key === 'wpBlur') patch.blur = val;
        else if (key === 'glassSidebarBlur') patch.glassSidebarBlur = val;
        else if (key === 'glassPanelBlur') patch.glassPanelBlur = val;
        else if (key === 'veilOpacity') patch.veilOpacity = val;
        else if (key === 'sceneRenderDpr') patch.sceneRenderDpr = val <= 0 ? 0 : Math.round(val) / 10;
        else if (key === 'sceneFps') patch.sceneFps = val;
        else patch[key] = val;
        // Remount only for the scene-quality knobs: the engine reads them inside
        // createScene, so the canvas has to be rebuilt for a new value to apply.
        // Clearing the wallpaper key makes the next apply() build a fresh layer.
        if (key === 'sceneRenderDpr' || key === 'sceneFps') {
          try { window.__ZTHEME_WP_KEY = ''; } catch (e) {}
          try { if (window.__ZTHEME_SCENE_ARM) { clearInterval(window.__ZTHEME_SCENE_ARM); window.__ZTHEME_SCENE_ARM = null; } } catch (e) {}
        }
        pushConfig(patch);
        flushPending();
      });

      // ---- color palette: live preview on input, persist on change, reset per-token ----
      var palette = card.querySelector('.zt-palette');
      if (palette) {
        function setOverride(token, value) {
          var c = JSON.parse(JSON.stringify(window.__ZTHEME_CONFIG || {}));
          
          c.overrides = c.overrides || {};
          if (value) c.overrides[token] = value;
          else delete c.overrides[token];
          window.__ZTHEME_APPLY(c);
          pushConfig({ setOverride: { token: token, value: value || null } });
          return c;
        }
        var pickers = palette.querySelectorAll('input[type=color]');
        for (var pc = 0; pc < pickers.length; pc++) {
          (function (input) {
            var token = input.getAttribute('data-token');
            // Compose hex + alpha into one override value. Keeping them in one
            // string means either control can change without clobbering the other.
            function composed(hex, alpha) {
              var a = Math.max(0, Math.min(100, Number(alpha == null ? 100 : alpha)));
              if (a >= 100) return hex;
              return 'color-mix(in srgb, ' + hex + ' ' + a + '%, transparent)';
            }
            function alphaInput() {
              return palette.querySelector('input.zt-alpha[data-alpha="' + token + '"]');
            }
            input.addEventListener('input', function () {
              // live preview: apply locally only (no persist until change)
              var c = JSON.parse(JSON.stringify(window.__ZTHEME_CONFIG || {}));
              var ai = alphaInput();
              c.overrides = c.overrides || {};
              c.overrides[token] = composed(input.value, ai ? ai.value : 100);
              window.__ZTHEME_APPLY(c);
            });
            input.addEventListener('change', function () {
              var ai = alphaInput();
              var c = setOverride(token, composed(input.value, ai ? ai.value : 100));
              var sw = input.closest('.zt-swatch');
              if (sw) { sw.classList.add('zt-custom'); if (ai && Number(ai.value) < 100) sw.classList.add('zt-translucent'); }
              flushPending();
            });
          })(pickers[pc]);
        }
        // ---- alpha sliders (one per token) ----
        var alphas = palette.querySelectorAll('input.zt-alpha');
        for (var ac = 0; ac < alphas.length; ac++) {
          (function (slider) {
            var token = slider.getAttribute('data-alpha');
            function colorInput() {
              return palette.querySelector('input[type=color][data-token="' + token + '"]');
            }
            function paint(val) {
              var ci = colorInput();
              var hex = ci ? ci.value : '#5b8def';
              var a = Math.max(0, Math.min(100, Number(val)));
              var c = JSON.parse(JSON.stringify(window.__ZTHEME_CONFIG || {}));
              c.overrides = c.overrides || {};
              c.overrides[token] = a >= 100 ? hex : ('color-mix(in srgb, ' + hex + ' ' + a + '%, transparent)');
              window.__ZTHEME_APPLY(c);
              var lbl = palette.querySelector('[data-alpha-val="' + token + '"]');
              if (lbl) lbl.textContent = a + '%';
              slider.title = '\u900f\u660e\u5ea6 ' + a + '%';
              var sw = slider.closest('.zt-swatch');
              if (sw) {
                if (a < 100) sw.classList.add('zt-translucent'); else sw.classList.remove('zt-translucent');
                if (a !== 100) sw.classList.add('zt-custom');
              }
            }
            slider.addEventListener('input', function () { paint(slider.value); });
            slider.addEventListener('change', function () {
              paint(slider.value);
              var ci = colorInput();
              var hex = ci ? ci.value : '#5b8def';
              var a = Math.max(0, Math.min(100, Number(slider.value)));
              setOverride(token, a >= 100 ? hex : ('color-mix(in srgb, ' + hex + ' ' + a + '%, transparent)'));
              syncResetAll();
              flushPending();
            });
          })(alphas[ac]);
        }
        var resetOne = palette.querySelectorAll('.zt-reset-one');
        for (var ro = 0; ro < resetOne.length; ro++) {
          (function (btn) {
            btn.addEventListener('click', function (e) {
              e.stopPropagation();
              var token = btn.closest('.zt-swatch').getAttribute('data-token');
              setOverride(token, null);
              btn.closest('.zt-swatch').classList.remove('zt-custom');
              syncResetAll();
              flushPending();
            });
          })(resetOne[ro]);
        }
        // The reset-all button is always rendered; show it only while overrides exist.
        function syncResetAll() {
          var btn = card.querySelector('[data-act="reset-palette"]');
          if (!btn) return;
          var any = Object.keys((window.__ZTHEME_CONFIG || {}).overrides || {}).length > 0;
          btn.style.display = any ? '' : 'none';
        }
        var resetAll = card.querySelector('[data-act="reset-palette"]');
        if (resetAll) resetAll.addEventListener('click', function () {
          var c = JSON.parse(JSON.stringify(window.__ZTHEME_CONFIG || {}));
          c.overrides = {};
          window.__ZTHEME_APPLY(c);
          pushConfig({ clearOverrides: true });
          var customs = palette.querySelectorAll('.zt-swatch.zt-custom');
          for (var rc = 0; rc < customs.length; rc++) customs[rc].classList.remove('zt-custom');
          syncResetAll();
          flushPending();
        });
        // keep it in sync when an override is added via a picker
        var _origSet = setOverride;
        setOverride = function (token, value) { var r = _origSet(token, value); syncResetAll(); return r; };
        syncResetAll();
      }
    }
    wireExtraSections(card);
    } catch (e) { reportUiError('panel-build', e); throw e; }
  }

  // Full re-render: closePanel only hides (openPanel early-returns on an
  // existing node), so a rebuild must REMOVE the panel node first.
  function rebuildPanel() {
    var p = document.getElementById(PANEL_ID);
    if (p && p.parentNode) p.parentNode.removeChild(p);
    openPanel();
  }

  function wireExtraSections(card) {
    // ---- custom schemes: save / apply / delete ----
    var saveBtn = card.querySelector('[data-act="save-preset"]');
    if (saveBtn) saveBtn.addEventListener("click", function () {
      var inp = card.querySelector('#zt-preset-name');
      var name = (inp && inp.value || '').trim();
      pushConfig({ saveCustomPreset: { name: name } });
      flushPending(function () { rebuildPanel(); });
    });
    var chips = card.querySelectorAll('.zt-mypreset');
    for (var ci = 0; ci < chips.length; ci++) {
      (function (chip) {
        chip.addEventListener("click", function (e) {
          if (e.target && e.target.classList && e.target.classList.contains("zt-mydel")) {
            pushConfig({ deleteCustomPreset: chip.getAttribute("data-myid") });
            flushPending(function () { rebuildPanel(); });
            return;
          }
          pushConfig({ applyCustomPreset: chip.getAttribute("data-myid") });
          flushPending(function () { rebuildPanel(); });
        });
      })(chips[ci]);
    }
    // ---- local import (image/video) ----
    var importBtn = card.querySelector('[data-act="import-file"]');
    var fileInput = card.querySelector('#zt-import-file');
    if (importBtn && fileInput) importBtn.addEventListener("click", function () { fileInput.value = ""; fileInput.click(); });
    if (fileInput) fileInput.addEventListener("change", function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      var status = card.querySelector('[data-act="import-status"]');
      var setSt = function (t) { if (status) status.textContent = t; };
      setSt('导入中… ' + f.name);
      try {
        var kind = (f.type && f.type.indexOf("video/") === 0) ? "video" : "image";
        var ext = new RegExp('\\.[a-z0-9]+$', 'i');
        fetch('http://127.0.0.1:9337/zt/import?name=' + encodeURIComponent(f.name) + '&kind=' + kind + '&title=' + encodeURIComponent(f.name.replace(ext, '')), { method: 'POST', body: f })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (!j.ok) { setSt('导入失败: ' + (j.error || '')); return; }
            setSt('');
            pushConfig({ wallpaperId: j.id });
            flushPending(function () { rebuildPanel(); });
          })
          .catch(function () { setSt('导入失败（本地服务未运行）'); });
      } catch (e) { setSt(String(e.message || e)); }
    });
    // ---- Bing daily ----
    var bingBtn = card.querySelector('[data-act="bing-load"]');
    var grid = card.querySelector('#zt-bing-grid');
    if (bingBtn && grid) bingBtn.addEventListener("click", function () {
      if (grid.getAttribute('data-loaded') === '1') { grid.style.display = (grid.style.display === 'none') ? '' : 'none'; return; }
      grid.style.display = '';
      grid.textContent = '加载中…';
      fetch('http://127.0.0.1:9337/zt/bing?n=8').then(function (r) { return r.json(); }).then(function (j) {
        if (!j.ok) throw new Error(j.error || 'bing unavailable');
        var imgs = j.images || [];
        var h = '';
        for (var i = 0; i < imgs.length; i++) {
          h += '<button class="zt-wall" data-bing="' + esc(imgs[i].full) + '" data-bdate="' + esc(imgs[i].date || '') + '" data-btitle="' + esc(imgs[i].title || '') + '" title="' + esc(imgs[i].title) + '">'
            + '<img loading="lazy" src="' + esc(imgs[i].thumb || imgs[i].full) + '" alt="">'
            + '<span class="zt-badge">' + esc(imgs[i].date || '') + '</span></button>';
        }
        grid.innerHTML = h;
        grid.setAttribute('data-loaded', '1');
        var bs = grid.querySelectorAll('[data-bing]');
        for (var k = 0; k < bs.length; k++) {
          (function (b) {
            b.addEventListener("click", function () {
              b.setAttribute('data-active', '0');
              fetch('http://127.0.0.1:9337/zt/bing-apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: b.getAttribute('data-bing'), title: b.getAttribute('data-btitle'), date: b.getAttribute('data-bdate') }) })
                .then(function (r) { return r.json(); })
                .then(function (j2) {
                  if (j2.ok && j2.payload) window.__ZTHEME_APPLY(j2.payload);
                  rebuildPanel();
                })
                .catch(function () {});
            });
          })(bs[k]);
        }
      }).catch(function (e) { grid.textContent = "必应拉取失败: " + (e.message || e); });
    });
  }

  // Persist a change through the local endpoint; it replies with a fresh payload
  // which we apply immediately (instant feedback, no waiting for the 3s refresh).
  var PENDING = null;
  function pushConfig(patch) {
    PENDING = PENDING || [];
    PENDING.push(patch);
  }
  function flushPending(done) {
    if (!PENDING || !PENDING.length) { if (done) done(null); return; }
    var batch = PENDING; PENDING = [];
    try {
      var x = new XMLHttpRequest();
      x.open('POST', 'http://127.0.0.1:9337/zt/apply', true);
      x.setRequestHeader('Content-Type', 'application/json');
      x.onload = function () {
        try {
          var r = JSON.parse(x.responseText || '{}');
          if (r.payload) { window.__ZTHEME_APPLY(r.payload); }
        } catch (e) {}
        if (done) done(null);
      };
      x.onerror = function () { if (done) done(new Error('endpoint offline')); };
      x.send(JSON.stringify({ patches: batch }));
    } catch (e) { if (done) done(e); }
  }
  function instantApply() { flushPending(); }
  setInterval(function () { flushPending(); }, 400);

  function boot() {
    injectStyle();
    ensureNav();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  // sidebar re-renders on navigation: keep the nav entry present
  setInterval(function () { ensureNav(); positionOverlay(); }, 2500);
  // React sidebar re-renders can move the anchor mid-interval: observe and
  // reposition within ~120ms instead of waiting for the next tick.
  var _posPending = false;
  function schedulePosition() {
    if (_posPending) return;
    _posPending = true;
    setTimeout(function () { _posPending = false; positionOverlay(); }, 120);
  }
  function watchSidebar() {
    var sb = document.getElementById('sidebar');
    if (!sb || sb.__ztObserved) { setTimeout(watchSidebar, 3000); return; }
    try {
      var mo = new MutationObserver(schedulePosition);
      mo.observe(sb, { childList: true, subtree: true });
      sb.__ztObserved = true;
    } catch (e) {}
  }
  watchSidebar();
  window.__ZTHEME_UI = { open: openPanel, close: closePanel };
})();
`;
