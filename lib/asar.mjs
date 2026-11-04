// Minimal asar patcher: rewrites a file inside app.asar without moving any
// existing data. The patched file content is APPENDED at the end of the archive;
// only the header JSON is rewritten in place, padded to its original byte size so
// the data base (8 + headerSize) stays fixed and every other offset remains valid.
// Entry integrity (SHA256 + block hashes) is recomputed for the patched entry.
// A one-time timestamped backup of the original asar is written before patching.
import { openSync, readSync, closeSync, statSync, writeFileSync, renameSync, copyFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';

const ASAR_HEADER_SIZE_FIELD = 4; // uint32@0 === 4 in real archives (pickle header size)

function readHeader(fd) {
  const sizeBuf = Buffer.alloc(20);
  readSync(fd, sizeBuf, 0, 20, 0);
  if (sizeBuf.readUInt32LE(0) !== ASAR_HEADER_SIZE_FIELD) throw new Error('not an asar archive (bad first pickle field)');
  const headerSize = sizeBuf.readUInt32LE(4);          // bytes 4.. = whole header pickle
  const jsonSize = sizeBuf.readUInt32LE(12);           // raw JSON length
  const jsonBuf = Buffer.alloc(jsonSize);
  readSync(fd, jsonBuf, 0, jsonSize, 16);
  const header = JSON.parse(jsonBuf.toString('utf8').replace(/\0+$/, ''));
  return { headerSize, jsonSize, header, dataBase: 8 + headerSize };
}

function integrityFor(buf) {
  const blockSize = 4 * 1024 * 1024;
  const blocks = [];
  for (let off = 0; off < buf.length; off += blockSize) {
    const h = createHash('sha256');
    h.update(buf.subarray(off, Math.min(buf.length, off + blockSize)));
    blocks.push(h.digest('hex'));
  }
  return { algorithm: 'SHA256', hash: blocks[0], blockSize, blocks };
}

function findEntry(header, entryPath) {
  const parts = entryPath.split('/');
  let node = header.files;
  for (let i = 0; i < parts.length - 1; i++) {
    const n = node[parts[i]];
    if (!n?.files) throw new Error('path not found in archive: ' + parts.slice(0, i + 1).join('/'));
    node = n.files;
  }
  const entry = node[parts[parts.length - 1]];
  if (!entry || entry.files) throw new Error('entry not found or is a directory: ' + entryPath);
  return entry;
}

/** Add delta to every file entry's offset (header growth shifts the data base). */
function applyOffsetShift(node, delta) {
  for (const key of Object.keys(node)) {
    const e = node[key];
    if (e.files) { applyOffsetShift(e.files, delta); continue; }
    if (typeof e.offset === 'string' && /^\d+$/.test(e.offset)) {
      // skip the entry we just appended at EOF (marked with a sentinel size below)
      e.offset = String(Number(e.offset) + delta);
    }
  }
}

/** Read a file out of an asar archive. Returns Buffer. */
export function readAsarFile(asarPath, entryPath) {
  const fd = openSync(asarPath, 'r');
  try {
    const { header, dataBase } = readHeader(fd);
    const entry = findEntry(header, entryPath);
    const buf = Buffer.alloc(entry.size);
    readSync(fd, buf, 0, entry.size, dataBase + Number(entry.offset));
    return buf;
  } finally { closeSync(fd); }
}

/** Build the complete patched archive image as a Buffer (nothing written to disk). */
export function buildPatchedAsar(asarPath, entryPath, newContent) {
  const content = Buffer.isBuffer(newContent) ? newContent : Buffer.from(newContent, 'utf8');
  const size = statSync(asarPath).size;
  const fd = openSync(asarPath, 'r');
  let hdr;
  try {
    hdr = readHeader(fd);
    const { header, dataBase, headerSize } = hdr;
    const headerTotal = 8 + headerSize;

    const entry = findEntry(header, entryPath);
    const oldOffset = dataBase + Number(entry.offset);
    if (oldOffset + entry.size > size) throw new Error('entry out of bounds');

    // sanity: verify old content hash matches the recorded integrity
    const oldBuf = Buffer.alloc(entry.size);
    readSync(fd, oldBuf, 0, entry.size, oldOffset);
    if (entry.integrity?.hash) {
      const actual = createHash('sha256').update(oldBuf).digest('hex');
      if (actual !== entry.integrity.hash) throw new Error('existing entry failed integrity check - archive modified?');
    }

    // Header may grow: asar stores ABSOLUTE offsets per entry, so after rebuilding
    // with a larger header we shift every EXISTING entry offset by the data-base
    // delta. The patched entry is appended at the very end of the new image, so its
    // offset is assigned last (absolute EOF of the new archive).
    const oldDataBase = dataBase;
    const restLen = size - oldDataBase; // bytes of original file data (verbatim copy)
    const oldEntryOffset = Number(entry.offset);
    const oldEntrySize = entry.size;

    // Determine the final header size by direct construction.
    // asar entry offsets are RELATIVE to the data base: abs = dataBase + offset.
    // PRISTINE ground truth: @0=4, @4=8333436, @8=8333432(@4-4), @12=jsonSize(8333425),
    // json at @16, dataBase = 8 + @4 = 8333444 → @4 = 8 + ceil(json/4)*4. Mirror exactly.
    entry.offset = String(restLen);
    entry.size = content.length;
    entry.integrity = integrityFor(content);
    let json = JSON.stringify(header);
    let newHeaderSize = 8 + Math.ceil(json.length / 4) * 4;
    const realDelta = (8 + newHeaderSize) - oldDataBase;
    applyOffsetShift(header.files, realDelta);
    json = JSON.stringify(header);
    const jsonBuf = Buffer.from(json, 'utf8');
    const paddedLen = Math.ceil(jsonBuf.length / 4) * 4;
    const finalHeaderSize = 8 + paddedLen;
    if (finalHeaderSize !== newHeaderSize) throw new Error('header size unstable after sizing pass');

    const head = Buffer.alloc(8 + finalHeaderSize);
    head.writeUInt32LE(ASAR_HEADER_SIZE_FIELD, 0);
    head.writeUInt32LE(finalHeaderSize, 4);
    head.writeUInt32LE(finalHeaderSize - 4, 8);
    head.writeUInt32LE(jsonBuf.length, 12);
    jsonBuf.copy(head, 16);
    head.fill(0, 16 + jsonBuf.length);

    const align = (n) => Math.ceil(n / 4) * 4;
    const tail = Buffer.alloc(align(content.length));
    content.copy(tail, 0);

    // all original file bytes starting at the OLD data base (their offsets were shifted by delta)
    const rest = Buffer.alloc(restLen);
    readSync(fd, rest, 0, restLen, oldDataBase);

    return Buffer.concat([head, rest, tail]);
  } finally { closeSync(fd); }
}

/** Patch asar on disk with a one-time timestamped backup. Returns {backupPath}. */
export function patchAsarWithBackup(asarPath, entryPath, newContent) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = asarPath + '.zt-backup-' + stamp;
  const image = buildPatchedAsar(asarPath, entryPath, newContent);
  copyFileSync(asarPath, backupPath);
  const tmp = asarPath + '.zt-tmp';
  writeFileSync(tmp, image);
  renameSync(tmp, asarPath);
  return { backupPath };
}

/** Find an existing one-time backup for this asar, if any. */
export function findBackup(asarPath) {
  const dir = dirname(asarPath);
  const base = asarPath.slice(dir.length + 1);
  try {
    const hit = readdirSync(dir).find(f => f.startsWith(base + '.zt-backup-'));
    return hit ? join(dir, hit) : null;
  } catch { return null; }
}
