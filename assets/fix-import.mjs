// Fix the import block: add the missing scene-renderer import + reorder cleanly.
import { readFileSync, writeFileSync } from 'node:fs';

const p = 'C:/Users/HH0113/.zcode/cli/plugins/cache/dev-vscode-idea-plugins/zcode-theme-studio/1.5.2/lib/uiendpoint.mjs';
let s = readFileSync(p, 'utf8');

const cleanImports = [
  "import { createServer } from 'node:http';",
  "import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, appendFileSync } from 'node:fs';",
  "import { homedir } from 'node:os';",
  "import { fileURLToPath } from 'node:url';",
  "import { join, dirname } from 'node:path';",
  "const here = dirname(fileURLToPath(import.meta.url));",
  "import { scanWallpapers, findById } from './scanner.mjs';",
  "import { writeBridge } from './bridge.mjs';",
  "import { buildRendererHtml } from './scene-renderer.mjs';",
].join('\n');

// replace everything from the first import to 'const here = ...' + scanner/bridge imports block
const firstImport = s.indexOf("import { createServer } from 'node:http';");
const afterBridge = s.indexOf("import { writeBridge } from './bridge.mjs';") + "import { writeBridge } from './bridge.mjs';".length;
if (firstImport === -1 || afterBridge === -1) { console.log('import block markers not found'); process.exit(1); }
s = s.slice(0, firstImport) + cleanImports + s.slice(afterBridge);

writeFileSync(p, s);
console.log('import block rebuilt');
console.log(s.slice(firstImport, firstImport + cleanImports.length + 40));
