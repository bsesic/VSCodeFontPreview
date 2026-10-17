import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fontDirectories, readFamilyName, scanFontFamilies } from '../src/systemFonts';

const fixtures = path.join(__dirname, '..', '..', 'test', 'fixtures');

test('font folders per platform', () => {
  assert.deepEqual(fontDirectories('win32', { WINDIR: 'C:\\Windows', LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, 'C:\\Users\\me').map((d) => d.replace(/\\/g, '/')), [
    'C:/Windows/Fonts',
    'C:/Users/me/AppData/Local/Microsoft/Windows/Fonts',
  ]);
  assert.deepEqual(fontDirectories('darwin', {}, '/Users/me'), ['/System/Library/Fonts', '/Library/Fonts', '/Users/me/Library/Fonts']);
  assert.ok(fontDirectories('linux', {}, '/home/me').includes('/home/me/.local/share/fonts'));
});

test('scans nested folders and reads family names, also from TTC files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-fonts-'));
  try {
    const ttf = fs.readFileSync(path.join(fixtures, 'noto-sans-hebrew.ttf'));
    fs.mkdirSync(path.join(dir, 'a', 'b'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'a', 'b', 'Hebrew.ttf'), ttf);
    fs.writeFileSync(path.join(dir, 'broken.otf'), Buffer.from('nope'));
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');
    // TTC whose only font is the TTF, shifted behind a 16-byte collection header.
    const header = Buffer.alloc(16);
    header.write('ttcf', 0, 'latin1');
    header.writeUInt32BE(0x00010000, 4);
    header.writeUInt32BE(1, 8);
    header.writeUInt32BE(16, 12);
    const shifted = Buffer.from(ttf);
    for (let i = 0; i < shifted.readUInt16BE(4); i++) {
      const rec = 12 + i * 16 + 8;
      shifted.writeUInt32BE(shifted.readUInt32BE(rec) + 16, rec);
    }
    fs.writeFileSync(path.join(dir, 'Collection.ttc'), Buffer.concat([header, shifted]));

    assert.equal(await readFamilyName(path.join(dir, 'Collection.ttc')), 'Noto Sans Hebrew Thin');
    assert.equal(await readFamilyName(path.join(dir, 'broken.otf')), undefined);
    assert.deepEqual(await scanFontFamilies([dir, path.join(dir, 'missing')]), ['Noto Sans Hebrew Thin']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
