import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { familyAtCursor, parseFamilies } from '../src/cursorFont';

test('parseFamilies drops quotes, generic families and variables', () => {
  assert.deepEqual(parseFamilies(`"Playfair Display", 'Times New Roman', serif`), ['Playfair Display', 'Times New Roman']);
  assert.deepEqual(parseFamilies('var(--bs-font), system-ui, -apple-system, Roboto !important'), ['Roboto']);
  assert.deepEqual(parseFamilies('sans-serif'), []);
});

test('familyAtCursor reads CSS, shorthand, JS and markup', () => {
  assert.equal(familyAtCursor('  font-family: "Inter", sans-serif;', 3), 'Inter');
  assert.equal(familyAtCursor('h1 { font: 700 2rem/1.1 "Lora", serif; }', 0), 'Lora');
  assert.equal(familyAtCursor(`  fontFamily: "'Source Serif 4', serif",`, 5), 'Source Serif 4');
  assert.equal(familyAtCursor('<p style="font-family: Merriweather">', 0), 'Merriweather');
  // two declarations: the one under the cursor wins
  const line = 'a { font-family: Lato } b { font-family: Oswald }';
  assert.equal(familyAtCursor(line, 8), 'Lato');
  assert.equal(familyAtCursor(line, 40), 'Oswald');
});

test('familyAtCursor falls back to the quoted string or word at the cursor', () => {
  assert.equal(familyAtCursor(`const heading = 'Bebas Neue';`, 20), 'Bebas Neue');
  assert.equal(familyAtCursor('fonts: Roboto and Inter', 20), 'Inter');
  assert.equal(familyAtCursor('   ', 1), undefined);
});
