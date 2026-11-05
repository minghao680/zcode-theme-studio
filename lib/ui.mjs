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
      '#zt-panel .zt-close{position:absolute;right:14px;top:12px;font-size:18px;cursor:pointer;opacity:.6;background:none;border:0;color:inherit;}',
      '#zt-nav-item{cursor:pointer;}',
      '#zt-panel .zt-palette{display:flex;flex-direction:column;gap:10px;}',
      '#zt-panel .zt-pal-title{font-size:11px;opacity:.6;margin-bottom:5px;}',
      '#zt-panel .zt-pal-row{display:flex;flex-wrap:wrap;gap:8px;}',
      '#zt-panel .zt-swatch{position:relative;width:64px;cursor:pointer;text-align:center;}',
      '#zt-panel .zt-swatch input[type=color]{width:100%;height:34px;border-radius:8px;border:1px solid var(--color-border,#ffffff1a);',
      '  padding:0;background:none;cursor:pointer;}',
      '#zt-panel .zt-swatch input[type=color]::-webkit-color-swatch-wrapper{padding:2px;}',
      '#zt-panel .zt-swatch input[type=color]::-webkit-color-swatch{border:none;border-radius:6px;}',
      '#zt-panel .zt-swatch.zt-custom input[type=color]{outline:2px solid var(--color-accent,#38bdf8);outline-offset:1px;}',
      '#zt-panel .zt-swatch-name{display:block;font-size:10px;opacity:.65;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '#zt-panel .zt-swatch .zt-reset-one{position:absolute;top:-6px;right:-4px;width:16px;height:16px;border-radius:50%;',
      '  background:var(--color-destructive,#ff5c5c);color:#fff;font-size:11px;line-height:15px;text-align:center;cursor:pointer;border:0;display:none;padding:0;}',
      '#zt-panel .zt-swatch.zt-custom .zt-reset-one{display:block;}',
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
    btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); openPanel(); });
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

  function openPanel() {
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
      var wpPayload = encodeURIComponent(JSON.stringify({ id: w.id, type: w.type, mediaUrl: w.mediaUrl }));
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
    html += slider('surfaceOpacity', '\u9762\u677f\u4e0d\u900f\u660e\u5ea6', active.surfaceOpacity, 0, 100);
    html += slider('sidebarOpacity', '\u4fa7\u680f\u4e0d\u900f\u660e\u5ea6', active.sidebarOpacity, 0, 100);
    html += slider('bubbleOpacity', '\u6d88\u606f\u6c14\u6ce1', active.bubbleOpacity, 30, 100);
    html += slider('glassBlur', '\u73bb\u7483\u6a21\u7cca', (cfg.glass && cfg.glass.blur) || 16, 0, 40);

    // color palette (custom token overrides)
    var overrides = (cfg.overrides || {});

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
        html += '<div class="zt-swatch' + (isCustom ? ' zt-custom' : '') + '" data-token="' + esc(token) + '" title="' + esc(token) + ' (' + esc(label) + ')">'
          + '<button type="button" class="zt-reset-one" aria-label="\u91cd\u7f6e" title="\u6062\u590d\u9ed8\u8ba4">\u00d7</button>'
          + '<input type="color" data-token="' + esc(token) + '" value="' + pickerVal + '">'
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

    // wallpaper clicks
    var wallBtns = card.querySelectorAll('.zt-wall');
    for (var m = 0; m < wallBtns.length; m++) {
      wallBtns[m].addEventListener('click', function () {
        var ids = [];
        for (var q = 0; q < wallBtns.length; q++) ids.push(wallBtns[q].getAttribute('data-wp'));
        var mine = this.getAttribute('data-wp');
        for (var q2 = 0; q2 < wallBtns.length; q2++) wallBtns[q2].setAttribute('data-active', wallBtns[q2] === this ? '1' : '0');
        var wp = JSON.parse(decodeURIComponent(mine));
        var c = JSON.parse(JSON.stringify(window.__ZTHEME_CONFIG || {}));
        c.wallpaper = { id: wp.id, type: wp.type, mediaUrl: wp.mediaUrl, fit: 'cover', dim: (c.active && c.active.dim) || 25, blur: 0 };
        window.__ZTHEME_APPLY(c);
        var cur = c.active || {};
        pushConfig({ wallpaperId: wp.id, dim: cur.dim, fit: cur.fit });
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
        else if (key === 'surfaceOpacity') c.active.surfaceOpacity = val;
        else if (key === 'sidebarOpacity') c.active.sidebarOpacity = val;
        else if (key === 'bubbleOpacity') c.active.bubbleOpacity = val;
        else if (key === 'glassBlur') { c.glass = c.glass || {}; c.glass.blur = val; }
        window.__ZTHEME_APPLY(c);
      });
      ranges[r].addEventListener('change', function () {
        var key = this.getAttribute('data-key');
        var val = Number(this.value);
        var patch = {};
        if (key === 'dim') patch.dim = val;
        else if (key === 'wpBlur') patch.blur = val;
        else if (key === 'glassBlur') patch.glass = { blur: val };
        else patch[key] = val;
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
            input.addEventListener('input', function () {
              // live preview: apply locally only (no persist until change)
              var c = JSON.parse(JSON.stringify(window.__ZTHEME_CONFIG || {}));
              
              c.overrides = c.overrides || {};
              c.overrides[token] = input.value;
              window.__ZTHEME_APPLY(c);
            });
            input.addEventListener('change', function () {
              var c = setOverride(token, input.value);
              var sw = input.closest('.zt-swatch');
              if (sw) sw.classList.add('zt-custom');
              flushPending();
            });
          })(pickers[pc]);
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
