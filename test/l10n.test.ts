import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

const root = path.join(__dirname, '..', '..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { extract, template, TEMPLATE } = require(path.join(root, 'scripts', 'extract-l10n.js'));

export const LANGUAGES = ['de', 'fr', 'es', 'it', 'pt-br', 'ja', 'ko', 'zh-cn', 'zh-tw', 'ru', 'pl', 'cs', 'tr'];

const read = (file: string): Record<string, string> => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const placeholders = (text: string) => (text.match(/\{\d+\}/g) ?? []).sort();
const brackets = (text: string) => [(text.match(/</g) ?? []).length, (text.match(/>/g) ?? []).length];

test('the English template is up to date (npm run l10n)', () => {
  assert.equal(fs.readFileSync(TEMPLATE, 'utf8'), template(extract(root)));
});

const english = read('l10n/bundle.l10n.json');
const nls = read('package.nls.json');

for (const lang of LANGUAGES) {
  test(`${lang}: every text is translated with the same placeholders`, () => {
    const bundle = read(`l10n/bundle.l10n.${lang}.json`);
    assert.deepEqual(Object.keys(bundle), Object.keys(english), 'same keys in the same order');
    for (const [key, value] of Object.entries(bundle)) {
      assert.ok(value.trim(), `empty translation for "${key}"`);
      assert.deepEqual(placeholders(value), placeholders(key), `placeholders of "${key}"`);
      assert.deepEqual(brackets(value), brackets(key), `<…> markers of "${key}"`);
    }
  });

  test(`${lang}: package.nls is complete`, () => {
    const translated = read(`package.nls.${lang}.json`);
    assert.deepEqual(Object.keys(translated).sort(), Object.keys(nls).sort());
    for (const [key, value] of Object.entries(translated)) {
      assert.ok(value.trim(), `empty translation for ${key}`);
    }
  });
}

test('package.json uses only keys defined in package.nls.json', () => {
  const manifest = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  for (const [, key] of manifest.matchAll(/"%([\w.]+)%"/g)) {
    assert.ok(key in nls, `missing package.nls key ${key}`);
  }
});
