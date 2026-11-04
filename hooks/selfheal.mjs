#!/usr/bin/env node
// SessionStart self-heal: if the asar patch is missing (ZCode update reinstalls
// app.asar) but the user previously opted in (a .zt-optin marker exists next to
// the bridge), re-apply the patch silently via the elevated powershell script.
// Prints additionalContext so the agent can tell the user what happened.
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAsarFile } from '../lib/asar.mjs';
import { isPatched, fileUrl } from '../lib/bridge.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const asar = process.env.THEME_STUDIO_ASAR_PATH || join(process.env.ProgramFiles || 'C:\\Program Files', 'ZCode', 'resources', 'app.asar');
const dataDir = process.env.ZCODE_PLUGIN_DATA || join(homedir(), '.zcode', 'zcode-theme-studio');
const optin = join(dataDir, 'asar-patch.optin');

let patched = 'unknown';
try { patched = isPatched(readAsarFile(asar, 'out/renderer/index.html').toString('utf8')); } catch {}

if (patched !== false) process.exit(0); // patched or undeterminable: nothing to do

if (!existsSync(optin)) {
  // user never opted in - do nothing silently
  process.exit(0);
}

// opted in and patch lost (ZCode update): re-apply
const bridgePath = join(dataDir, 'bridge.js');
const bridgeUrl = fileUrl(bridgePath);
const r = await new Promise(res => {
  const c = spawn('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(here, '..', 'assets', 'asar-patch.ps1'),
    '-Asar', asar, '-PluginRoot', dirname(here), '-BridgeUrl', bridgeUrl, '-BridgePath', bridgePath,
  ], { timeout: 120000 });
  let out = '';
  c.stdout.on('data', d => { out += d; });
  c.stderr.on('data', d => { out += d; });
  c.on('close', code => res({ code, out: out.trim() }));
  c.on('error', () => res({ code: -1, out: '' }));
});

if (r.code === 0 && (r.out.includes('"patched"') || r.out.includes('alreadyPatched'))) {
  console.log(JSON.stringify({
    additionalContext: `zcode-theme-studio: ZCode 更新覆盖了 asar 补丁，已自动重新打上（bridge 已同步）。普通启动恢复生效；若当前是 CDP 模式启动则无影响。`,
  }));
} else {
  console.log(JSON.stringify({
    additionalContext: `zcode-theme-studio: 检测到 asar 补丁丢失（可能因 ZCode 更新），自动重补失败。请用户关闭 ZCode 后重跑桌面『一键打补丁(主题工作台)』脚本。`,
  }));
}
process.exit(0);
