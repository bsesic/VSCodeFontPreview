import { test, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';
import { Memento, calls, editor, fakeWebview, setOpenDialogResult } from './vscodeStub';
import { FontSources, labelFromLocation } from '../src/sources';
import { attachFontPreview } from '../src/webview';

const fixture = (name: string) => path.join(__dirname, '..', '..', 'test', 'fixtures', name);
const catalogEntry = {
  id: 'roboto', family: 'Roboto', subsets: ['latin'], weights: [400, 700], styles: ['normal'],
  defSubset: 'latin', variable: false, category: 'sans-serif', type: 'google', lastModified: 'x', license: 'OFL-1.1',
};

let fetched: string[] = [];
let fetchImpl: (url: string) => Promise<Response>;
(globalThis as any).fetch = (url: string) => {
  fetched.push(url);
  return fetchImpl(url);
};

beforeEach(() => {
  fetched = [];
  calls.errors = [];
  fetchImpl = async () => new Response(JSON.stringify([catalogEntry]));
});

test('catalog is fetched once, trimmed and cached', async () => {
  const sources = new FontSources(new Memento() as any);
  const first = await sources.catalog();
  const second = await sources.catalog();
  assert.equal(fetched.length, 1);
  assert.deepEqual(first, second);
  assert.equal((first[0] as any).license, undefined, 'unused fields are dropped');
  await sources.catalog(true);
  assert.equal(fetched.length, 2, 'force refreshes');
});

test('catalog falls back to the cache when offline', async () => {
  const sources = new FontSources(new Memento() as any);
  await sources.catalog();
  fetchImpl = async () => { throw new Error('offline'); };
  assert.equal((await sources.catalog(true)).length, 1);
  await assert.rejects(new FontSources(new Memento() as any).catalog(), /offline/);
});

test('custom fonts are de-duplicated and removable', async () => {
  const sources = new FontSources(new Memento() as any);
  const a = await sources.addCustom({ kind: 'system', label: 'Arial', location: 'Arial' });
  const b = await sources.addCustom({ kind: 'system', label: 'Arial', location: 'Arial' });
  assert.equal(a.id, b.id);
  assert.equal(sources.customFonts().length, 1);
  await sources.removeCustom(a.id);
  assert.equal(sources.customFonts().length, 0);
});

test('load reads font files and reports errors', async () => {
  const sources = new FontSources(new Memento() as any);
  const ok = await sources.load({ id: '1', kind: 'file', label: 'x', location: fixture('noto-sans-hebrew.woff2') });
  assert.ok(ok.data && ok.data.length > 1000);
  assert.equal(ok.info?.format, 'woff2');
  const missing = await sources.load({ id: '2', kind: 'file', label: 'x', location: fixture('missing.ttf') });
  assert.ok(missing.error);
  fetchImpl = async () => new Response('nope', { status: 404, statusText: 'Not Found' });
  const notFound = await sources.load({ id: '3', kind: 'url', label: 'x', location: 'https://x.test/a.woff2' });
  assert.match(notFound.error ?? '', /404/);
});

test('labelFromLocation strips folders, query and extension', () => {
  assert.equal(labelFromLocation('/home/me/Fonts/MyFont-Bold.otf'), 'MyFont-Bold');
  assert.equal(labelFromLocation('https://cdn.test/f/Brand.woff2?v=3'), 'Brand');
});

test('webview flow: init, add file, add Google stylesheet, copy', async () => {
  const sources = new FontSources(new Memento() as any);
  const { webview, posted, send } = fakeWebview();
  attachFontPreview(webview as any, { fsPath: '/ext' } as any, sources);
  assert.match(webview.html, /Content-Security-Policy/);
  assert.match(webview.html, /script-src 'nonce-/);

  await send({ type: 'ready' });
  const init = posted.at(-1);
  assert.equal(init.type, 'init');
  assert.deepEqual(init.custom, []);
  assert.ok(init.iconSets.length >= 5);
  assert.equal(init.iconSets[0].source, undefined, 'fetch details stay in the extension');

  setOpenDialogResult([fixture('noto-sans-hebrew.ttf')]);
  await send({ type: 'addFile' });
  const added = posted.at(-1);
  assert.equal(added.type, 'customAdded');
  assert.equal(added.font.label, 'noto-sans-hebrew');
  assert.equal(added.font.info.format, 'truetype');

  await send({ type: 'addUrl', url: 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;700&display=swap' });
  assert.equal(posted.at(-1).font.kind, 'css');
  assert.equal(posted.at(-1).font.label, 'Open Sans');

  await send({ type: 'addUrl', url: 'not a url' });
  assert.match(calls.errors.at(-1) ?? '', /not a valid URL/);

  assert.equal(sources.customFonts().length, 2);
  await send({ type: 'ready' });
  assert.equal(posted.at(-1).custom.length, 2, 'added fonts come back on reload');

  await send({ type: 'copy', text: 'body {}', what: 'CSS' });
  assert.equal(calls.clipboard, 'body {}');
});

test('custom editor flow sends the opened file without storing it', async () => {
  const sources = new FontSources(new Memento() as any);
  const { webview, posted, send } = fakeWebview();
  attachFontPreview(webview as any, { fsPath: '/ext' } as any, sources, { file: { fsPath: fixture('inter-variable.woff2') } as any });
  await send({ type: 'ready' });
  const init = posted.at(-1);
  assert.equal(init.opened.id, 'opened-file');
  assert.deepEqual(init.opened.info.axes.map((a: any) => a.tag), ['wght']);
  assert.equal(sources.customFonts().length, 0);
});

test('insert replaces every selection in the last editor, or copies when there is none', async () => {
  const sources = new FontSources(new Memento() as any);
  const { webview, posted, send } = fakeWebview();
  attachFontPreview(webview as any, { fsPath: '/ext' } as any, sources);

  editor.open = true;
  editor.text = 'a | b | c';
  editor.selections = [[2, 3], [6, 7]];
  await send({ type: 'insert', text: '<i class="bi bi-x"></i>', what: 'HTML' });
  assert.equal(editor.text, 'a <i class="bi bi-x"></i> b <i class="bi bi-x"></i> c');
  assert.deepEqual(posted.at(-1), { type: 'target', target: { name: 'index.html', languageId: 'html' } });

  editor.open = false;
  await send({ type: 'insert', text: 'X', what: 'Character' });
  assert.equal(calls.clipboard, 'X');
  assert.match(calls.warnings.at(-1) ?? '', /copied to the clipboard/);
  assert.deepEqual(posted.at(-1), { type: 'target', target: undefined });
});

test('icons message returns the set or an error', async () => {
  const sources = new FontSources(new Memento() as any);
  const { webview, posted, send } = fakeWebview();
  attachFontPreview(webview as any, { fsPath: '/ext' } as any, sources);
  fetchImpl = async () => new Response('.ri-home-line:before { content: "\\ee2b"; }');
  await send({ type: 'icons', set: 'remix' });
  assert.deepEqual(posted.at(-1), { type: 'icons', set: 'remix', icons: [{ name: 'home-line', code: 0xee2b }] });
  fetchImpl = async () => { throw new Error('offline'); };
  await send({ type: 'icons', set: 'lucide' });
  assert.equal(posted.at(-1).type, 'iconsError');
});
