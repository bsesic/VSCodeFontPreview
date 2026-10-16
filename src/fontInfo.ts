import * as zlib from 'zlib';

// Minimal reader for TTF/OTF/TTC/WOFF/WOFF2 files. It extracts only what the
// preview needs: names, glyph count, the cmap coverage and variable axes.

export interface FontAxis {
  tag: string;
  min: number;
  default: number;
  max: number;
}

export interface FontInfo {
  format: 'truetype' | 'opentype' | 'woff' | 'woff2' | 'collection';
  family?: string;
  subfamily?: string;
  fullName?: string;
  version?: string;
  designer?: string;
  license?: string;
  numGlyphs?: number;
  /** Number of fonts in a TTC or WOFF2 collection; the info describes the first one. */
  fontCount?: number;
  /** Covered code points as inclusive [start, end] ranges. */
  ranges: Array<[number, number]>;
  axes: FontAxis[];
}

type Tables = Map<string, Buffer>;

export function readFontInfo(buf: Buffer): FontInfo {
  const sig = buf.toString('latin1', 0, 4);
  let format: FontInfo['format'];
  let tables: Tables;
  let fontCount: number | undefined;
  if (sig === 'wOFF') {
    format = 'woff';
    tables = readWoffTables(buf);
  } else if (sig === 'wOF2') {
    format = 'woff2';
    ({ tables, fontCount } = readWoff2Tables(buf));
  } else if (sig === 'ttcf') {
    format = 'collection';
    fontCount = buf.readUInt32BE(8);
    tables = readSfntTables(buf, buf.readUInt32BE(12));
  } else if (sig === 'OTTO') {
    format = 'opentype';
    tables = readSfntTables(buf, 0);
  } else if (buf.readUInt32BE(0) === 0x00010000 || sig === 'true') {
    format = 'truetype';
    tables = readSfntTables(buf, 0);
  } else {
    throw new Error('Unknown font format');
  }

  const info: FontInfo = { format, ranges: [], axes: [] };
  if (fontCount !== undefined) {
    info.fontCount = fontCount;
  }
  const name = tables.get('name');
  if (name) {
    const names = readNames(name);
    info.family = names.get(16) ?? names.get(1);
    info.subfamily = names.get(17) ?? names.get(2);
    info.fullName = names.get(4);
    info.version = names.get(5);
    info.designer = names.get(9);
    info.license = names.get(13);
  }
  const maxp = tables.get('maxp');
  if (maxp && maxp.length >= 6) {
    info.numGlyphs = maxp.readUInt16BE(4);
  }
  const cmap = tables.get('cmap');
  if (cmap) {
    info.ranges = toRanges(readCmap(cmap));
  }
  const fvar = tables.get('fvar');
  if (fvar) {
    info.axes = readAxes(fvar);
  }
  return info;
}

function readSfntTables(buf: Buffer, base: number): Tables {
  const tables: Tables = new Map();
  const numTables = buf.readUInt16BE(base + 4);
  for (let i = 0; i < numTables; i++) {
    const rec = base + 12 + i * 16;
    const tag = buf.toString('latin1', rec, rec + 4);
    const offset = buf.readUInt32BE(rec + 8);
    const length = buf.readUInt32BE(rec + 12);
    tables.set(tag, buf.subarray(offset, offset + length));
  }
  return tables;
}

function readWoffTables(buf: Buffer): Tables {
  const tables: Tables = new Map();
  const numTables = buf.readUInt16BE(12);
  for (let i = 0; i < numTables; i++) {
    const rec = 44 + i * 20;
    const tag = buf.toString('latin1', rec, rec + 4);
    const offset = buf.readUInt32BE(rec + 4);
    const compLength = buf.readUInt32BE(rec + 8);
    const origLength = buf.readUInt32BE(rec + 12);
    const data = buf.subarray(offset, offset + compLength);
    tables.set(tag, compLength < origLength ? zlib.inflateSync(data) : data);
  }
  return tables;
}

