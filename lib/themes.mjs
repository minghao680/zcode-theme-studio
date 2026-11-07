// Theme engine: builds CSS from a theme config.
// Strategy (borrowed from dsh-theme): prefer design-token overrides over structural
// CSS; structural rules are feature-detected in the injected bootstrap instead.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const presets = JSON.parse(readFileSync(join(here, 'presets.json'), 'utf-8'));

export function listPresets() {
  return presets.presets.map(p => ({ id: p.id, name: p.name, nameZh: p.nameZh, dark: p.dark, tokens: Object.keys(p.tokens).length }));
}

export function getPreset(id) {
  return presets.presets.find(p => p.id === id) || null;
}

const SURFACE_TOKENS = [
  '--color-card', '--color-card-selected', '--color-popover', '--color-popover-header',
  '--color-input', '--color-input-focused', '--color-secondary', '--color-tab',
];

function mix(tint, opacity) {
  // opacity: 0-100
  return `color-mix(in srgb, ${tint} ${Math.round(opacity)}%, transparent)`;
}

/**
 * @param {object} cfg theme config: { preset, dark, overrides: {token:value},
 *   wallpaper: {id|null}, surfaceOpacity, sidebarOpacity, bubbleOpacity,
 *   glass: {enabled, blur, style: 'frosted'|'liquid'} }
 * @returns CSS text for the injected <style id="zt-style">
 */
