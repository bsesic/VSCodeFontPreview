import { FontInfo, INFO_TABLES, Tables, infoFromTables, readFontInfo, readTableDirectory } from './fontInfo';

// Google Fonts and Fontsource serve fonts split into subsets that lack many characters
// and OpenType features. The complete font files are listed in the download manifest
// of fonts.google.com; only the tables the preview needs are fetched from them.

const MANIFEST = 'https://fonts.google.com/download/list?family=';
const FONTSOURCE_API = 'https://api.fontsource.org/v1/fonts/';
/** Enough for the header and the table directory of any font with up to 255 tables. */
const DIRECTORY_BYTES = 12 + 255 * 16;

interface FileRef {
  filename: string;
  url: string;
}

/** Picks the upright variable font, else the regular static font, from a manifest. */
export function pickFontFile(files: FileRef[]): FileRef | undefined {
  const fonts = files.filter((f) => /\.(ttf|otf)$/i.test(f.filename));
  const upright = fonts.filter((f) => !/italic/i.test(f.filename));
  return (
    upright.find((f) => /VariableFont/i.test(f.filename)) ??
    upright.find((f) => /-Regular\.(ttf|otf)$/i.test(f.filename)) ??
    upright[0] ??
    fonts[0]
  );
}

async function fetchOk(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} (${url})`);
  }
  return response;
}

/** URL of the complete font file of a Google Font. */
export async function googleFontFile(family: string): Promise<string> {
  const text = await (await fetchOk(MANIFEST + encodeURIComponent(family))).text();
  // The JSON is prefixed with ")]}'" to prevent JSON hijacking.
  const manifest = JSON.parse(text.slice(text.indexOf('{'))) as { manifest: { fileRefs: FileRef[] } };
  const file = pickFontFile(manifest.manifest.fileRefs);
  if (!file) {
    throw new Error(`No font file for ${family}`);
  }
  return file.url;
}

interface FontsourceFont {
  defSubset: string;
  weights: number[];
  unicodeRange: Record<string, string>;
  variants: Record<string, Record<string, Record<string, { url: { ttf?: string; woff2?: string } }>>>;
}

async function fontsourceFont(id: string): Promise<FontsourceFont> {
  return (await (await fetchOk(FONTSOURCE_API + encodeURIComponent(id))).json()) as FontsourceFont;
}

export interface FontFaceSource {
  weight: number;
  style: string;
  subset: string;
  url: string;
  unicodeRange?: string;
}

/** One font face per weight, style and subset of a Fontsource font, with its unicode-range. */
export async function fontsourceFaces(id: string): Promise<FontFaceSource[]> {
  const font = await fontsourceFont(id);
  const faces: FontFaceSource[] = [];
  for (const [weight, styles] of Object.entries(font.variants)) {
    for (const [style, subsets] of Object.entries(styles)) {
      for (const [subset, { url }] of Object.entries(subsets)) {
        if (url.woff2) {
          // Numbered subsets of CJK fonts are keyed "[n]" in unicodeRange but "n" in variants.
          const unicodeRange = font.unicodeRange[subset] ?? font.unicodeRange[`[${subset}]`];
          faces.push({ weight: Number(weight), style, subset, url: url.woff2, unicodeRange });
        }
      }
    }
  }
  return faces;
}

/**
 * TTF of another Fontsource font (default subset, regular weight). These fonts usually have a
 * single subset that holds the whole font; with several subsets the file covers only one.
 */
export async function fontsourceFontFile(id: string): Promise<{ url: string; partial: boolean }> {
  const font = await fontsourceFont(id);
  const weight = font.weights.includes(400) ? 400 : font.weights[0];
  const subsets = font.variants[weight]?.normal ?? {};
  const url = subsets[font.defSubset]?.url.ttf;
  if (!url) {
    throw new Error(`No font file for ${id}`);
  }
  return { url, partial: Object.keys(subsets).length > 1 };
}

async function fetchRange(url: string, start: number, length: number): Promise<Buffer> {
  const response = await fetchOk(url, { headers: { Range: `bytes=${start}-${start + length - 1}` } });
  const data = Buffer.from(await response.arrayBuffer());
  // A server without range support sends the whole file.
  const part = response.status === 206 ? data : data.subarray(start, start + length);
  if (part.length === 0) {
    // jsDelivr answers range requests over HTTP/1.1 with an empty 206 response.
    throw new RangeError('Empty range response');
  }
  return part;
}

/** Reads the font details from a remote font file, downloading only the needed tables when possible. */
export async function readRemoteFontInfo(url: string): Promise<FontInfo> {
  try {
    return await readTablesByRange(url);
  } catch (err) {
    if (!(err instanceof RangeError)) {
      throw err;
    }
    return readFontInfo(Buffer.from(await (await fetchOk(url)).arrayBuffer()));
  }
}

async function readTablesByRange(url: string): Promise<FontInfo> {
  const head = await fetchRange(url, 0, DIRECTORY_BYTES);
  const { format, records } = readTableDirectory(head);
  const wanted = records.filter((r) => INFO_TABLES.includes(r.tag));
  const tables: Tables = new Map();
  await Promise.all(
    wanted.map(async (r) => {
      tables.set(r.tag, await fetchRange(url, r.offset, r.length));
    }),
  );
  return infoFromTables(format, tables);
}
