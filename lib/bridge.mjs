// Bridge builder: produces the tiny loader tag injected into index.html and the
// standalone engine file it loads from disk.
//
// index.html gets (right after <head>):
//   <script src="file:///...bridge.js" defer></script><!-- zcode-theme-studio patched -->
// bridge.js = the same theme engine as the CDP path with the payload inlined, so a
// plain (no CDP) ZCode launch gets theme + wallpaper with no watcher needed.
// The bridge self-refreshes: it re-reads config-snapshot.json (same folder) every
// 3s and on window focus, so theme_apply stays live without CDP.
import { readAsarFile } from './asar.mjs';
import { BOOTSTRAP, buildPayload } from './engine.mjs';
import { UI_SOURCE } from './ui.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const MARKER = '<!-- zcode-theme-studio patched -->';
const LOADER_RE = /<script src="file:\/\/[^"]*bridge\.js"[^>]*><\/script><!-- zcode-theme-studio patched -->/;

/**
 * Build a file:// URL that Chromium accepts.
 * Rules: protocol stays literal `file:///`; the drive letter keeps its colon
 * (`C:/...`); only path segments get percent-encoded.
 */
export function fileUrl(absPath) {
  const p = String(absPath).replace(/\\/g, '/');
  const driveMatch = /^([A-Za-z]):(.*)$/.exec(p);
  if (driveMatch) {
    const drive = driveMatch[1];
    const rest = driveMatch[2]; // starts with '/'
    const enc = rest.split('/').filter(s => s !== '').map(encodeURIComponent).join('/');
    return `file:///${drive}:/${enc}`;
  }
  const enc = p.split('/').filter(s => s !== '').map(encodeURIComponent).join('/');
  return 'file:///' + enc;
}

export function buildLoaderTag(bridgeUrl) {
  return `<script src="${bridgeUrl}" defer></script>${MARKER}`;
}

export function isPatched(indexHtml) {
  return indexHtml.includes(MARKER);
}

/**
 * Insert (or replace) the loader tag right after the first <head> tag.
 * IMPORTANT: strip ALL previously injected loader tags, not just the first match.
 * Earlier builds injected a malformed `file%3A///...` URL; a regex that replaces
 * only one occurrence leaves that dead tag behind, and the browser then FAILS on
 * it (ERR_FILE_NOT_FOUND) — the engine script loaded fine but the page died before
 * running it. Any tag referencing bridge.js + our marker is ours to remove.
 */
export function injectLoaderTag(indexHtml, bridgeUrl) {
  const tag = buildLoaderTag(bridgeUrl);
  let stripped = indexHtml;
  // remove every loader tag we ever injected (marker may or may not be attached)
  stripped = stripped.replace(/<script src="[^"]*bridge\.js"[^>]*><\/script><!-- zcode-theme-studio patched -->/g, '');
  stripped = stripped.replace(/<script src="[^"]*bridge\.js"[^>]*><\/script>/g, '');
  stripped = stripped.replace(/<!-- zcode-theme-studio patched -->/g, '');
  if (!stripped.includes('<head>')) throw new Error('index.html has no <head>');
  return stripped.replace('<head>', '<head>\n    ' + tag);
}

/** Count loader tags (diagnostics: >1 means a stale duplicate survived). */
export function countLoaderTags(indexHtml) {
  return (indexHtml.match(/<script src="[^"]*bridge\.js"[^>]*><\/script>/g) || []).length;
}

/**
 * Write the bridge engine file + config snapshot (same folder).
 * @param {string} bridgePath absolute output path
 * @param {object} cfg current plugin config
 * @param {Array} [catalog] optional wallpaper catalog for the sidebar UI
 */
export function writeBridge(bridgePath, cfg, catalog) {
  // catalog entries need browser-usable URLs for thumbnails + media
  const cat = (catalog || []).map(w => ({
    id: w.id,
    title: w.title,
    type: w.type,
    playable: w.playable,
    previewUrl: w.previewPath ? fileUrl(w.previewPath) : null,
    // Non-playable (scene/application) wallpapers apply their preview image via
    // the forcePreview fallback, so their mediaUrl IS the preview — the panel
    // shows every wallpaper that has any usable image.
    mediaUrl: w.mediaPath ? fileUrl(w.mediaPath) : (w.previewPath ? fileUrl(w.previewPath) : null),
    // scene live rendering: the renderer iframe fetches these from the local daemon
    sceneSrc: w.pkgPath ? w.pkgPath.split('\\').pop() : null,
    pkgUrl: w.pkgPath ? fileUrl(w.pkgPath) : null,
  }));
  const payload = buildPayload(cfg, cat);
  const dir = dirname(bridgePath);
  const engine = BOOTSTRAP; // ES5; no backslashes to escape
  const snapUrl = fileUrl(join(dir, 'config-snapshot.json'));
  const refresher = `
(function () {
  var SNAP = '${snapUrl}';
  var lastHash = '';
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return h; }
  function refresh() {
    try {
      var x = new XMLHttpRequest();
      x.open('GET', SNAP + '?_=' + Date.now(), true);
      x.onload = function () {
        try {
          if (!x.responseText) return;
          var h = hash(x.responseText);
          if (h === lastHash) return; // unchanged: do NOT re-apply (prevents wallpaper flashing)
          lastHash = h;
          window.__ZTHEME_APPLY(JSON.parse(x.responseText));
        } catch (e) {}
      };
      x.send();
    } catch (e) {}
  }
  refresh(); // prime lastHash without applying (engine already applied the inlined config)
  setInterval(refresh, 3000);
  window.addEventListener('focus', refresh);
})();`;
  const file = `/* zcode-theme-studio bridge v1.4 (auto-generated; safe to delete to uninstall) */
window.__ZTHEME_CONFIG = ${JSON.stringify(payload)};
${engine}
${UI_SOURCE}
${refresher}
`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(bridgePath, file);
  writeFileSync(join(dir, 'config-snapshot.json'), JSON.stringify(payload));
  return bridgePath;
}

export function readIndexHtml(asarPath) {
  return readAsarFile(asarPath, 'out/renderer/index.html').toString('utf8');
}
