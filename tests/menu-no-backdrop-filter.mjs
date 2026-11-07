// Regression test: the theme CSS must NOT put backdrop-filter on menu containers.
//
// Why: Radix renders MenuSubContent INSIDE its parent menu (no MenuPortal) and
// positions it with strategy='fixed'. An ancestor with backdrop-filter becomes
// the containing block for position:fixed descendants, so the submenu gets
// offset by the parent's position and clipped — it looks like it never opens.
// Verified in real Chromium by tests/submenu-containing-block.mjs.
//
// This test asserts the generated CSS keeps menu containers filter-free, and
// still gives them an opaque-enough fill so they read as a raised surface.
import { buildThemeCss } from 'file:///G:/VSCode-idea/plugins/zcode-theme-studio/lib/themes.mjs';

function gen(overrides = {}) {
  return buildThemeCss({
    material: 'frosted', surfaceOpacity: 75, sidebarOpacity: 75, bubbleOpacity: 75,
    tintMode: 'clear', theme: { preset: 'forest', overrides: {} }, overrides: {},
    glass: { enabled: true, style: 'liquid' }, ...overrides,
  }, [{ id: 'x', type: 'video' }]);
}

let pass = true;
const check = (label, ok) => { console.log((ok ? 'OK  ' : 'FAIL') + ' ' + label); pass = pass && ok; };

for (const material of ['frosted', 'solid', 'clear']) {
  const css = gen({ material });

  // Isolate the menu rules (everything up to the accent/foreground block).
  const menuBlockMatch = css.match(/\[role='menu'\][\s\S]*?background-image: none !important;\s*\}/);
  check(`[${material}] menu rules present`, !!menuBlockMatch);

  if (menuBlockMatch) {
    const block = menuBlockMatch[0];
    check(`[${material}] no backdrop-filter on menu containers`,
      !/backdrop-filter/.test(block.split('/*')[0]));
    // The fill must still be set on the container.
    check(`[${material}] container still carries a background fill`,
      /\[role='menu'\][\s\S]{0,400}?background-color:/.test(css));
  }

  // No rule anywhere may blur a [role='menu'] selector.
  const blurOnMenu = [...css.matchAll(/([^{}]+)\{[^}]*backdrop-filter[^}]*\}/g)]
    .some(m => /\[role='(menu|listbox|dialog)'\]/.test(m[1]));
  check(`[${material}] no menu/listbox/dialog selector is blurred`, !blurOnMenu);
}

console.log('');
console.log(pass ? 'PASS: menu surfaces are filled without backdrop-filter (submenu stays anchored)'
                 : 'FAIL: a menu container still has backdrop-filter');
process.exit(pass ? 0 : 1);
