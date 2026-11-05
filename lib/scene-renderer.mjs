/**
 * Scene live renderer page (adapted from dsh-wallpaper-engine v1.3.3's
 * lib/webwallgl/renderer.js, MIT, (c) elysia395 — the underlying engine is the
 * `webwallgl` npm package v3, MIT, (c) oneincase; both vendored/attributed in
 * assets/webwallgl/). This adaptation swaps dsh's default-wallpaper iframe for
 * postMessage status reporting to our host page.
 *
 * Served at GET /we/renderer.html, loaded in an iframe by bridge.js for
 * scene-type wallpapers. Query params:
 *   type        scene | web
 *   src         scene entry file (e.g. scene.pkg) or full URL for web
 *   mediaBase   base URL for the wallpaper directory
 *   fit         cover | contain | stretch
 *   sceneFps    renderer fps (default 60)
 *   fallbackImg URL of the static preview to report on failure
 *
 * Status postMessages to window.parent:
 *   { source: 'zt-scene', status: 'ready' | 'error', detail? }
 */
export function buildRendererHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>zt scene renderer</title>
<style>
  html, body { margin: 0; height: 100%; background: transparent; overflow: hidden; }
  #wp { width: 100%; height: 100%; }
  #wp canvas { width: 100%; height: 100%; display: block; }
</style>
</head>
<body>
<div id="wp"></div>
<script src="/we/engine.js"></script>
<script>
if (!globalThis.WebWallGL) { report("error", "WebWallGL engine not loaded"); throw new Error("WebWallGL engine not loaded"); }
const { createScene, httpSource, fileSource } = globalThis.WebWallGL;

const params = new URLSearchParams(location.search);
const pageType = (params.get("type") || "scene").toLowerCase();
const pageSrc = params.get("src") || "";
const pageMediaBase = params.get("mediaBase") || "";
const FITS = new Set(["cover", "contain", "stretch"]);
const fitOf = (v) => (FITS.has(v) ? v : "cover");
const fallbackImg = params.get("fallbackImg") || "";

function report(status, detail) {
  try { window.parent.postMessage({ source: "zt-scene", status: status, detail: String(detail || "").slice(0, 400) }, "*"); } catch (e) {}
}

let current = { type: pageType, src: pageSrc, mediaBase: pageMediaBase };
function diagOrigin() {
  try { return current.mediaBase ? new URL(current.mediaBase, location.href).origin : ""; } catch { return ""; }
}
function reportDiag(msg, level) {
  try {
    var origin = diagOrigin();
    if (!origin) return;
    new Image().src = origin + "/diag?msg=" + encodeURIComponent("scene " + (current.src || "?") + ": " + String(msg).slice(0, 300)) + "&lvl=" + (level === "error" || level === "warn" ? level : "info");
  } catch (e) {}
}

function webSource(entryUrl) {
  const dir = entryUrl.replace(/[?#].*$/, "").replace(/\\/[^/]*$/, "/");
  let project = null;
  return {
    key: dir,
    project() {
      project = project || fetch(dir + "/project.json")
        .then((r) => (r.ok ? r.json() : null)).catch(() => null)
        .then((p) => ({ ...(p && typeof p === "object" ? p : {}), type: "web" }));
      return project;
    },
    async webEntry() { return { url: entryUrl }; },
    scenePkg() { return Promise.reject(new Error("web wallpaper has no scene.pkg")); },
  };
}

function sourceOf(cfg) {
  if (cfg.type === "web") return cfg.src ? webSource(cfg.src) : null;
  if (!cfg.mediaBase || !cfg.src) return null;
  return httpSource(cfg.mediaBase.replace(/\\/+$/, "") + "/" + cfg.src);
}

const host = document.getElementById("wp");
const inst = createScene(host, {
  fit: fitOf(params.get("fit")),
  fps: Number(params.get("sceneFps")) || 60,
  volume: params.get("muted") === "false" ? 1 : 0,
  renderDpr: Number(params.get("renderDpr")) || 0,
  videoTexScale: Number(params.get("vidscale")) || 0,
  // 0 disables the engine's mount watchdog: WebGL scene assembly routinely needs
  // more than the default budget on a cold shader compile, and a watchdog abort
  // leaves a black canvas with no error event (looks like "nothing happens").
  mountTimeoutMs: 0,
  ...(params.get("autoq") === "0" ? { autoQuality: false } : {}),
  ...(params.get("bake") === "0" ? { bake: false } : {}),
  onDiagnostic: (msg, lvl) => {
    reportDiag(msg, lvl);
    // surface engine diagnostics to the host page too (visible in devtools/agent)
    report(lvl === "error" ? "error" : "info", "diag: " + String(msg).slice(0, 200));
  },
});

inst.on("error", (err) => {
  reportDiag("assembly failed: " + (err?.message ?? err), "error");
  report("error", "assembly failed: " + (err?.message ?? err));
});

let volume = params.get("muted") === "false" ? 1 : 0;

function loadCurrent() {
  const src = sourceOf(current);
  if (!src) { report("error", "missing mediaBase/src"); return; }
  inst.load(src)
    .then(() => {
      inst.setVolume(volume);
      // Confirm real output: a mounted-but-black canvas is not success.
      setTimeout(() => {
        try {
          var c = host.querySelector("canvas");
          if (!c || !c.width || !c.height) { report("error", "no canvas after load"); return; }
          // sample pixels via a 2d copy: blank black => report as error so the host
          // keeps the static preview visible instead of a black screen
          var s = document.createElement("canvas");
          s.width = 32; s.height = 18;
          var ctx = s.getContext("2d");
          ctx.drawImage(c, 0, 0, 32, 18);
          var d = ctx.getImageData(0, 0, 32, 18).data;
          var sum = 0, n = 0;
          for (var i = 0; i < d.length; i += 4) { sum += d[i] + d[i + 1] + d[i + 2]; n += 3; }
          var avg = sum / n;
          if (avg < 3) { report("error", "canvas is blank (avg " + avg.toFixed(1) + ")"); }
          else { report("ready", "scene rendering (avg " + avg.toFixed(1) + ")"); }
        } catch (e) { report("ready", "scene mounted (pixel check unavailable)"); }
      }, 2500);
    })
    .catch(() => { /* failure already reported via the error event */ });
}

window.addEventListener("error", (e) => report("error", "REPORT_ALL page error: " + (e.message || "unknown") + " @ " + (e.filename || "")));
window.addEventListener("unhandledrejection", (e) => report("error", "REPORT_ALL unhandled: " + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason)));
loadCurrent();
</script>
</body>
</html>
`;
}