const WOFF2_KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep',
  'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE',
  'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt',
  'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar',
  'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
];

function readWoff2Tables(buf: Buffer): { tables: Tables; fontCount?: number } {
  const numTables = buf.readUInt16BE(12);
  const isCollection = buf.toString('latin1', 4, 8) === 'ttcf';
  const totalCompressedSize = buf.readUInt32BE(20);
  let pos = 48;
  const readBase128 = (): number => {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const byte = buf[pos++];
      value = value * 128 + (byte & 0x7f);
      if ((byte & 0x80) === 0) {
        return value;
      }
    }
    throw new Error('Invalid UIntBase128');
  };
  const read255UInt16 = (): number => {
    const code = buf[pos++];
    if (code === 253) {
      pos += 2;
      return buf.readUInt16BE(pos - 2);
    }
    if (code === 255) {
      return buf[pos++] + 253;
    }
    if (code === 254) {
      return buf[pos++] + 506;
    }
    return code;
  };

  const entries: Array<{ tag: string; length: number }> = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[pos++];
    let tag: string;
    if ((flags & 0x3f) === 0x3f) {
      tag = buf.toString('latin1', pos, pos + 4);
      pos += 4;
    } else {
      tag = WOFF2_KNOWN_TAGS[flags & 0x3f];
    }
    const transformVersion = (flags >> 6) & 3;
    const origLength = readBase128();
    // glyf/loca are transformed with version 0, every other table with a non-zero version.
    const transformed = tag === 'glyf' || tag === 'loca' ? transformVersion === 0 : transformVersion !== 0;
    const length = transformed ? readBase128() : origLength;
    entries.push({ tag, length });
  }

  // A collection directory follows the table directory and lists, per font, which
  // of the shared tables it uses. Only the first font is read.
  let fontCount: number | undefined;
  let firstFont: number[] | undefined;
  if (isCollection) {
    pos += 4; // version
    fontCount = read255UInt16();
    for (let font = 0; font < fontCount; font++) {
      const count = read255UInt16();
      pos += 4; // flavor
      const indices = Array.from({ length: count }, read255UInt16);
      firstFont ??= indices;
    }
  }

  const stream = zlib.brotliDecompressSync(buf.subarray(pos, pos + totalCompressedSize));
  const offsets: number[] = [];
  let offset = 0;
  for (const { length } of entries) {
    offsets.push(offset);
    offset += length;
  }
  const tables: Tables = new Map();
  for (const index of firstFont ?? entries.map((_, i) => i)) {
    const entry = entries[index];
    if (entry) {
      tables.set(entry.tag, stream.subarray(offsets[index], offsets[index] + entry.length));
    }
  }
  return { tables, fontCount };
}

function readNames(table: Buffer): Map<number, string> {
  const count = table.readUInt16BE(2);
  const storage = table.readUInt16BE(4);
  const best = new Map<number, { score: number; value: string }>();
  for (let i = 0; i < count; i++) {
    const rec = 6 + i * 12;
    const platform = table.readUInt16BE(rec);
    const language = table.readUInt16BE(rec + 4);
    const nameId = table.readUInt16BE(rec + 6);
    const length = table.readUInt16BE(rec + 8);
    const start = storage + table.readUInt16BE(rec + 10);
    const raw = table.subarray(start, start + length);
    let value: string;
    let score: number;
    if (platform === 3 || platform === 0) {
      value = decodeUtf16BE(raw);
      score = language === 0x409 || platform === 0 ? 3 : 2;
    } else if (platform === 1) {
      value = raw.toString('latin1');
      score = language === 0 ? 1 : 0;
    } else {
      continue;
    }
    const current = best.get(nameId);
    if (!current || score > current.score) {
      best.set(nameId, { score, value: value.trim() });
    }
  }
  return new Map([...best].map(([id, { value }]) => [id, value]));
}

