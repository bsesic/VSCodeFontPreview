import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { Memento } from './vscodeStub';
import { googleFontFile, pickFontFile, readRemoteFontInfo } from '../src/fontDetails';
import { readFontInfo } from '../src/fontInfo';
import { FontSources } from '../src/sources';

const ttf = fs.readFileSync(path.join(__dirname, '..', '..', 'test', 'fixtures', 'noto-sans-hebrew.ttf'));
const FILE_URL = 'https://fonts.gstatic.test/notosanshebrew.ttf';
const manifest = {
  manifest: {
    fileRefs: [
      { filename: 'static/NotoSansHebrew-Regular.ttf', url: 'https://fonts.gstatic.test/static.ttf' },
      { filename: 'NotoSansHebrew-VariableFont_wdth,wght.ttf', url: FILE_URL },
    ],
  },
};

/** Serves the manifest and the TTF fixture; `ranges` toggles HTTP range support, 'empty' answers 206 without body. */
function serve(ranges: boolean | 'empty') {
  const requested: Array<string | null> = [];
  (globalThis as any).fetch = async (url: string, init?: { headers?: Record<string, string> }) => {
    if (url.startsWith('https://fonts.google.com/download/list')) {
      return new Response(`)]}'\n${JSON.stringify(manifest)}`);
    }
    if (url === FILE_URL) {
      const range = init?.headers?.Range ?? null;
      requested.push(range);
      const match = range && /bytes=(\d+)-(\d+)/.exec(range);
      if (ranges === 'empty' && match) {
        return new Response(new Uint8Array(0), { status: 206 });
      }
      if (ranges && match) {
        return new Response(ttf.subarray(Number(match[1]), Number(match[2]) + 1), { status: 206 });
      }
      return new Response(ttf);
    }
    return new Response('not found', { status: 404 });
  };
  return requested;
}

test('pickFontFile prefers the upright variable font, then the regular style', () => {
  const ref = (filename: string) => ({ filename, url: filename });
  assert.equal(pickFontFile([ref('OFL.txt'), ref('A-Italic-VariableFont_wght.ttf'), ref('A-VariableFont_wght.ttf')])?.filename, 'A-VariableFont_wght.ttf');
  assert.equal(pickFontFile([ref('static/A-Bold.ttf'), ref('static/A-Regular.ttf')])?.filename, 'static/A-Regular.ttf');
  assert.equal(pickFontFile([ref('OFL.txt')]), undefined);
});

test('reads the manifest and only downloads the needed tables', async () => {
  const requested = serve(true);
  assert.equal(await googleFontFile('Noto Sans Hebrew'), FILE_URL);
  const info = await readRemoteFontInfo(FILE_URL);
  const local = readFontInfo(ttf);
  assert.deepEqual({ ...info, format: local.format }, local);
  assert.ok(requested.every((r) => r !== null), 'every request is a range request');
  assert.ok(requested.length <= 7, `${requested.length} requests`);
});

test('works with servers that ignore range requests', async () => {
  serve(false);
  assert.equal((await readRemoteFontInfo(FILE_URL)).numGlyphs, 154);
});

test('falls back to a full download when range responses are empty', async () => {
  const requested = serve('empty');
  assert.equal((await readRemoteFontInfo(FILE_URL)).numGlyphs, 154);
  assert.equal(requested.at(-1), null, 'the last request downloads the whole file');
});

test('details are cached', async () => {
  const requested = serve(true);
  const sources = new FontSources(new Memento() as any);
  const first = await sources.details('google', 'noto-sans-hebrew', 'Noto Sans Hebrew');
  const count = requested.length;
  assert.deepEqual(await sources.details('google', 'noto-sans-hebrew', 'Noto Sans Hebrew'), first);
  assert.equal(requested.length, count);
  assert.equal(first.partial, undefined);
  assert.equal(first.fileUrl, FILE_URL);
});

test('fontsourceFaces lists every weight, style and subset with its unicode-range', async () => {
  const { fontsourceFaces } = await import('../src/fontDetails');
  const cdn = 'https://cdn.test/fontsource/fonts/x@latest';
  (globalThis as any).fetch = async () =>
    new Response(JSON.stringify({
      defSubset: 'latin',
      weights: [400],
      unicodeRange: { latin: 'U+0000-00FF', '[0]': 'U+4E00-4E10' },
      variants: {
        400: {
          normal: { latin: { url: { woff2: `${cdn}/latin-400-normal.woff2` } }, 0: { url: { woff2: `${cdn}/0-400-normal.woff2` } } },
          italic: { latin: { url: { woff2: `${cdn}/latin-400-italic.woff2` } } },
        },
      },
    }));
  const faces = await fontsourceFaces('x');
  assert.equal(faces.length, 3);
  assert.deepEqual(faces.find((f) => f.subset === '0'), { weight: 400, style: 'normal', subset: '0', url: `${cdn}/0-400-normal.woff2`, unicodeRange: 'U+4E00-4E10' });
  assert.equal(faces.find((f) => f.style === 'italic')?.unicodeRange, 'U+0000-00FF');
});

test('fontsourceFontFile marks fonts with several subsets as partial', async () => {
  const { fontsourceFontFile } = await import('../src/fontDetails');
  const api = (subsets: string[]) => async () =>
    new Response(JSON.stringify({
      defSubset: 'latin',
      weights: [400],
      unicodeRange: {},
      variants: { 400: { normal: Object.fromEntries(subsets.map((s) => [s, { url: { ttf: `https://cdn.test/${s}.ttf` } }])) } },
    }));
  (globalThis as any).fetch = api(['latin']);
  assert.deepEqual(await fontsourceFontFile('x'), { url: 'https://cdn.test/latin.ttf', partial: false });
  (globalThis as any).fetch = api(['latin', 'cyrillic']);
  assert.equal((await fontsourceFontFile('x')).partial, true);
});
