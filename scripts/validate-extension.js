const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const jsonAssets = [
  'package.json',
  'language-configuration.json',
  'syntaxes/objectpascal.tmLanguage.json',
  'schemas/nik-yaml.schema.json'
];

for (const rel of jsonAssets) {
  const full = path.join(rootDir, rel);
  assert.ok(fs.existsSync(full), `Missing extension asset: ${rel}`);
  const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
  assert.ok(parsed && typeof parsed === 'object', `Invalid JSON object in: ${rel}`);
  console.log(`[PASS] Parsed ${rel}`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
assert.strictEqual(pkg.main, './dist/extension.js', 'package.json main must point to ./dist/extension.js');
assert.strictEqual(pkg.icon, 'images/icon.png', 'package.json icon must point to images/icon.png');

const brandAssets = [
  'images/icon.png',
  'images/file-icon-light.svg',
  'images/file-icon-dark.svg',
  'images/nikrun-icons.woff'
];
for (const rel of brandAssets) {
  const full = path.join(rootDir, rel);
  assert.ok(fs.existsSync(full), `Missing synced brand asset: ${rel}`);
  assert.ok(fs.statSync(full).size > 128, `Brand asset unexpectedly small: ${rel}`);
  console.log(`[PASS] Verified ${rel}`);
}

const bundlePath = path.join(rootDir, 'dist', 'extension.js');
assert.ok(fs.existsSync(bundlePath), 'Bundled dist/extension.js does not exist');
const bundleStat = fs.statSync(bundlePath);
assert.ok(bundleStat.size > 1024, 'Bundled dist/extension.js is unexpectedly small');
console.log(`[PASS] Verified bundle dist/extension.js (${Math.round(bundleStat.size / 1024)} KB)`);
