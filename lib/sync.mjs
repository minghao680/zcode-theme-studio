// Bridge sync: after any config change, refresh bridge.js + snapshot so a
// plain-launched (patched, no CDP) ZCode picks the change up via its 3s
// self-refresher. Detects whether app.asar is patched and where the bridge lives.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { readAsarFile } from './asar.mjs';
import { isPatched, writeBridge } from './bridge.mjs';
import { scanWallpapers } from './scanner.mjs';

const here = dirname(fileURLToPath(import.meta.url));

export function asarPath() {
  return process.env.THEME_STUDIO_ASAR_PATH || join(process.env.ProgramFiles || 'C:\\Program Files', 'ZCode', 'resources', 'app.asar');
}

/** Where the bridge file lives. MUST match the URL baked into the asar loader:
 *  the canonical ~/.zcode/zcode-theme-studio/bridge.js. Never ZCODE_PLUGIN_DATA —
 *  the page would read a different file than we write. */
export function bridgePath() {
  return join(homedir(), '.zcode', 'zcode-theme-studio', 'bridge.js');
}

/** Is the installed app.asar patched with our loader? */
export function isAsarPatched() {
  try {
    const html = readAsarFile(asarPath(), 'out/renderer/index.html').toString('utf8');
    return isPatched(html);
  } catch { return 'unknown'; }
}

/** Refresh bridge.js + snapshot from the given config (no-op if asar not patched). */
export function syncBridge(cfg) {
  try {
    if (isAsarPatched() !== true) return { synced: false, reason: 'asar-not-patched' };
    // include the wallpaper catalog so the sidebar UI can render thumbnails
    let catalog = [];
    try { catalog = scanWallpapers(); } catch {}
    writeBridge(bridgePath(), cfg, catalog);
    return { synced: true, bridge: bridgePath(), catalog: catalog.length };
  } catch (e) {
    return { synced: false, reason: String(e.message || e) };
  }
}
