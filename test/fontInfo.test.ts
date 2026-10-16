import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { readFontInfo, toRanges } from '../src/fontInfo';
import { sfntTables, woff2Collection } from './woff2Writer';

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, '..', '..', 'test', 'fixtures', name));
const count = (ranges: Array<[number, number]>) => ranges.reduce((sum, [a, b]) => sum + b - a + 1, 0);

// The Fontsource TTF/WOFF2 builds carry a different family name record than the WOFF build.
for (const [file, format, family] of [
  ['noto-sans-hebrew.ttf', 'truetype', 'Noto Sans Hebrew Thin'],
  ['noto-sans-hebrew.woff', 'woff', 'Noto Sans Hebrew'],
  ['noto-sans-hebrew.woff2', 'woff2', 'Noto Sans Hebrew Thin'],
] as const) {
  test(`reads ${format}`, () => {
    const info = readFontInfo(fixture(file));
    assert.equal(info.format, format);
    assert.equal(info.family, family);
    assert.equal(info.numGlyphs, 154);
    assert.equal(count(info.ranges), 148);
    assert.ok(info.ranges.some(([a, b]) => a <= 0x05d0 && 0x05d0 <= b), 'covers Alef');
  });
}

test('reads variable axes from woff2', () => {
  const info = readFontInfo(fixture('inter-variable.woff2'));
  assert.equal(info.family, 'Inter');
  assert.deepEqual(info.axes, [{ tag: 'wght', min: 100, default: 400, max: 900 }]);
  assert.equal(info.numGlyphs, 518);
});

test('rejects unknown data', () => {
  assert.throws(() => readFontInfo(Buffer.from('not a font at all')));
});

test('toRanges merges consecutive code points', () => {
  assert.deepEqual(toRanges([5, 1, 2, 3, 3, 7]), [[1, 3], [5, 5], [7, 7]]);
});

test('reads the first font of a WOFF2 collection', () => {
  const tables = [...sfntTables(fixture('noto-sans-hebrew.ttf'))];
  const nameIndex = tables.findIndex(([tag]) => tag === 'name');
  // Second font: same tables but a different name table, to check that the first font is used.
  const otherName = Buffer.from(tables[nameIndex][1]);
  const all: Array<[string, Buffer]> = [...tables, ['name', otherName.fill(0, 6)]];
  const first = tables.map((_, i) => i);
  const second = first.map((i) => (i === nameIndex ? tables.length : i));
  const info = readFontInfo(woff2Collection(all, [first, second]));
  assert.equal(info.format, 'woff2');
  assert.equal(info.fontCount, 2);
  assert.equal(info.family, 'Noto Sans Hebrew Thin');
  assert.equal(count(info.ranges), 148);
});

test('reports the font count of a TTC collection', () => {
  const ttf = fixture('noto-sans-hebrew.ttf');
  // A TTC header pointing twice at the embedded TTF's table directory.
  const header = Buffer.alloc(20);
  header.write('ttcf', 0, 'latin1');
  header.writeUInt32BE(0x00010000, 4);
  header.writeUInt32BE(2, 8);
  header.writeUInt32BE(20, 12);
  header.writeUInt32BE(20, 16);
  const shifted = Buffer.from(ttf);
  const numTables = shifted.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16 + 8;
    shifted.writeUInt32BE(shifted.readUInt32BE(rec) + 20, rec);
  }
  const info = readFontInfo(Buffer.concat([header, shifted]));
  assert.equal(info.format, 'collection');
  assert.equal(info.fontCount, 2);
  assert.equal(info.numGlyphs, 154);
});
