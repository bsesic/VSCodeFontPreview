import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import './vscodeStub';
import { fontFaceCss, fontFormat, importRule, slug } from '../src/projectFonts';

test('slug makes folder and file names', () => {
  assert.equal(slug('Playfair Display'), 'playfair-display');
  assert.equal(slug('Noto Sans JP'), 'noto-sans-jp');
  assert.equal(slug('Crème Brûlée!'), 'creme-brulee');
  assert.equal(slug('***'), 'font');
});

test('fontFormat maps extensions to CSS format names', () => {
  assert.equal(fontFormat('a.woff2'), 'woff2');
  assert.equal(fontFormat('https://x.test/a.TTF?v=2'), 'truetype');
  assert.equal(fontFormat('a.otf'), 'opentype');
});

test('fontFaceCss writes one rule per file', () => {
  const css = fontFaceCss('Inter "Test"', [
    { file: 'inter-latin-400-normal.woff2', weight: '400', style: 'normal', unicodeRange: 'U+0000-00FF', format: 'woff2' },
    { file: 'inter.ttf', weight: '100 900', style: 'italic', format: 'truetype' },
  ], 'Inter from Google Fonts');
  assert.equal(css, `/* Inter from Google Fonts */

@font-face {
  font-family: "Inter \\"Test\\"";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("./inter-latin-400-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF;
}

@font-face {
  font-family: "Inter \\"Test\\"";
  font-style: italic;
  font-weight: 100 900;
  font-display: swap;
  src: url("./inter.ttf") format("truetype");
}
`);
});

test('importRule is relative to the receiving document', () => {
  assert.equal(importRule('/work/fonts/inter/inter.css', '/work/css/style.css'), '@import url("../fonts/inter/inter.css");');
  assert.equal(importRule('/work/fonts/inter/inter.css', '/work/style.css'), '@import url("./fonts/inter/inter.css");');
  assert.equal(importRule('/work/fonts/inter/inter.css'), '@import url("/work/fonts/inter/inter.css");');
});

test('addFontToProject downloads the chosen faces and writes a stylesheet', async () => {
  const fs = await import('fs');
  const os = await import('os');
  const path = await import('path');
  const { ui, editor } = await import('./vscodeStub');
  const { addFontToProject } = await import('../src/projectFonts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-project-'));
  try {
    const cdn = 'https://cdn.test/inter@latest';
    const downloaded: string[] = [];
    (globalThis as any).fetch = async (url: string) => {
      if (url.startsWith('https://api.fontsource.org/')) {
        const variant = (w: number, s: string) => Object.fromEntries(['latin', 'cyrillic'].map((sub) => [sub, { url: { woff2: `${cdn}/${sub}-${w}-${s}.woff2` } }]));
        return new Response(JSON.stringify({
          defSubset: 'latin', weights: [400, 700], unicodeRange: { latin: 'U+0000-00FF', cyrillic: 'U+0400-045F' },
          variants: { 400: { normal: variant(400, 'normal'), italic: variant(400, 'italic') }, 700: { normal: variant(700, 'normal') } },
        }));
      }
      downloaded.push(url);
      return new Response(new Uint8Array([1, 2, 3]));
    };
    ui.workspaceFolders = [{ uri: { fsPath: dir } }];
    // Picker 1 keeps the preselected weights, picker 2 the preselected subsets.
    let offered: string[] = [];
    ui.quickPicks.push((items) => { offered = items.map((i) => `${i.label}${i.picked ? '*' : ''}`); return items.filter((i) => i.picked); });
    ui.quickPicks.push((items) => items.filter((i) => i.picked));
    ui.infoAnswers.push('Insert @import');
    editor.open = true;
    editor.text = '';
    editor.selections = [[0, 0]];

    await addFontToProject({ label: 'Inter', source: 'google', location: 'inter', defSubset: 'latin' });

    assert.deepEqual(offered, ['400 italic', '400 normal*', '700 normal*']);
    assert.deepEqual(downloaded.sort(), [`${cdn}/latin-400-normal.woff2`, `${cdn}/latin-700-normal.woff2`]);
    const folder = path.join(dir, 'fonts', 'inter');
    assert.deepEqual(fs.readdirSync(folder).sort(), ['inter-latin-400-normal.woff2', 'inter-latin-700-normal.woff2', 'inter.css']);
    const css = fs.readFileSync(path.join(folder, 'inter.css'), 'utf8');
    assert.equal(css.match(/@font-face/g)?.length, 2);
    assert.match(css, /src: url\("\.\/inter-latin-700-normal\.woff2"\) format\("woff2"\);\n {2}unicode-range: U\+0000-00FF;/);
    assert.match(editor.text, /^@import url\(".*fonts\/inter\/inter\.css"\);$/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
