const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const nav = require(path.join(ROOT, 'shared/site-nav.js'));
const pages = [
  { file: 'write.html', id: 'dog-watcher', shared: 'shared/site-nav.js' },
  { file: 'themes/meadow/index.html', id: 'meadow', shared: '../../shared/site-nav.js' }
];
const local = (p) => path.join(ROOT, p);
const exists = (p) => fs.existsSync(local(p));
const source = (p) => fs.readFileSync(local(p), 'utf8');

assert.equal(nav.folders.length, 2);
assert.deepEqual(nav.folders.map((f) => f.label), ['码字主题', '其他']);
assert.deepEqual(nav.folders.flatMap((f) => f.items.map((i) => i.title)), ['风吹草低', '狗狗督查']);
for (const folder of nav.folders) for (const item of folder.items) {
  assert.match(item.href, /^(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\/$|^[a-z0-9_-]+\.html$/i);
  assert.ok(exists(item.href.replace(/\/$/, '/index.html')), `missing route: ${item.href}`);
}

for (const page of pages) {
  const html = source(page.file);
  assert.match(html, new RegExp(`<body[^>]*data-page-id=["']${page.id}["']`));
  assert.match(html, new RegExp(`(?:href|src)=["']${page.shared.replaceAll('/', '\\/')}\\?v=14["']`));
  assert.match(html, /class=["']site-nav["']/);
  assert.match(html, new RegExp(`<title>[^<]*(?:${page.id === 'meadow' ? '风吹草低' : '狗狗督查'})`));
}

const meadow = source('themes/meadow/index.html');
assert.match(meadow, /assets\/stats-visual\.gif/);
assert.ok(exists('themes/meadow/assets/stats-visual.gif'));
const assetRefs = [...meadow.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)].map((m) => m[1]);
for (const ref of assetRefs.filter((ref) => !/^(?:https?:|data:|#)/.test(ref))) {
  assert.ok(fs.existsSync(path.resolve(local('themes/meadow'), ref)), `missing meadow asset: ${ref}`);
}
for (const file of ['shared/site-nav.js', 'themes/meadow/app.js', 'themes/meadow/wind.js', 'themes/meadow/wind-model.js']) {
  new vm.Script(source(file), { filename: file });
}

function navUrls(pagePath) {
  const scriptUrl = new URL(pagePath === 'write.html'
    ? 'https://moomin121.github.io/dog-watcher/shared/site-nav.js?v=14'
    : 'https://moomin121.github.io/dog-watcher/themes/meadow/../../shared/site-nav.js?v=14');
  const root = new URL('../', scriptUrl);
  return nav.folders.flatMap((f) => f.items.map((i) => new URL(i.href, root).href));
}
const expected = [
  'https://moomin121.github.io/dog-watcher/themes/meadow/',
  'https://moomin121.github.io/dog-watcher/write.html'
];
for (const page of pages) assert.deepEqual(navUrls(page.file), expected);

console.log('PASS: shared navigation config and routes');
console.log('PASS: both pages mount the same navigation and page ids');
console.log('PASS: meadow local assets and JavaScript syntax');
console.log('PASS: GitHub Pages root URL resolution from both page depths');
