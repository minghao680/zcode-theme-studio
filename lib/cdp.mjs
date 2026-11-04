// Minimal zero-dependency Chrome DevTools Protocol client (Node >= 22, global WebSocket).
// Usage:
//   const cdp = await connect(9333);        // connects to the first ZCode renderer target
//   await cdp.evaluate('1+1');              // -> value
//   await cdp.send('Page.enable');
//   await cdp.addInitScript(src);           // persisted across reloads
//   cdp.close();

export async function listTargets(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`CDP /json/list HTTP ${res.status}`);
  return res.json();
}

export function pickRendererTargets(targets) {
  return targets.filter(t => t.type === 'page' && /index\.html/.test(t.url) && !/devtools/.test(t.url));
}

export async function connect(port, { targetUrlHint = 'index.html' } = {}) {
  const targets = await listTargets(port);
  const pages = pickRendererTargets(targets).filter(t => t.url.includes(targetUrlHint));
  const pool = pages.length ? pages : pickRendererTargets(targets);
  if (!pool.length) throw new Error('No ZCode renderer target found. Is ZCode running with --remote-debugging-port?');
  const results = [];
  for (const t of pool) results.push(await connectTarget(t));
  return results.length === 1 ? results[0] : results;
}

export async function connectToTarget(target) {
  return connectTarget(target);
}

async function connectTarget(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('CDP websocket connect timeout')), 6000);
    ws.addEventListener('open', () => { clearTimeout(to); res(); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(to); rej(new Error('CDP websocket error')); }, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', ev => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.method + ': ' + JSON.stringify(m.error))) : res(m.result); }
  });
  const send = (method, params = {}) => {
    const id = ++seq;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => {
      const to = setTimeout(() => { pending.delete(id); rej(new Error('CDP timeout: ' + method)); }, 15000);
      pending.set(id, { res: v => { clearTimeout(to); res(v); }, rej: e => { clearTimeout(to); rej(e); } });
    });
  };
  const evaluate = async expression => {
    await send('Runtime.enable').catch(() => {});
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r?.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'evaluate failed');
    return r?.result?.value;
  };
  const addInitScript = async source => {
    await send('Page.enable').catch(() => {});
    return send('Page.addScriptToEvaluateOnNewDocument', { source });
  };
  const screenshot = async () => {
    await send('Page.enable').catch(() => {});
    const r = await send('Page.captureScreenshot', { format: 'png' });
    return Buffer.from(r.data, 'base64');
  };
  const close = () => { try { ws.close(); } catch {} };
  let closeHandler = null;
  ws.addEventListener('close', () => { try { closeHandler && closeHandler(); } catch {} });
  return { target, send, evaluate, addInitScript, screenshot, close, onClose: fn => { closeHandler = fn; } };
}
