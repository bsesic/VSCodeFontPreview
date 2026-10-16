import { FontInfo, INFO_TABLES, Tables, infoFromTables, readTableDirectory } from './fontInfo';

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

/** URL of a TTF of another Fontsource font (default subset, regular weight). */
export async function fontsourceFontFile(id: string): Promise<string> {
  const font = (await (await fetchOk(FONTSOURCE_API + encodeURIComponent(id))).json()) as {
    defSubset: string;
    weights: number[];
    variants: Record<string, Record<string, Record<string, { url: { ttf?: string; woff2?: string } }>>>;
  };
  const weight = font.weights.includes(400) ? 400 : font.weights[0];
  const url = font.variants[weight]?.normal?.[font.defSubset]?.url;
  const file = url?.ttf;
  if (!file) {
    throw new Error(`No font file for ${id}`);
  }
  return file;
}

async function fetchRange(url: string, start: number, length: number): Promise<Buffer> {
  const response = await fetchOk(url, { headers: { Range: `bytes=${start}-${start + length - 1}` } });
  const data = Buffer.from(await response.arrayBuffer());
  // A server without range support sends the whole file.
  return response.status === 206 ? data : data.subarray(start, start + length);
}

/** Reads the font details from a remote TTF/OTF, downloading only the needed tables. */
export async function readRemoteFontInfo(url: string): Promise<FontInfo> {
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
