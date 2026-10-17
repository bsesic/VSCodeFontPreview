import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { familyFromNameTable } from './fontInfo';

// Without fontconfig (Windows, macOS), installed fonts are found by reading the family
// names from the files in the system and user font folders. Only the file header and
// the name table are read.

const FONT_FILE = /\.(ttf|otf|ttc|otc)$/i;
const MAX_DEPTH = 4;

export function fontDirectories(platform = process.platform, env = process.env, home = os.homedir()): string[] {
  if (platform === 'win32') {
    const windir = env.WINDIR ?? env.SystemRoot ?? 'C:\\Windows';
    const local = env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
    return [path.join(windir, 'Fonts'), path.join(local, 'Microsoft', 'Windows', 'Fonts')];
  }
  if (platform === 'darwin') {
    return ['/System/Library/Fonts', '/Library/Fonts', path.join(home, 'Library', 'Fonts')];
  }
  return ['/usr/share/fonts', '/usr/local/share/fonts', path.join(home, '.fonts'), path.join(home, '.local', 'share', 'fonts')];
}

export function sortedUnique(names: Array<string | undefined>): string[] {
  const unique = new Set(names.map((n) => n?.trim()).filter((n): n is string => !!n));
  return [...unique].sort((a, b) => a.localeCompare(b));
}

async function fontFiles(dir: string, depth = 0): Promise<string[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && depth < MAX_DEPTH) {
      files.push(...(await fontFiles(full, depth + 1)));
    } else if (entry.isFile() && FONT_FILE.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

async function readAt(file: fs.promises.FileHandle, position: number, length: number): Promise<Buffer> {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await file.read(buf, 0, length, position);
  return buf.subarray(0, bytesRead);
}

/** Family name of a TTF/OTF file, or of the first font of a TTC. */
export async function readFamilyName(fontPath: string): Promise<string | undefined> {
  const file = await fs.promises.open(fontPath, 'r');
  try {
    let base = 0;
    let head = await readAt(file, 0, 12);
    if (head.length < 12) {
      return undefined;
    }
    if (head.toString('latin1', 0, 4) === 'ttcf') {
      base = (await readAt(file, 12, 4)).readUInt32BE(0);
      head = await readAt(file, base, 12);
    }
    const numTables = head.readUInt16BE(4);
    const directory = await readAt(file, base + 12, numTables * 16);
    for (let i = 0; i < numTables && (i + 1) * 16 <= directory.length; i++) {
      const rec = i * 16;
      if (directory.toString('latin1', rec, rec + 4) === 'name') {
        const table = await readAt(file, directory.readUInt32BE(rec + 8), directory.readUInt32BE(rec + 12));
        return familyFromNameTable(table);
      }
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    await file.close();
  }
}

export async function scanFontFamilies(dirs: string[]): Promise<string[]> {
  const files = (await Promise.all(dirs.map((d) => fontFiles(d)))).flat();
  const names: Array<string | undefined> = [];
  // Read in small batches to keep the number of open files low.
  for (let i = 0; i < files.length; i += 32) {
    names.push(...(await Promise.all(files.slice(i, i + 32).map(readFamilyName))));
  }
  return sortedUnique(names);
}
