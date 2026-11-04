// Color-palette extraction from a wallpaper image, computed inside the ZCode
// renderer via CDP canvas (zero dependencies; node cannot decode JPEG/GIF).
// Returns vivid accent + dark surface tint suggestions for theme overrides.
import { connect } from './cdp.mjs';

const SAMPLER = `(async (url) => {
  const img = new Image();
  img.src = url;
  try { await img.decode(); } catch (e) { return { error: 'image decode failed: ' + e.message }; }
  const W = 96, H = 54;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const buckets = new Map();
  let sr = 0, sg = 0, sb = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    sr += r; sg += g; sb += b;
    const key = (r >> 4) + ',' + (g >> 4) + ',' + (b >> 4);
    const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  const total = d.length / 4;
  const freq = [...buckets.values()]
    .map(e => ({ n: e.n, share: e.n / total, r: Math.round(e.r / e.n), g: Math.round(e.g / e.n), b: Math.round(e.b / e.n) }))
    .filter(e => e.share >= 0.02)
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);
  const sat = e => { const mx = Math.max(e.r, e.g, e.b), mn = Math.min(e.r, e.g, e.b); return mx === 0 ? 0 : (mx - mn) / mx; };
  const lum = e => 0.2126 * e.r + 0.7152 * e.g + 0.0722 * e.b;
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  function hslToHex(h, s, l) {
    const f = (n) => {
      const k = (n + h * 12) % 12;
      const a = s * Math.min(l, 1 - l);
      const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(255 * v).toString(16).padStart(2, '0');
    };
    return '#' + f(0) + f(8) + f(4);
  }
  // Boost a washed-out color into a usable accent: saturation >= .5, lightness .42-.62
  function vividize(e) {
    const [h, s, l] = rgbToHsl(e.r, e.g, e.b);
    return hslToHex(h, Math.max(s, 0.5), Math.min(0.62, Math.max(0.42, l)));
  }
  const vivid = freq.filter(e => e.share >= 0.04).sort((a, b) => sat(b) * Math.min(1, lum(b) / 160) - sat(a) * Math.min(1, lum(a) / 160))[0]
    || freq.sort((a, b) => sat(b) - sat(a))[0];
  const dark = freq.filter(e => lum(e) < 90).sort((a, b) => b.n - a.n)[0] || freq[freq.length - 1];
  const toHex = e => '#' + [e.r, e.g, e.b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  function darkTint(e) {
    // force a dark, slightly-hued surface tint (target luminance ~ 32)
    const [h, s] = rgbToHsl(e.r, e.g, e.b);
    return hslToHex(h, Math.max(s, 0.25), 0.125);
  }
  return {
    accent: vivid ? vividize(vivid) : null,
    surfaceTint: dark ? darkTint(dark) : null,
    average: toHex({ r: sr / total, g: sg / total, b: sb / total }),
    top: freq.map(e => ({ hex: toHex(e), share: Math.round(e.share * 100) })),
  };
})`;

export async function paletteFromFile(port, filePath) {
  let u = 'file:///' + encodeURI(String(filePath).replace(/\\/g, '/'));
  u = u.replace(/#/g, '%23').replace(/\?/g, '%3F');
  const conn = await connect(port);
  if (Array.isArray(conn)) conn = conn[0];
  try {
    const r = await conn.evaluate(`(${SAMPLER})('${u.replace(/'/g, "%27")}')`);
    if (!r || r.error) throw new Error(r?.error || 'sampler returned nothing');
    return r;
  } finally {
    conn.close();
  }
}
