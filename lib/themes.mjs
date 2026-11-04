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
  const surfOp = Math.max(0, Math.min(100, cfg.surfaceOpacity ?? 88));
  const sideOp = Math.max(0, Math.min(100, cfg.sidebarOpacity ?? surfOp - 12));
  const bubbleOp = Math.max(30, Math.min(100, cfg.bubbleOpacity ?? 78));
  const glass = cfg.glass || { enabled: true, blur: 16, style: 'frosted' };
  const liquid = glass.style === 'liquid';
  const out = [];

  out.push(`/* zcode-theme-studio v1.2 preset=${cfg.preset || 'none'} wallpaper=${hasWallpaper ? 'on' : 'off'} glass=${glass.enabled ? glass.style : 'off'} */`);
  out.push(':root, html.dark, html {');

  if (hasWallpaper) {
    // Wallpaper mode: main surfaces become translucent; wallpaper layer shows through.
    out.push(`  --color-background: transparent;`);
    out.push(`  --color-background-alt: ${mix(t['--color-surface-tint'] || '#202020', 40)};`);
    out.push(`  --color-background-win-alt: ${mix(t['--color-surface-tint'] || '#202020', Math.min(surfOp, 60))};`);
    for (const tok of SURFACE_TOKENS) out.push(`  ${tok}: ${mix(t['--color-surface-tint'] || '#202020', surfOp)};`);
    out.push(`  --color-sidebar: ${mix(t['--color-sidebar-tint'] || t['--color-surface-tint'] || '#181818', sideOp)};`);
  } else if (t['--color-surface-tint']) {
    // No wallpaper: deep tint backgrounds instead of stock #161616.
    out.push(`  --color-background: ${mix(t['--color-surface-tint'], 100)};`);
    out.push(`  --color-background-win-alt: ${mix(t['--color-surface-tint'], 100)};`);
    for (const tok of SURFACE_TOKENS) out.push(`  ${tok}: ${mix(t['--color-surface-tint'], surfOp === 100 ? 100 : 92)};`);
    out.push(`  --color-sidebar: ${mix(t['--color-sidebar-tint'] || t['--color-surface-tint'], 100)};`);
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
  if (hasWallpaper) {
    const tint = t['--color-surface-tint'] || '#202020';
    const bubbleBg = `color-mix(in srgb, ${tint} ${bubbleOp}%, transparent)`;
    const bubbleFilter = liquid
      ? 'blur(18px) saturate(1.7) brightness(1.06)'
      : 'blur(14px) saturate(1.3)';
    out.push(`[class*='user-row'] .rounded-tr-xs, [class*='user-row'] [class*='rounded-tr-'] {
  background: ${bubbleBg} !important;
  backdrop-filter: ${bubbleFilter};
  box-shadow: 0 4px 18px rgba(0,0,0,.18);
}`);
    if (liquid) {
      out.push(`[class*='user-row'] .rounded-tr-xs, [class*='user-row'] [class*='rounded-tr-'] {
  box-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 8px 28px rgba(0,0,0,.22);
  border: 1px solid rgba(255,255,255,.10);
}`);
    }
  }

  // ----- liquid glass surface treatment for marked nodes (sidebar/top bar) -----
  // NOTE: no diagonal gradients — a 135deg sheen over translucent glass reads as
  // visible diagonal stripes on the sidebar. Only a faint top-edge highlight.
  if (glass.enabled && liquid) {
    out.push(`.zt-glass {
  backdrop-filter: blur(${glass.blur || 16}px) saturate(1.8) brightness(1.04) !important;
  background-image: linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,0) 44px) !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.16), 0 8px 32px rgba(0,0,0,.20);
}`);
  }
  return out.join('\n');
}
