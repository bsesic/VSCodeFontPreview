import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import './vscodeStub';
import { ICON_SETS, loadIcons, parseCodepoints, parseFontAwesome, parseIconCss } from '../src/iconSets';
import { Memento } from './vscodeStub';

test('parseIconCss reads minified and spaced rules with the prefix stripped', () => {
  const css = `.bi-123::before{content:"\\f67f"}.bi-alarm-fill::before { content: "\\f101"; }
    .ph.ph-acorn:before { content: "\\eb9a"; } .other-x::before{content:"\\e000"}`;
  assert.deepEqual(parseIconCss(css, 'bi-'), [
    { name: '123', code: 0xf67f },
    { name: 'alarm-fill', code: 0xf101 },
  ]);
  assert.deepEqual(parseIconCss(css, 'ph-'), [{ name: 'acorn', code: 0xeb9a }]);
});

test('parseFontAwesome keeps only free classic and brand icons', () => {
  const icons = parseFontAwesome({
    house: { unicode: 'f015', label: 'House', search: { terms: ['home'] }, familyStylesByLicense: { free: [{ family: 'classic', style: 'solid' }, { family: 'classic', style: 'regular' }] } },
    github: { unicode: 'f09b', familyStylesByLicense: { free: [{ family: 'classic', style: 'brands' }] } },
    'pro-only': { unicode: 'e000', familyStylesByLicense: { free: [] } },
    duotone: { unicode: 'e001', familyStylesByLicense: { free: [{ family: 'duotone', style: 'solid' }] } },
  });
  assert.deepEqual(icons, [
    { name: 'house', code: 0xf015, styles: ['solid', 'regular'], terms: ['home', 'house'] },
    { name: 'github', code: 0xf09b, styles: ['brands'], terms: [] },
  ]);
});

test('parseCodepoints reads name/hex lines', () => {
  assert.deepEqual(parseCodepoints('10k e951\nhome e88a\n\n'), [
    { name: '10k', code: 0xe951 },
    { name: 'home', code: 0xe88a },
  ]);
});

test('loadIcons caches pinned versions and falls back to the cache', async () => {
  const set = ICON_SETS.find((s) => s.id === 'bootstrap')!;
  const state = new Memento();
  let calls = 0;
  (globalThis as any).fetch = async () => {
    calls++;
    return new Response('.bi-b::before{content:"\\f102"}.bi-a::before{content:"\\f101"}');
  };
  const icons = await loadIcons(state as any, set);
  assert.deepEqual(icons.map((i) => i.name), ['a', 'b'], 'sorted by name');
  await loadIcons(state as any, set);
  assert.equal(calls, 1);
  (globalThis as any).fetch = async () => new Response('', { status: 503 });
  assert.equal((await loadIcons(state as any, set, true)).length, 2);
  await assert.rejects(loadIcons(new Memento() as any, set), /Bootstrap Icons: 503/);
});

test('every icon set defines styles, stylesheets and an html template', () => {
  for (const set of ICON_SETS) {
    assert.ok(set.css.length && set.styles.length, set.id);
    for (const style of set.styles) {
      assert.match(style.html, /\{name\}/, `${set.id}/${style.id}`);
    }
  }
});