export function buildThemeCss(cfg) {
  const preset = cfg.preset ? getPreset(cfg.preset) : null;
  const t = { ...(preset?.tokens || {}), ...(cfg.overrides || {}) };
  const hasWallpaper = !!cfg.wallpaper?.id;
  // tintMode: "veil" = the wallpaper sits behind a full-window theme-colour wash
  // (high text contrast, calmer palette — the look user asked to keep); "clear" =
  // the wallpaper shows through untouched. Default clear.
  const tintMode = cfg.tintMode === 'veil' ? 'veil' : 'clear';
  const veil = hasWallpaper && tintMode === 'veil';
  // veil strength: how much theme colour covers the wallpaper (0-100)
  const veilOp = Math.max(0, Math.min(100, cfg.veilOpacity ?? 45));
  const surfOp = Math.max(0, Math.min(100, cfg.surfaceOpacity ?? 88));
  const sideOp = Math.max(0, Math.min(100, cfg.sidebarOpacity ?? surfOp - 12));
  const bubbleOp = Math.max(30, Math.min(100, cfg.bubbleOpacity ?? 78));
  const glass = cfg.glass || { enabled: true, blur: 16, style: 'frosted' };
  const liquid = glass.style === 'liquid';
  // Two independent glass profiles. The sidebar and the right-hand composer /
  // status panels previously shared one blur value but were styled by different
  // mechanisms (our .zt-glass vs the app's own backdrop-filter), so they never
  // matched. Each group now gets its own strength; both are applied through the
  // same data-zt-glass* markers so the result is visually identical.
  const glassSide = Math.max(0, Math.min(60, cfg.glassSidebarBlur ?? glass.blur ?? 16));
  const glassPanel = Math.max(0, Math.min(60, cfg.glassPanelBlur ?? glass.blur ?? 16));
  const glassOn = !!(glass.enabled);
  const out = [];

  out.push(`/* zcode-theme-studio v1.2 preset=${cfg.preset || 'none'} wallpaper=${hasWallpaper ? 'on' : 'off'} glass=${glass.enabled ? glass.style : 'off'} */`);
  out.push(':root, html.dark, html {');

  if (hasWallpaper) {
    // Wallpaper mode. "background" tokens stay transparent in BOTH modes: a tinted
    // value there paints the entire window (they back full-viewport shells).
    // The optional veil is a dedicated layer instead (see .zt-veil below), so it
    // can be toggled and tuned without touching the layout's paint model.
    out.push(`  --color-background: transparent;`);
    out.push(`  --color-background-alt: transparent;`);
    out.push(`  --color-background-win-alt: transparent;`);
    // ---- material: ONE choice that keeps fill and blur in sync ----
    // Fill and blur must always be paired. A translucent fill WITHOUT blur shows
    // whatever wallpaper happens to sit behind each card, so a panel made of
    // several cards reads as blocks of different colours (exactly the reported
    // bug). Three internally consistent looks instead of two independent knobs:
    //   clear  - no fill, no blur   : wallpaper shows through untouched
    //   frosted- fill + blur        : blurred wallpaper behind every surface
    //   solid  - opaque fill, no blur: uniform colour, nothing shows through
    const material = (cfg.material === 'clear' || cfg.material === 'solid') ? cfg.material : 'frosted';
    const flat = material === 'clear';
    const solid = material === 'solid';
    if (flat) {
      for (const tok of SURFACE_TOKENS) out.push(`  ${tok}: transparent;`);
    } else if (solid) {
      for (const tok of SURFACE_TOKENS) out.push(`  ${tok}: ${mix(t['--color-surface-tint'] || '#202020', 100)};`);
    } else {
      for (const tok of SURFACE_TOKENS) out.push(`  ${tok}: ${mix(t['--color-surface-tint'] || '#202020', surfOp)};`);
    }
    // Sidebar colour follows the same material so both halves are ONE surface:
    //   clear  -> transparent for both
    //   solid  -> opaque for both
    //   frosted-> same tint AND same opacity for both (a preset's darker
    //             sidebar-tint is what made a glass sidebar read as a second
    //             material next to the panels)
    // Material owns colour unification now. The old `unifySidebar` flag is a
    // legacy artefact: configs written before this refactor carry it as `false`
    // (the user had turned that switch off), which would resurrect the darker
    // sidebar tint and make the two halves read as different materials again.
    // Ignore it whenever `material` is present — the material choice is explicit
    // and self-consistent.
    const legacyOptOut = cfg.material === undefined && cfg.unifySidebar === false;
    const unify = !legacyOptOut;
    const sideTint = unify
      ? (t['--color-surface-tint'] || '#202020')
      : (t['--color-sidebar-tint'] || t['--color-surface-tint'] || '#181818');
    const sideOpacity = flat ? 0 : (solid ? 100 : (unify ? surfOp : sideOp));
    out.push(`  --color-sidebar: ${flat ? 'transparent' : mix(sideTint, sideOpacity)};`);
    // Boot gate: until the wallpaper actually paints, translucent panels stack on
    // the app's own dark background and read as a tinted veil over the whole
    // window (the "everything is fogged at startup" report). The engine drops
    // html[data-zt-boot] as soon as the wallpaper layer has content, which
    // restores the translucent look — no re-apply needed.
    out.push(`html[data-zt-boot] {`);
    out.push(`  --color-background: ${mix(t['--color-surface-tint'] || '#202020', 100)};`);
    out.push(`  --color-background-alt: ${mix(t['--color-surface-tint'] || '#202020', 100)};`);
    out.push(`  --color-background-win-alt: ${mix(t['--color-surface-tint'] || '#202020', 100)};`);
    for (const tok of SURFACE_TOKENS) out.push(`  ${tok}: ${mix(t['--color-surface-tint'] || '#202020', 100)};`);
    out.push(`  --color-sidebar: ${mix(unify ? (t['--color-surface-tint'] || '#202020') : (t['--color-sidebar-tint'] || t['--color-surface-tint'] || '#181818'), 100)};`);
    out.push(`}`);
    // ---- optional full-window theme curtain (tintMode: veil) ----
    // Sits between the wallpaper and #root (z-index 0 vs 1) so it tints the
    // wallpaper without touching the UI. Sidebar glass keeps working: its
    // backdrop is the veil+wallpaper composite, not a flat colour.
    if (veil) {
      const veilTint = t['--color-surface-tint'] || '#0d1626';
      // NO backdrop-filter here. A full-window backdrop filter sitting on top of
      // an animating canvas forces Chromium to re-sample and filter the whole
      // viewport every frame — by far the biggest cost difference versus a native
      // wallpaper host (Wallpaper Engine draws nothing over its own content).
      // The gradient alone fully reproduces the visual result.
      out.push(`.zt-veil {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background: linear-gradient(180deg,
    ${mix(veilTint, Math.min(100, veilOp + 8))} 0%,
    ${mix(veilTint, veilOp)} 42%,
    ${mix(veilTint, Math.max(0, veilOp - 10))} 100%);
  will-change: opacity;
}`);
    }
  } else if (t['--color-surface-tint']) {
    // No wallpaper: deep tint backgrounds instead of stock #161616.
    out.push(`  --color-background: ${mix(t['--color-surface-tint'], 100)};`);
    out.push(`  --color-background-win-alt: ${mix(t['--color-surface-tint'], 100)};`);
    for (const tok of SURFACE_TOKENS) out.push(`  ${tok}: ${mix(t['--color-surface-tint'], surfOp === 100 ? 100 : 92)};`);
    out.push(`  --color-sidebar: ${mix(t['--color-sidebar-tint'] || t['--color-surface-tint'], 100)};`);
  }

  // ----- menus / popovers: CSS, not a JS sweep -----
  // ZCode's dropdowns, the context menu and the model picker paint hard-coded
  // dark grey (rgb(30,30,30)-ish) and do NOT read --color-* tokens, so nothing in
  // the token layer could ever reach them. A JS scan also loses the race: these
  // surfaces mount on click, often after the sweep ran.
  // An attribute selector is applied by the engine as soon as the node exists,
  // with no timing window at all.
  {
    const menuTint = t['--color-surface-tint'] || '#202020';
    // Opaque in solid mode, translucent otherwise.
    const menuBg = (cfg.material === 'solid')
      ? mix(menuTint, 100)
      : mix(menuTint, Math.max(78, surfOp));
    // NO backdrop-filter on menu containers. Verified in Chromium: an ancestor
    // with backdrop-filter becomes the containing block for position:fixed
    // descendants, and Radix positions menu content with strategy='fixed'. Since
    // MenuSubContent renders INSIDE the parent menu (no portal), a blur on the
    // parent shifted the submenu by the parent's offset and clipped it — the
    // "submenu won't open" report. Depth is faked with an opaque-enough fill
    // instead; the blur was never load-bearing (it only ever sampled what was
    // underneath the menu, which the fill already covers).
    // The CONTAINER carries the fill. Children must stay transparent — painting
    // both stacked two 78% layers and made the inside read much denser than every
    // other control (the "inner elements don't match" report).
    const menuRoots = "[role='menu'], [role='listbox'], [role='dialog']";
    out.push(`${menuRoots},
[data-radix-popper-content-wrapper] > * {
  background-color: ${menuBg} !important;
}/* Every descendant clears its own fill so only the container paints. Separators
   are EXCLUDED: their background IS the visible hairline.
   IMPORTANT: the descendant combinator must repeat on EVERY comma part —
   writing "[role=menu], [role=listbox] *" would match the containers themselves
   and punch the fill straight back out of them.
   ALSO IMPORTANT — nested submenus must be excluded. Radix's MenuSubContent does
   NOT go through MenuPortal (verified in ZCode's own bundle: the sub content
   renders through the shared popper primitive directly), so a submenu is a
   DESCENDANT of its parent menu and is itself [role='menu']. Without these
   exclusions this rule painted the submenu fully transparent, which is why the
   account menu's 界面语言/界面主题/界面模式/界面缩放 opened but were invisible. */
[role='menu'] *:not([role='separator']):not([role='menu']):not([role='listbox']):not([role='dialog']),
[role='listbox'] *:not([role='separator']):not([role='menu']):not([role='listbox']):not([role='dialog']),
[role='dialog'] *:not([role='separator']):not([role='menu']):not([role='listbox']):not([role='dialog']),
[data-radix-popper-content-wrapper] > * *:not([role='separator']):not([role='menu']):not([role='listbox']):not([role='dialog']) {
  background-color: transparent !important;
  background-image: none !important;
}
[role='separator'] {
  background-color: ${mix(t['--color-accent'] || '#38bdf8', 18)} !important;
}
[role='menuitem']:hover, [role='menuitemradio']:hover, [role='menuitemcheckbox']:hover,
[role='option']:hover, [role='menuitem'][data-highlighted] {
  background-color: ${mix(t['--color-accent'] || '#38bdf8', 22)} !important;
}`);
  }

  // Accent / foreground / border from preset or user overrides.
  for (const [k, v] of Object.entries(t)) {
    if (k === '--color-surface-tint' || k === '--color-sidebar-tint') continue;
    out.push(`  ${k}: ${v};`);
  }
  out.push('}');

  // Derived helpers: subtle foregrounds follow the preset foreground when wallpaper is on.
  if (t['--color-foreground']) {
    out.push(`:root, html.dark, html { --color-foreground-subtle: color-mix(in oklab, ${t['--color-foreground']} 62%, transparent); --color-foreground-subtlest: color-mix(in oklab, ${t['--color-foreground']} 34%, transparent); }`);
  }

  // ----- user-message bubble readability (only meaningful over wallpaper) -----
  // Selector note: ZCode is Tailwind, so `[class*='rounded-tr-']` also matches
  // arbitrary-variant classes on huge layout wrappers. Attribute-substring
  // selectors therefore painted a full-page backdrop-filter over the message
  // list (the rectangular "fog over the chat area" bug). Bubbles are now marked
  // by the engine, which measures each candidate and only tags real bubbles.
  if (hasWallpaper) {
    const tint = t['--color-surface-tint'] || '#202020';
    const bubbleBg = `color-mix(in srgb, ${tint} ${bubbleOp}%, transparent)`;
    const bubbleFilter = liquid
      ? 'blur(18px) saturate(1.7) brightness(1.06)'
      : 'blur(14px) saturate(1.3)';
    out.push(`[data-zt-bubble='1'] {
  background: ${bubbleBg} !important;
  backdrop-filter: ${bubbleFilter};
  box-shadow: 0 4px 18px rgba(0,0,0,.18);
}`);
    if (liquid) {
      out.push(`[data-zt-bubble='1'] {
  box-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 8px 28px rgba(0,0,0,.22);
  border: 1px solid rgba(255,255,255,.10);
}`);
    }
  }

  // ----- glass blur is applied INLINE by the engine, not here -----
  // The sidebar used to get its own saturate/brightness recipe from this
  // stylesheet, which could never match what the app does on the composer and
  // status bar. The engine now reads the app's real backdrop-filter off those
  // panels and copies that exact string onto the sidebar, so the two match by
  // construction. Setting a CSS rule here would override (or double up with) it.
  // NOTE: still no background painted on glass nodes — the sidebar colour must
  // come from --color-sidebar (the opacity slider) alone.
  return out.join('\n');
}