function decodeUtf16BE(raw: Buffer): string {
  const swapped = Buffer.from(raw);
  swapped.swap16();
  return swapped.toString('utf16le');
}

function readCmap(table: Buffer): number[] {
  const numTables = table.readUInt16BE(2);
  const subtables: Array<{ platform: number; encoding: number; offset: number; format: number }> = [];
  for (let i = 0; i < numTables; i++) {
    const rec = 4 + i * 8;
    const offset = table.readUInt32BE(rec + 4);
    subtables.push({
      platform: table.readUInt16BE(rec),
      encoding: table.readUInt16BE(rec + 2),
      offset,
      format: table.readUInt16BE(offset),
    });
  }
  const unicode = subtables.filter((s) => s.platform === 0 || (s.platform === 3 && (s.encoding === 1 || s.encoding === 10)));
  const chosen = unicode.find((s) => s.format === 12) ?? unicode.find((s) => s.format === 4);
  if (!chosen) {
    return [];
  }
  return chosen.format === 12 ? readCmap12(table, chosen.offset) : readCmap4(table, chosen.offset);
}

function readCmap4(table: Buffer, base: number): number[] {
  const segCount = table.readUInt16BE(base + 6) / 2;
  const endCodes = base + 14;
  const startCodes = endCodes + segCount * 2 + 2;
  const idDeltas = startCodes + segCount * 2;
  const idRangeOffsets = idDeltas + segCount * 2;
  const result: number[] = [];
  for (let seg = 0; seg < segCount; seg++) {
    const end = table.readUInt16BE(endCodes + seg * 2);
    const start = table.readUInt16BE(startCodes + seg * 2);
    const delta = table.readUInt16BE(idDeltas + seg * 2);
    const rangeOffsetPos = idRangeOffsets + seg * 2;
    const rangeOffset = table.readUInt16BE(rangeOffsetPos);
    for (let code = start; code <= end && code !== 0xffff; code++) {
      let glyph: number;
      if (rangeOffset === 0) {
        glyph = (code + delta) & 0xffff;
      } else {
        const addr = rangeOffsetPos + rangeOffset + (code - start) * 2;
        glyph = addr + 2 <= table.length ? table.readUInt16BE(addr) : 0;
        if (glyph !== 0) {
          glyph = (glyph + delta) & 0xffff;
        }
      }
      if (glyph !== 0) {
        result.push(code);
      }
    }
  }
  return result;
}

function readCmap12(table: Buffer, base: number): number[] {
  const groups = table.readUInt32BE(base + 12);
  const result: number[] = [];
  for (let i = 0; i < groups; i++) {
    const rec = base + 16 + i * 12;
    const start = table.readUInt32BE(rec);
    const end = table.readUInt32BE(rec + 4);
    const startGlyph = table.readUInt32BE(rec + 8);
    for (let code = start; code <= end; code++) {
      if (startGlyph + (code - start) !== 0) {
        result.push(code);
      }
    }
  }
  return result;
}

function readAxes(table: Buffer): FontAxis[] {
  const axesOffset = table.readUInt16BE(4);
  const axisCount = table.readUInt16BE(8);
  const axisSize = table.readUInt16BE(10);
  const fixed = (pos: number) => table.readInt32BE(pos) / 65536;
  const axes: FontAxis[] = [];
  for (let i = 0; i < axisCount; i++) {
    const rec = axesOffset + i * axisSize;
    axes.push({
      tag: table.toString('latin1', rec, rec + 4),
      min: fixed(rec + 4),
      default: fixed(rec + 8),
      max: fixed(rec + 12),
    });
  }
  return axes;
}

export function toRanges(codes: number[]): Array<[number, number]> {
  const sorted = [...new Set(codes)].sort((a, b) => a - b);
  const ranges: Array<[number, number]> = [];
  for (const code of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && code === last[1] + 1) {
      last[1] = code;
    } else {
      ranges.push([code, code]);
    }
  }
  return ranges;
}
