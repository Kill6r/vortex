import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/renderer/TweaksPage.jsx', import.meta.url), 'utf8');
const extra = readFileSync(new URL('../src/renderer/ExtraTweaksPage.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/renderer/v90.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/renderer/main.jsx', import.meta.url), 'utf8');

test('cada acceso de tweaks tiene una identidad de color distinta', () => {
  for (const name of ['windows', 'graphics', 'extras']) {
    assert.match(page, new RegExp(`v90-jump-${name}`));
    assert.match(css, new RegExp(`\\.v90-jump-${name}:hover`));
  }
  const backgrounds = ['windows', 'graphics', 'extras'].map(name => {
    const cssRule = css.match(new RegExp(`\\.v90-tweak-links \\.v90-jump-${name}:hover[^}]+`))?.[0];
    return cssRule?.match(/background:(#[a-fA-F0-9]{6})/)?.[1];
  });
  assert.equal(new Set(backgrounds).size, 3);
  assert.ok(backgrounds.every(Boolean));
});

test('secciones y tarjetas se diferencian por categoria sin brillo', () => {
  assert.match(css, /#tweaks-windows\{/);
  assert.match(css, /#tweaks-graphics\{/);
  assert.match(css, /#tweaks-extra\{/);
  assert.match(extra, /data-category=\{tweak\.category\}/);
  assert.match(css, /data-category="Personalizacion"/);
  assert.match(css, /data-category="Escritorio"/);
  assert.match(css, /data-category="Juegos"/);
  assert.match(css, /data-category="Privacidad"/);
  assert.match(main, /import '\.\/v90\.css'/);
});
