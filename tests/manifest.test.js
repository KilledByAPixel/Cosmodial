import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// PNG pixel size lives in the IHDR chunk: width at byte 16, height at byte 20 (big-endian).
async function pngSize(url) {
  const buf = await readFile(url);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

test('manifest is valid, relatively scoped, and its icons exist at the declared sizes', async () => {
  const man = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(man.name, 'Cosmodial Sky Atlas');
  assert.equal(man.short_name, 'Cosmodial');
  assert.equal(man.start_url, './', 'relative start_url survives the GitHub Pages subpath');
  assert.equal(man.scope, './', 'relative scope survives the GitHub Pages subpath');
  assert.equal(man.display, 'standalone');
  assert.equal(man.background_color, '#000000');
  assert.equal(man.theme_color, '#000000');
  assert.ok(man.description && man.description.length > 20, 'has a real description');

  assert.ok(man.icons.length >= 3, 'regular 192 + 512 and a maskable variant');
  const purposes = man.icons.map((i) => i.purpose ?? 'any');
  assert.ok(purposes.includes('maskable'), 'one icon is declared maskable');
  for (const icon of man.icons) {
    assert.match(icon.src, /^\.\//, `icon src ${icon.src} is relative`);
    const declared = Number(icon.sizes.split('x')[0]);
    const { w, h } = await pngSize(new URL(`../${icon.src}`, import.meta.url));
    assert.equal(w, declared, `${icon.src} width matches declared ${icon.sizes}`);
    assert.equal(h, declared, `${icon.src} height matches declared ${icon.sizes}`);
  }
});

test('index.html links the manifest, theme color, and apple-touch icon', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(html, /<meta name="theme-color" content="#000000"/);
  assert.match(html, /<link rel="apple-touch-icon" href="\.\/images\/apple-touch-icon\.png"/);
});
