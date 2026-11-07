// Fallback check: when pwsh 7 is unavailable, powershellPath() must return
// 'powershell.exe' (the historical behaviour) instead of throwing.
import { spawnSync } from 'node:child_process';

const script = `
const cp = require('child_process');
const orig = cp.spawnSync;
cp.spawnSync = (cmd, args, opts) => {
  const c = String(cmd);
  if (c.startsWith('where') || c.endsWith('pwsh.exe')) return { status: 1, stdout: '' };
  return orig(cmd, args, opts);
};
import('file:///G:/VSCode-idea/plugins/zcode-theme-studio/lib/pwsh.mjs').then(m => {
  const info = m.powershellInfo();
  console.log(JSON.stringify(info));
  const ok = info.exe === 'powershell.exe' && info.isPwsh7 === false;
  console.log(ok ? 'PASS: falls back to powershell.exe when pwsh is missing'
                : 'FAIL: unexpected fallback ' + info.exe);
  process.exit(ok ? 0 : 1);
});
`;

const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 30000 });
console.log((r.stdout || '').trim());
if ((r.stderr || '').trim()) console.log('stderr:', r.stderr.trim());
process.exit(r.status || 0);
