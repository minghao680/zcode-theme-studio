#!/usr/bin/env node
// Locate the best available PowerShell for child processes.
//
// Why this exists: Windows PowerShell 5.1 is the only shell guaranteed to be on
// every Windows box, so it stays the fallback. But it has real encoding teeth:
//   - `Set-Content -Encoding UTF8` writes a BOM (PowerShell 7 does not)
//   - scripts are read using the ANSI codepage, so a UTF-8 .ps1 WITHOUT a BOM
//     has its non-ASCII text mojibake'd (verified: '中文输出测试' -> '涓枃杈撳嚭娴嬭瘯')
//   - $OutputEncoding defaults differ, which can corrupt piped child output
// PowerShell 7 (pwsh) reads UTF-8 (with or without BOM) natively and writes no
// BOM, so prefer it when installed.
//
// This is a pure resolution helper: no script is rewritten and nothing changes
// when pwsh is absent. Callers pass the returned path straight to spawn().
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

let cached = null;

function pwshCandidates() {
  const out = [];
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA || '';
  // Explicit override wins if the operator wants a specific build.
  if (process.env.ZT_PWSH_PATH) out.push(process.env.ZT_PWSH_PATH);
  out.push(join(pf, 'PowerShell', '7', 'pwsh.exe'));
  out.push(join(pf86, 'PowerShell', '7', 'pwsh.exe'));
  out.push(join(pf, 'PowerShell', '7-preview', 'pwsh.exe'));
  // Store/MSIX installs live behind a reparse point under WindowsApps that
  // fs.existsSync() cannot stat from a plain Node process (it reports false even
  // though the file is perfectly executable). They are therefore resolved via
  // `where pwsh`, not by path probing.
  out.push('pwsh.exe');
  return out;
}

function versionOf(exe) {
  try {
    const r = spawnSync(exe, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], {
      timeout: 8000, windowsHide: true, encoding: 'utf8',
    });
    if (r.status !== 0) return null;
    const major = Number((r.stdout || '').trim());
    return Number.isFinite(major) ? major : null;
  } catch { return null; }
}

/** Resolve `pwsh.exe` off PATH, tolerating MSIX reparse points. */
function whichPwsh() {
  try {
    const r = spawnSync('where.exe', ['pwsh'], { timeout: 8000, windowsHide: true, encoding: 'utf8' });
    if (r.status !== 0) return [];
    return (r.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  } catch { return []; }
}

/**
 * Absolute path to a PowerShell executable, preferring pwsh 7 over
 * Windows PowerShell 5.1. Always returns something spawnable: `powershell.exe`
 * as the last resort resolves via PATH, which is how this code behaved before.
 */
export function powershellPath() {
  if (cached) return cached;
  const tried = [];
  for (const exe of pwshCandidates()) {
    // Only stat real install paths; bare `pwsh.exe`/PATH entries are resolved by
    // executing them (which is also the authoritative check).
    if (/[\\/]/.test(exe) && !existsSync(exe)) continue;
    tried.push(exe);
    if (versionOf(exe) >= 7) { cached = exe; return cached; }
  }
  for (const exe of whichPwsh()) {
    if (tried.includes(exe)) continue;
    if (versionOf(exe) >= 7) { cached = exe; return cached; }
  }
  // No pwsh 7: keep the historical behaviour.
  cached = 'powershell.exe';
  return cached;
}

/** Human-readable summary for diagnostics (which shell, and why). */
export function powershellInfo() {
  const exe = powershellPath();
  const v = (() => {
    try {
      const r = spawnSync(exe, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
        timeout: 8000, windowsHide: true, encoding: 'utf8',
      });
      return r.status === 0 ? (r.stdout || '').trim() : 'unknown';
    } catch { return 'unknown'; }
  })();
  return { exe, version: v, isPwsh7: !/powershell\.exe$/i.test(exe) };
}
