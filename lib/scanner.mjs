// Wallpaper Engine content scanner.
// Discovers workshop wallpapers (app 431960) across all Steam libraries and
// local projects (myprojects / defaultprojects). Borrowed discovery strategy
// from dsh-wallpaper-engine: parse libraryfolders.vdf, support multi-library.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WE_APP_ID = '431960';
const DEFAULT_STEAM_ROOTS = [
  'C:\\Program Files (x86)\\Steam',
  'C:\\Program Files\\Steam',
];

function parseLibraryRoots(steamRoot) {
  const vdfPath = join(steamRoot, 'steamapps', 'libraryfolders.vdf');
  const roots = [];
  try {
    const txt = readFileSync(vdfPath, 'utf-8');
    for (const m of txt.matchAll(/"path"\s*"([^"]+)"/g)) roots.push(m[1].replace(/\\\\/g, '\\'));
  } catch {}
  if (!roots.length) roots.push(steamRoot);
  return [...new Set(roots)];
}

function readProjectJson(dir) {
  const p = join(dir, 'project.json');
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p, 'utf-8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
  } catch { return null; }
}

function bestPreview(dir, proj) {
  for (const name of ['preview.gif', 'preview.jpg', 'preview.png', 'preview.jpeg']) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  const pv = typeof proj?.preview === 'string' ? join(dir, proj.preview) : null;
  return pv && existsSync(pv) ? pv : null;
}

function highestResImage(dir) {
  // Prefer the largest image in the folder over the small preview (dsh-wallpaper-engine behaviour).
  let best = null, bestSize = 0;
  try {
    for (const f of readdirSync(dir)) {
      if (!/\.(jpe?g|png|webp|gif)$/i.test(f) || /^preview/i.test(f)) continue;
      try { const s = statSync(join(dir, f)).size; if (s > bestSize) { bestSize = s; best = join(dir, f); } } catch {}
    }
  } catch {}
  return best;
}

function classify(dir, proj) {
  const type = String(proj?.type || '').toLowerCase();
  const rel = typeof proj?.file === 'string' ? proj.file : '';
  const abs = rel ? join(dir, rel) : null;
  switch (type) {
    case 'video':
      if (abs && existsSync(abs) && /\.(mp4|webm|ogv|mov|m4v)$/i.test(abs)) return { kind: 'video', media: abs, playable: true };
      return { kind: 'video', media: null, playable: false };
    case 'web':
      if (abs && existsSync(abs)) return { kind: 'web', media: abs, playable: true };
      return { kind: 'web', media: null, playable: false };
    case 'image':
      if (abs && existsSync(abs)) return { kind: 'image', media: abs, playable: true };
      { const img = highestResImage(dir); if (img) return { kind: 'image', media: img, playable: true }; }
      return { kind: 'image', media: null, playable: false };
    case 'combo':
    case 'scene':
    case 'application':
    default:
      // Proprietary WE runtime formats: fall back to preview assets (animated gif if present).
      { const img = highestResImage(dir); if (img) return { kind: type || 'unknown', media: img, playable: true, previewFallback: true }; }
      return { kind: type || 'unknown', media: null, playable: false, previewFallback: true };
  }
}

function scanDir(base, source, seen, out) {
  if (!existsSync(base)) return;
  let entries = [];
  try { entries = readdirSync(base, { withFileTypes: true }).filter(d => d.isDirectory()); } catch { return; }
  for (const e of entries) {
    const dir = join(base, e.name);
    const proj = readProjectJson(dir);
    if (!proj) continue;
    const id = seen.has(e.name) ? `${source}:${e.name}` : e.name;
    seen.add(e.name);
    const info = classify(dir, proj);
    out.push({
      id,
      title: (proj.title || e.name).trim().slice(0, 80),
      type: info.kind,
      playable: info.playable,
      previewFallback: !!info.previewFallback,
      dir,
      mediaPath: info.media || null,
      previewPath: bestPreview(dir, proj),
      source,
      steamUrl: source === 'workshop' ? `https://steamcommunity.com/sharedfiles/filedetails/?id=${e.name}` : null,
    });
  }
}

export function scanWallpapers({ steamRoots, workshopDir, projectsDir } = {}) {
  const roots = [];
  for (const sr of (steamRoots?.length ? steamRoots : DEFAULT_STEAM_ROOTS)) {
    if (existsSync(sr)) roots.push(...parseLibraryRoots(sr));
  }
  const out = [];
  const seen = new Set();
  for (const root of roots) {
    if (workshopDir) { scanDir(workshopDir, 'workshop', seen, out); break; } // explicit override only
    scanDir(join(root, 'steamapps', 'workshop', 'content', WE_APP_ID), 'workshop', seen, out);
  }
  for (const root of roots) {
    const weDir = join(root, 'steamapps', 'common', 'wallpaper_engine', 'projects');
    if (projectsDir) { scanDir(projectsDir, 'local', seen, out); break; }
    scanDir(join(weDir, 'myprojects'), 'local', seen, out);
    scanDir(join(weDir, 'defaultprojects'), 'local', seen, out);
  }
  return out;
}

export function findById(list, id) {
  return list.find(w => w.id === id) || null;
}
