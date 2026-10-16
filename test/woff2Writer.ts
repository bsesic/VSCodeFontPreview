// Builds WOFF2 files from sfnt tables for tests (null transforms, no metadata).
import * as zlib from 'zlib';

const KNOWN = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep'];

export function sfntTables(buf: Buffer): Map<string, Buffer> {
  const tables = new Map<string, Buffer>();
  const numTables = buf.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    tables.set(buf.toString('latin1', rec, rec + 4), buf.subarray(buf.readUInt32BE(rec + 8), buf.readUInt32BE(rec + 8) + buf.readUInt32BE(rec + 12)));
  }
  return tables;
}

function base128(value: number): number[] {
  const bytes = [value & 0x7f];
  for (value = Math.floor(value / 128); value > 0; value = Math.floor(value / 128)) {
    bytes.unshift((value & 0x7f) | 0x80);
  }
  return bytes;
}

function uint255(value: number): number[] {
  if (value < 253) {
    return [value];
  }
  return [253, value >> 8, value & 0xff];
}

/**
 * Encodes `fonts` (each a list of table indices into `tables`) as a WOFF2 collection.
 * glyf/loca use transform version 3, the null transform.
 */
export function woff2Collection(tables: Array<[string, Buffer]>, fonts: number[][]): Buffer {
  const directory: number[] = [];
  for (const [tag, data] of tables) {
    const known = KNOWN.indexOf(tag);
    const transform = tag === 'glyf' || tag === 'loca' ? 3 : 0;
    if (known >= 0) {
      directory.push((transform << 6) | known);
    } else {
      directory.push((transform << 6) | 0x3f, ...Buffer.from(tag, 'latin1'));
    }
    directory.push(...base128(data.length));
  }
  const collection = [0x00, 0x01, 0x00, 0x00, ...uint255(fonts.length)];
  for (const indices of fonts) {
    collection.push(...uint255(indices.length), 0x00, 0x01, 0x00, 0x00, ...indices.flatMap(uint255));
  }
  const compressed = zlib.brotliCompressSync(Buffer.concat(tables.map(([, data]) => data)));
  const header = Buffer.alloc(48);
  header.write('wOF2', 0, 'latin1');
  header.write('ttcf', 4, 'latin1');
  header.writeUInt16BE(tables.length, 12);
  header.writeUInt32BE(compressed.length, 20);
  const file = Buffer.concat([header, Buffer.from(directory), Buffer.from(collection), compressed]);
  file.writeUInt32BE(file.length, 8);
  return file;
}
