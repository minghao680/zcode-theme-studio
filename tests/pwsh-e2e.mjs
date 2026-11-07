// End-to-end: the actual daemon/watcher process-query command, but run through
// whatever powershellPath() resolves, proving the swap works on a real call.
import { spawn } from 'node:child_process';
import { powershellPath } from 'file:///G:/VSCode-idea/plugins/zcode-theme-studio/lib/pwsh.mjs';

const exe = powershellPath();
console.log('resolved shell:', exe);

// Same shape as ui-daemon.mjs / watch.mjs (single -Command, quoted filter).
const cmd = "$PSVersionTable.PSVersion.ToString(); (Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Measure-Object).Count";

const child = spawn(exe, ['-NoProfile', '-Command', cmd], { windowsHide: true });
let out = '';
child.stdout.on('data', d => { out += d; });
child.stderr.on('data', d => { out += d; });
child.on('close', code => {
  const lines = out.trim().split(/\r?\n/).filter(Boolean);
  const ver = lines[0] || '';
  const count = Number(lines[lines.length - 1]);
  console.log('exit code:', code);
  console.log('reported PS version:', ver);
  console.log('node process count:', count);
  const ok = code === 0 && /^7\./.test(ver) && Number.isFinite(count);
  console.log('');
  console.log(ok ? 'PASS: process query runs on PowerShell 7 and returns data'
                : 'FAIL: expected PS7 + a numeric count');
  process.exit(ok ? 0 : 1);
});
